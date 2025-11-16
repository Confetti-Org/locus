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
      'https://www.googleapis.com/auth/gmail.readonly'
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
 * Decode base64url encoded string
 */
function decodeBase64Url(data) {
  if (!data) return '';

  // Replace URL-safe characters and add padding
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  const paddedBase64 = padding ? base64 + '='.repeat(4 - padding) : base64;

  // Decode from base64
  return Buffer.from(paddedBase64, 'base64').toString('utf-8');
}

/**
 * Extract body content from Gmail message payload
 */
function extractMessageBody(payload) {
  let textContent = '';
  let htmlContent = '';

  // Helper function to recursively extract body from parts
  function extractFromParts(parts) {
    if (!parts) return;

    for (const part of parts) {
      const mimeType = part.mimeType;

      // If this part has nested parts, recurse
      if (part.parts) {
        extractFromParts(part.parts);
        continue;
      }

      // Extract body data
      if (part.body && part.body.data) {
        const decodedContent = decodeBase64Url(part.body.data);

        if (mimeType === 'text/plain') {
          textContent += decodedContent;
        } else if (mimeType === 'text/html') {
          htmlContent += decodedContent;
        }
      }
    }
  }

  // Check if body is directly in payload
  if (payload.body && payload.body.data) {
    const decodedContent = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/plain') {
      textContent = decodedContent;
    } else if (payload.mimeType === 'text/html') {
      htmlContent = decodedContent;
    }
  }

  // Check for parts (multipart messages)
  if (payload.parts) {
    extractFromParts(payload.parts);
  }

  // Return text content if available, otherwise return HTML (with a note)
  if (textContent) {
    return textContent;
  } else if (htmlContent) {
    // Basic HTML stripping for plain text display
    const strippedHtml = htmlContent
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return strippedHtml;
  }

  return '(No text content found)';
}

/**
 * Get full content of a specific email by ID
 */
export async function getEmailContent(messageId) {
  const gmail = await getGmailClient();

  const message = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const email = message.data;
  const headers = email.payload.headers;

  return {
    id: email.id,
    subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
    from: headers.find(h => h.name === 'From')?.value || 'Unknown Sender',
    to: headers.find(h => h.name === 'To')?.value || 'Unknown Recipient',
    date: headers.find(h => h.name === 'Date')?.value || 'Unknown Date',
    snippet: email.snippet || '',
    body: extractMessageBody(email.payload)
  };
}

/**
 * Get the most recent email content from inbox
 */
export async function getMostRecentEmailContent() {
  const gmail = await getGmailClient();

  // Fetch just the most recent message
  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 1,
    q: 'in:inbox'
  });

  const messages = response.data.messages || [];

  if (messages.length === 0) {
    return null;
  }

  // Get full content of the most recent message
  return await getEmailContent(messages[0].id);
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

/**
 * Format a single email with full content for display
 */
export function formatEmailContent(email) {
  if (!email) {
    return 'No email found.';
  }

  let output = '📧 Email Content\n';
  output += '─'.repeat(70) + '\n\n';
  output += `Subject: ${email.subject}\n`;
  output += `From: ${email.from}\n`;
  output += `To: ${email.to}\n`;
  output += `Date: ${email.date}\n`;
  output += '\n' + '─'.repeat(70) + '\n\n';
  output += email.body;
  output += '\n\n' + '─'.repeat(70) + '\n';

  return output;
}
