import { google } from 'googleapis';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token storage path
const TOKEN_PATH = path.join(__dirname, 'token.json');

/**
 * Create an OAuth2 client with the given credentials
 */
function createOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('Missing required Google Calendar credentials in .env file');
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Load previously saved credentials if they exist
 */
async function loadSavedCredentials() {
  try {
    if (!existsSync(TOKEN_PATH)) {
      return null;
    }
    const content = await fs.readFile(TOKEN_PATH, 'utf8');
    const credentials = JSON.parse(content);
    return credentials;
  } catch (err) {
    return null;
  }
}

/**
 * Save credentials to a file
 */
async function saveCredentials(tokens) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

/**
 * Get authorization URL for user to grant access
 */
export function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  return authUrl;
}

/**
 * Exchange authorization code for tokens
 */
export async function authorizeWithCode(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  await saveCredentials(tokens);
  return tokens;
}

/**
 * Get authorized calendar client
 */
export async function getCalendarClient() {
  const oauth2Client = createOAuth2Client();

  // Try to load saved credentials
  const credentials = await loadSavedCredentials();

  if (!credentials) {
    throw new Error('No credentials found. Please run the authorization flow first.');
  }

  oauth2Client.setCredentials(credentials);

  // Refresh token if needed
  if (credentials.expiry_date && credentials.expiry_date < Date.now()) {
    try {
      const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
      await saveCredentials(newCredentials);
      oauth2Client.setCredentials(newCredentials);
    } catch (err) {
      throw new Error('Token refresh failed. Please re-authorize the application.');
    }
  }

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Check if we have valid credentials
 */
export async function hasValidCredentials() {
  return existsSync(TOKEN_PATH);
}

/**
 * Get calendar events for today only
 */
export async function getTodayEvents() {
  const calendar = await getCalendarClient();

  // Calculate date range for today (start of day to end of day)
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

/**
 * Get calendar events for next month
 */
export async function getNextMonthEvents() {
  const calendar = await getCalendarClient();

  // Calculate date range from now through next 60 days
  const now = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 60);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: endDate.toISOString(),
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

/**
 * Format events for display
 */
export function formatEvents(events) {
  if (events.length === 0) {
    return 'No upcoming events found in the next 60 days.';
  }

  let output = `📅 Upcoming Calendar Events (${events.length} events)\n`;
  output += '─'.repeat(70) + '\n\n';

  events.forEach((event, index) => {
    const start = event.start.dateTime || event.start.date;
    const end = event.end.dateTime || event.end.date;
    const startDate = new Date(start);

    // Format date and time
    const dateStr = startDate.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    let timeStr = '';
    if (event.start.dateTime) {
      const startTime = startDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const endDate = new Date(end);
      const endTime = endDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      timeStr = ` ${startTime} - ${endTime}`;
    } else {
      timeStr = ' (All day)';
    }

    output += `${index + 1}. ${event.summary || 'Untitled Event'}\n`;
    output += `   📍 ${dateStr}${timeStr}\n`;

    if (event.location) {
      output += `   🗺️  ${event.location}\n`;
    }

    // Display attendees information
    if (event.attendees && event.attendees.length > 0) {
      const acceptedCount = event.attendees.filter(a => a.responseStatus === 'accepted').length;
      const totalCount = event.attendees.length;
      output += `   👥 ${acceptedCount} joined / ${totalCount} invited\n`;
    }

    if (event.description) {
      const desc = event.description.substring(0, 100);
      output += `   📝 ${desc}${event.description.length > 100 ? '...' : ''}\n`;
    }

    output += '\n';
  });

  return output;
}
