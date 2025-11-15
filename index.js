import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import readline from 'readline';
import {
  hasValidCredentials,
  getAuthUrl,
  authorizeWithCode,
  getTodayEvents,
  formatEvents
} from './calendar.js';
import { initializeEmailIntegration } from './buy_client.js';

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
 * Pick an action based on calendar event metadata using Claude SDK
 * @param {Array} events - Today's calendar events
 * @returns {Promise<Object|null>} - Suggested action or null if no events
 */
async function pickActionFromEvents(events) {
  console.log('🤔 Step 3: Analyzing events to pick an action...');

  if (!events || events.length === 0) {
    console.log('   ℹ️  No events today, no action needed');
    return null;
  }

  console.log('   🤖 Calling Claude SDK to analyze events...');

  const prompt = `You are an assistant that analyzes calendar events and suggests actions.

Based on the following calendar events, decide what action to take.

Available actions:
- buy_boba: Purchase boba tea (can include location, drink, time, eventId)

Calendar Events:
${JSON.stringify(events, null, 2)}

IMPORTANT: Respond with ONLY a valid JSON object. Do not include markdown code blocks, explanations, or any other text. Just the raw JSON.

If you recommend an action, return this exact format:
{
  "action": "buy_boba",
  "location": "store name",
  "drink": "drink type",
  "time": "when to buy",
  "eventId": "related event id if applicable"
}

If no action is needed, return:
{
  "action": "none"
}`;

  try {
    let claudeResult = null;

    for await (const message of query({
      prompt,
      options: {
        apiKey: process.env.ANTHROPIC_API_KEY
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        claudeResult = message.result;
      }
    }

    console.log('   📝 Raw Claude response:', JSON.stringify(claudeResult));

    if (!claudeResult) {
      console.log('   ℹ️  No response from Claude');
      return null;
    }

    // Parse the result
    let action = null;

    if (typeof claudeResult === 'object' && claudeResult !== null) {
      // Already an object
      action = claudeResult;
    } else if (typeof claudeResult === 'string') {
      // Try to extract JSON from string (handle markdown code blocks)
      let jsonString = claudeResult.trim();

      // Remove markdown code blocks if present
      jsonString = jsonString.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

      // Try to parse
      try {
        action = JSON.parse(jsonString);
      } catch (e) {
        console.log('   ⚠️  Could not parse Claude response as JSON');
        console.log('   📄 Response was:', claudeResult);
        return null;
      }
    }

    if (!action || action.action === 'none') {
      console.log('   ℹ️  No action suggested by Claude');
      return null;
    }

    console.log('   ✓ Claude SDK returned action suggestion:', action.action);

    // Add eventSummary for display purposes
    if (action.eventId) {
      const event = events.find(e => e.id === action.eventId);
      if (event) {
        action.eventSummary = event.summary;
      }
    }

    return action;
  } catch (error) {
    console.error('   ❌ Error calling Claude SDK:', error.message);
    return null;
  }
}

/**
 * Prompt user for confirmation (y/n)
 * @param {string} question - The question to ask
 * @returns {Promise<boolean>} - true if user confirms, false otherwise
 */
function promptUserConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question + ' (y/n): ', (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes';
      resolve(confirmed);
    });
  });
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
    console.log('═'.repeat(70));

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Connect to Google Calendar
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n📅 Step 1: Connecting to Google Calendar...');
    const hasCredentials = await hasValidCredentials();
    if (!hasCredentials) {
      console.log('   ⚠️  No credentials found, starting auth flow...');
      await handleCalendarAuth();
      console.log('   ✓ Successfully connected to Google Calendar');
    } else {
      console.log('   ✓ Already connected to Google Calendar');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Query events that are today
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n🗓️  Step 2: Querying today\'s calendar events...');
    const todayEvents = await getTodayEvents();
    console.log(`   ✓ Found ${todayEvents.length} event(s) today`);

    if (todayEvents.length > 0) {
      console.log('\n   Today\'s Events:');
      todayEvents.forEach((event, index) => {
        const start = event.start.dateTime || event.start.date;
        const startDate = new Date(start);
        const timeStr = event.start.dateTime
          ? startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          : 'All day';
        console.log(`   ${index + 1}. ${event.summary || 'Untitled'} (${timeStr})`);
        if (event.location) {
          console.log(`      📍 ${event.location}`);
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Pick an action using calendar event metadata
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n');
    const suggestedAction = await pickActionFromEvents(todayEvents);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Print events and suggest user to input y/n to the action
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n💭 Step 4: Presenting action suggestion to user...');

    if (!suggestedAction) {
      console.log('   ℹ️  No action suggested - continuing to Locus MCP');
    } else {
      console.log('\n   Suggested Action:');
      console.log('   ┌' + '─'.repeat(68) + '┐');
      console.log(`   │ Action: ${suggestedAction.action.toUpperCase().padEnd(59)}│`);
      console.log(`   │ Event:  ${(suggestedAction.eventSummary || 'N/A').padEnd(59)}│`);
      console.log(`   │ Location: ${(suggestedAction.location || 'N/A').padEnd(57)}│`);
      console.log(`   │ Time: ${(suggestedAction.time || 'N/A').padEnd(61)}│`);
      console.log('   └' + '─'.repeat(68) + '┘');

      console.log('\n');
      const userConfirmed = await promptUserConfirmation('   Do you want to proceed with this action?');

      if (userConfirmed) {
        console.log('   ✓ User confirmed - executing action...\n');
        const actionResult = await executeAction(suggestedAction, todayEvents);
        if (actionResult) {
          console.log('   ✓ Action executed successfully');
        }
      } else {
        console.log('   ✗ User declined - skipping action');
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: [To be added later]
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n📝 Step 5: [Placeholder for future functionality]');
    console.log('   ℹ️  This step will be implemented later');
    // TODO: Add additional logic here as needed
    // This could include:
    // - Additional event processing
    // - Email integration
    // - Notification sending
    // - Custom business logic

    // ═══════════════════════════════════════════════════════════════════
    // STEP 6: Connect to Locus MCP
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n🔌 Step 6: Connecting to Locus MCP...');

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

    console.log('   ✓ MCP configuration created');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 7: Remaining LOCUS logic
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n🚀 Step 7: Executing Locus MCP query...');
    console.log('   Querying available Locus tools...\n');
    console.log('   ' + '─'.repeat(66));

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
          console.log('   ✓ Successfully connected to Locus MCP server');
        } else {
          console.warn('   ⚠️  MCP connection issue - check configuration');
        }
      } else if (message.type === 'result' && message.subtype === 'success') {
        finalResult = message.result;
      }
    }

    console.log('\n   Response from Locus:');
    console.log('   ' + finalResult);
    console.log('   ' + '─'.repeat(66));
    console.log('   ✓ Locus query completed successfully');

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('✅ All steps completed successfully!');
    console.log('\n🚀 Your Locus application is working!');
    console.log('\nNext steps:');
    console.log('  • Modify the prompts to use specific Locus tools');
    console.log('  • Add more action types based on calendar events');
    console.log('  • Implement Step 5 with custom logic');
    console.log('  • Explore MCP resources and capabilities\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nPlease check:');
    console.error('  • Your .env file contains valid credentials');
    console.error('  • Your network connection is active');
    console.error('  • Your Locus and Anthropic API keys are correct\n');
    process.exit(1);
  }
}

main();
