import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import readline from 'readline';
import {
  hasValidCredentials,
  getAuthUrl,
  authorizeWithCode,
  getNextMonthEvents,
  formatEvents
} from './calendar.js';

/**
 * Handle Google Calendar authorization flow
 */
async function handleCalendarAuth() {
  console.log('\n📅 Google Calendar Authorization Required\n');
  console.log('To authorize this app to access your Google Calendar:');
  console.log('1. Visit the following URL:');
  console.log('\n' + getAuthUrl() + '\n');
  console.log('2. Authorize the application');
  console.log('3. Copy the authorization code from the URL');
  console.log('4. Paste it below\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter authorization code: ', async (code) => {
      rl.close();
      try {
        await authorizeWithCode(code);
        console.log('\n✓ Authorization successful!\n');
        resolve();
      } catch (error) {
        console.error('\n❌ Authorization failed:', error.message);
        reject(error);
      }
    });
  });
}

/**
 * Display calendar events for next month
 */
async function showNextMonthEvents() {
  console.log('\n📅 Fetching upcoming calendar events...\n');

  try {
    const events = await getNextMonthEvents();
    const formattedEvents = formatEvents(events);
    console.log("🗓️ RAW PEW PEW:", events);
    console.log("🗓️ FORMATTED PEW PEW:", formattedEvents);
    return events
  } catch (error) {
    console.error('❌ Error fetching calendar events:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🎯 Starting Locus Claude SDK application...\n');

    // 1. Check and handle Google Calendar authorization
    const hasCredentials = await hasValidCredentials();
    if (!hasCredentials) {
      await handleCalendarAuth();
    }

    // 2. Display next month's calendar events
    const events = await showNextMonthEvents();

    // 3. Run custom Anthropic prompt (independent)
    // Customize your prompt here:
    const prompt = `Return an action from the following list: [{action: 'buy boba'}]. Use the following event metadata: ${JSON.stringify(events, null, 2)}`;

    // Notes (vicky): use the following metadata to tell david what to do
    console.log('─'.repeat(50));

    let customResult = null;

    for await (const message of query({
      prompt,
      options: {
        apiKey: process.env.ANTHROPIC_API_KEY
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        customResult = message.result;
      }
    }

    console.log('Response:', JSON.stringify(customResult, null, 2));
    console.log('─'.repeat(50));
    console.log('\n✓ Custom prompt completed!\n');

    // 4. Configure MCP connection to Locus
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

    // 4. Run a query that uses MCP tools
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
