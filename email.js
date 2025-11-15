import { google } from 'googleapis';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Separate token storage path for email
const EMAIL_TOKEN_PATH = path.join(__dirname, 'email-token.json');

/**
 * Create an OAuth2 client with the given credentials
 */
function createOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('Missing required Google credentials in .env file');
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Load previously saved email credentials if they exist
 */
async function loadSavedEmailCredentials() {
  try {
    if (!existsSync(EMAIL_TOKEN_PATH)) {
      return null;
    }
    const content = await fs.readFile(EMAIL_TOKEN_PATH, 'utf8');
    const credentials = JSON.parse(content);
    return credentials;
  } catch (err) {
    return null;
  }
}

/**
 * Save email credentials to a file
 */
async function saveEmailCredentials(tokens) {
  await fs.writeFile(EMAIL_TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

/**
 * Get authorization URL for user to grant email access
 */
export function getEmailAuthUrl() {
  const oauth2Client = createOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.metadata'
    ],
  });
  return authUrl;
}

/**
 * Exchange authorization code for email tokens
 */
export async function authorizeEmailWithCode(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  await saveEmailCredentials(tokens);
  return tokens;
}

/**
 * Get authorized Gmail client
 */
export async function getGmailClient() {
  const oauth2Client = createOAuth2Client();

  // Try to load saved credentials
  const credentials = await loadSavedEmailCredentials();

  if (!credentials) {
    throw new Error('No email credentials found. Please run the email authorization flow first.');
  }

  oauth2Client.setCredentials(credentials);

  // Refresh token if needed
  if (credentials.expiry_date && credentials.expiry_date < Date.now()) {
    try {
      const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
      await saveEmailCredentials(newCredentials);
      oauth2Client.setCredentials(newCredentials);
    } catch (err) {
      throw new Error('Email token refresh failed. Please re-authorize the application.');
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Check if we have valid email credentials
 */
export async function hasValidEmailCredentials() {
  return existsSync(EMAIL_TOKEN_PATH);
}

/**
 * Get recent emails (default: 10)
 */
export async function getRecentEmails(maxResults = 10) {
  const gmail = await getGmailClient();

  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'in:inbox' // Only fetch inbox emails
  });

  const messages = response.data.messages || [];

  // Fetch full details for each message
  const emailDetails = await Promise.all(
    messages.map(async (message) => {
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });
      return details.data;
    })
  );

  return emailDetails;
}

/**
 * Format emails for display
 */
export function formatEmails(emails) {
  if (emails.length === 0) {
    return 'No emails found in inbox.';
  }

  let output = `📧 Recent Emails (${emails.length} emails)\n`;
  output += '─'.repeat(70) + '\n\n';

  emails.forEach((email, index) => {
    const headers = email.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
    const date = headers.find(h => h.name === 'Date')?.value || 'Unknown Date';
    const snippet = email.snippet || '';

    output += `${index + 1}. ${subject}\n`;
    output += `   📤 From: ${from}\n`;
    output += `   📅 Date: ${date}\n`;
    output += `   📝 Preview: ${snippet.substring(0, 100)}${snippet.length > 100 ? '...' : ''}\n`;
    output += '\n';
  });

  return output;
}
