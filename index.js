import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';

async function main() {
  try {
    console.log('🎯 Starting Locus Claude SDK application...\n');

    // 1. Configure MCP connection to Locus
    console.log('Configuring Locus MCP connection...');
    const mcpServers = {
      'locus': {
        type: 'http',
        url: 'https://mcp.paywithlocus.com/mcp',
        headers: {
          'Authorization': `Bearer ${process.env.LOCUS_API_KEY}`
        }
      }
    };

    const options = {
      mcpServers,
      allowedTools: [
        'mcp__locus__*',      // Allow all Locus tools
        'mcp__list_resources',
        'mcp__read_resource'
      ],
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Auto-approve Locus tool usage
      canUseTool: async (toolName, input) => {
        if (toolName.startsWith('mcp__locus__')) {
          return {
            behavior: 'allow',
            updatedInput: input
          };
        }
        return {
          behavior: 'deny',
          message: 'Only Locus tools are allowed'
        };
      }
    };

    console.log('✓ MCP configured\n');

    // 2. Run a query that uses MCP tools
    console.log('Running sample query...\n');
    console.log('─'.repeat(50));

    let mcpStatus = null;
    let finalResult = null;

    for await (const message of query({
      prompt: 'What tools are available from Locus? Please list them.',
      options
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        // Check MCP connection status
        const mcpServersInfo = message.mcp_servers;
        mcpStatus = mcpServersInfo?.find(s => s.name === 'locus');
        if (mcpStatus?.status === 'connected') {
          console.log(`✓ Connected to Locus MCP server\n`);
        } else {
          console.warn(`⚠️  MCP connection issue\n`);
        }
      } else if (message.type === 'result' && message.subtype === 'success') {
        finalResult = message.result;
      }
    }

    console.log('Response:', finalResult);
    console.log('─'.repeat(50));
    console.log('\n✓ Query completed successfully!');

    console.log('\n🚀 Your Locus application is working!');
    console.log('\nNext steps:');
    console.log('  • Modify the prompt in index.js to use Locus tools');
    console.log('  • Try asking Claude to use specific Locus tools');
    console.log('  • Explore MCP resources and capabilities\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nPlease check:');
    console.error('  • Your .env file contains valid credentials');
    console.error('  • Your network connection is active');
    console.error('  • Your Locus and Anthropic API keys are correct\n');
    process.exit(1);
  }
}

main();
