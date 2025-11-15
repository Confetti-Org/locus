import 'dotenv/config';
import readline from 'readline';
import {
  hasValidEmailCredentials,
  getEmailAuthUrl,
  authorizeEmailWithCode,
  getRecentEmails,
  formatEmails
} from './email.js';

/**
 * Handle Gmail authorization flow
 */
export async function handleEmailAuth() {
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
 * Display recent emails
 */
export async function showRecentEmails() {
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
 * Initialize email integration - handles auth and fetches emails
 */
export async function initializeEmailIntegration() {
  // Check and handle Gmail authorization
  const hasEmailCredentials = await hasValidEmailCredentials();
  if (!hasEmailCredentials) {
    await handleEmailAuth();
  }

  // Display recent emails
  const emails = await showRecentEmails();
  return emails;
}

/**
 * Main function - runs when script is executed directly
 */
async function main() {
  try {
    console.log('🤖 Buy Client - Email Integration\n');
    console.log('─'.repeat(50));

    // Initialize email integration
    const emails = await initializeEmailIntegration();

    console.log('\n─'.repeat(50));
    console.log(`\n✓ Successfully fetched ${emails.length} emails!\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nPlease check:');
    console.error('  • Your .env file contains valid Google credentials');
    console.error('  • Your network connection is active\n');
    process.exit(1);
  }
}

// Run main function if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
