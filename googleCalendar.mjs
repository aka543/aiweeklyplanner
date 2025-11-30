import fs from 'fs/promises';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import http from 'http';
import open from 'open';
import path from 'path';
import process from 'process';
import destroyer from 'server-destroy';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

async function loadSavedCredentialsIfExist() {
  return null;
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    const credentials = JSON.parse(content);

    const client = new OAuth2Client(
      credentials.client_id,
      credentials.client_secret
    );

    client.setCredentials({
      refresh_token: credentials.refresh_token,
    });

    return client;
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
  const keys = JSON.parse(content).installed;

  const payload = {
    type: 'authorized_user',
    client_id: keys.client_id,
    client_secret: keys.client_secret,
    refresh_token: client.credentials.refresh_token,
  };

  await fs.writeFile(TOKEN_PATH, JSON.stringify(payload));
}

async function authenticateManually() {
  const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
  const keys = JSON.parse(content).installed;

  const oAuth2Client = new OAuth2Client(
    keys.client_id,
    keys.client_secret,
    keys.redirect_uris[0]
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  const server = http.createServer(async (req, res) => {
    if (req.url.indexOf('/?code=') > -1) {
      const url = new URL(req.url, 'http://localhost:3000');
      const code = url.searchParams.get('code');
      res.end('Authentication successful! You can close this window.');
      server.destroy();

      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
    }
  }).listen(3000, () => {
    open(authUrl, { wait: false }).then(cp => cp.unref());
  });

  destroyer(server);

  return new Promise(resolve => {
    server.on('close', () => {
      resolve(oAuth2Client);
    });
  });
}

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }

  client = await authenticateManually();
  if (client.credentials.refresh_token) {
    await saveCredentials(client);
  } else {
    console.warn("⚠️ No refresh token received. You may need to delete token.json and retry.");
  }

  return client;
}

async function listEvents(auth) {
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(now.getDate() + 7);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: nextWeek.toISOString(), // ⬅️ LIMIT to 1 week from now
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items;
  if (!events || events.length === 0) {
    console.log('No upcoming events found.');
    return;
  }

  console.log('Upcoming 1 week of events:');
  events.forEach((event) => {
    const start = event.start.dateTime || event.start.date;
    console.log(`${start} - ${event.summary}`);
  });
}

async function createEvent(auth) {
  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary: 'Meet Node.js Expert',
    location: 'Online',
    description: 'Discuss calendar integration',
    start: {
      dateTime: '2025-07-16T10:00:00+02:00',
      timeZone: 'Europe/Prague',
    },
    end: {
      dateTime: '2025-07-16T11:00:00+02:00',
      timeZone: 'Europe/Prague',
    },
    colorId: '5',
  };

  const res = await calendar.events.insert({
    calendarId: 'adam.bures.prg@gmail.com',
    requestBody: event,
  });

  console.log('✅ Event created:');
  console.log(res.data.htmlLink);
}

async function listCalendars(auth) {
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.calendarList.list();
  res.data.items.forEach(cal => {
    console.log(`${cal.summary} (ID: ${cal.id})`);
  });
}
// Run the main flow
(async () => {
  try {
    const auth = await authorize();
    await listEvents(auth);
    await createEvent(auth);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();

