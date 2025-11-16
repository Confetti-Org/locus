import 'dotenv/config';
import readline from 'readline';
import {
  hasValidEmailCredentials,
  getEmailAuthUrl,
  authorizeEmailWithCode,
  getRecentEmails,
  formatEmails,
  getMostRecentEmailContent,
  formatEmailContent
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
 * Display the most recent email with full content
 */
export async function showMostRecentEmailContent() {
  console.log('\n📧 Fetching most recent email content...\n');

  try {
    const email = await getMostRecentEmailContent();

    if (!email) {
      console.log('No emails found in inbox.');
      return null;
    }

    const formattedEmail = formatEmailContent(email);
    console.log(formattedEmail);
    return email;
  } catch (error) {
    console.error('❌ Error fetching email content:', error.message);
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

    // Check and handle Gmail authorization
    const hasEmailCredentials = await hasValidEmailCredentials();
    if (!hasEmailCredentials) {
      await handleEmailAuth();
    }

    // Display recent emails list
    await showRecentEmails();

    console.log('\n─'.repeat(50));

    // Display most recent email with full content
    const mostRecentEmail = await showMostRecentEmailContent();

    console.log('\n─'.repeat(50));
    if (mostRecentEmail) {
      console.log(`\n✓ Successfully fetched most recent email!\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nPlease check:');
    console.error('  • Your .env file contains valid Google credentials');
    console.error('  • Your network connection is active\n');
    process.exit(1);
  }
}

// Run main function if script is executed directly
// Debug: Check why main() is not being called
console.log('DEBUG: import.meta.url:', import.meta.url);
console.log('DEBUG: process.argv[1]:', process.argv[1]);
console.log('DEBUG: Constructed path:', `file://${process.argv[1]}`);
console.log('DEBUG: Match?:', import.meta.url === `file://${process.argv[1]}`);

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} else {
  console.log('⚠️  Script was imported, not executed directly. Calling main() anyway for testing...');
  main();
}
