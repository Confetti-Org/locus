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
import {
  hasValidEmailCredentials,
  getEmailAuthUrl,
  authorizeEmailWithCode,
  getRecentEmails,
  formatEmails
} from './email.js';

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
 * Handle Gmail authorization flow
 */
async function handleEmailAuth() {
  console.log('\n📧 Gmail Authorization Required\n');
  console.log('To authorize this app to access your Gmail:');
  console.log('1. Visit the following URL:');
  console.log('\n' + getEmailAuthUrl() + '\n');
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
        await authorizeEmailWithCode(code);
        console.log('\n✓ Email authorization successful!\n');
        resolve();
      } catch (error) {
        console.error('\n❌ Email authorization failed:', error.message);
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

/**
 * Display recent emails
 */
async function showRecentEmails() {
  console.log('\n📧 Fetching recent emails...\n');

  try {
    const emails = await getRecentEmails(10);
    const formattedEmails = formatEmails(emails);
    console.log(formattedEmails);
    return emails;
  } catch (error) {
    console.error('❌ Error fetching emails:', error.message);
    throw error;
  }
}

/**
 * Execute action to buy_boba
 * @param {Object} params - Parameters for the boba purchase action
 * @param {string} params.location - Location/store for boba purchase
 * @param {string} params.drink - Type of boba drink
 * @param {string} params.time - Preferred time for purchase
 * @param {Object} params.event - Related calendar event metadata
 */
async function executeBuyBobaAction(params = {}) {
  console.log('\n🧋 Executing Buy Boba Action...\n');
  console.log('─'.repeat(50));

  // Log the action parameters
  if (params.location) {
    console.log(`📍 Location: ${params.location}`);
  }
  if (params.drink) {
    console.log(`🥤 Drink: ${params.drink}`);
  }
  if (params.time) {
    console.log(`⏰ Time: ${params.time}`);
  }
  if (params.event) {
    console.log(`📅 Related Event: ${params.event.summary || 'N/A'}`);
  }

  console.log('\n💡 Action Status: Ready to execute');
  console.log('─'.repeat(50));

  // TODO: Implement actual boba purchase logic here
  // This could involve:
  // - Making API calls to Locus for payment
  // - Ordering through a delivery service
  // - Setting reminders
  // - Adding to a shopping list

  return {
    status: 'success',
    action: 'buy_boba',
    params,
    timestamp: new Date().toISOString()
  };
}

/**
 * Action dispatcher - routes Claude's response to the appropriate action function
 * @param {Object|string} actionData - Action data from Claude (could be object or string)
 * @param {Array} events - Calendar events for context
 */
async function executeAction(actionData, events = []) {
  try {
    // Parse action if it's a string
    let action = actionData;
    if (typeof actionData === 'string') {
      try {
        action = JSON.parse(actionData);
      } catch (e) {
        console.log('⚠️  Could not parse action as JSON, treating as string');
        // Check if string contains action keyword
        if (actionData.toLowerCase().includes('buy_boba')) {
          action = { action: 'buy_boba' };
        } else {
          console.log('❌ Unknown action format');
          return null;
        }
      }
    }

    // Route to appropriate action handler
    const actionName = action.action?.toLowerCase().replace(/\s+/g, '_');

    switch (actionName) {
      case 'buy_boba':
        return await executeBuyBobaAction({
          location: action.location,
          time: action.time,
          event: action.eventId ? events.find(e => e.id === action.eventId) : events[0],
          ...action.params
        });

      // Add more actions here as needed
      default:
        console.log(`⚠️  Unknown action: ${actionName}`);
        return null;
    }
  } catch (error) {
    console.error('❌ Error executing action:', error.message);
    return null;
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

    // 2. Check and handle Gmail authorization
    const hasEmailCredentials = await hasValidEmailCredentials();
    if (!hasEmailCredentials) {
      await handleEmailAuth();
    }

    // 3. Display next month's calendar events
    const events = await showNextMonthEvents();

    // 4. Display recent emails
    const emails = await showRecentEmails();

    // 5. Run custom Anthropic prompt (independent)
    // Customize your prompt here:
    const prompt = `Based on the following calendar events, decide what action to take and return ONLY a JSON object.

Available actions:
- buy_boba: Purchase boba tea (can include location, drink, time, eventId)

Calendar Events:
${JSON.stringify(events, null, 2)}

Return format (JSON only, no extra text):
{
  "action": "buy_boba",
  "location": "store name",
  "drink": "drink type",
  "time": "when to buy",
  "eventId": "related event id if applicable"
}`;

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

    // Execute the action returned by Claude
    if (customResult) {
      const actionResult = await executeAction(customResult, events);
      if (actionResult) {
        console.log('✓ Action executed:', JSON.stringify(actionResult, null, 2));
      }
    }

    // 6. Configure MCP connection to Locus
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

    // 7. Run a query that uses MCP tools
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
