import 'dotenv/config';
import fs from 'fs/promises';
// import { OAuth2Client } from 'google-auth-library'; // removed - using service account JWT
import { google } from 'googleapis';
import http from 'http';
import open from 'open';
import path from 'path';
import process, { exit } from 'process';
import destroyer from 'server-destroy';


class GoogleCalendar {
  constructor() {
    this.GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
    this.GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
    this.GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

    // this.SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
    this.SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/tasks'];
    this.auth = null;
  }

  async login() {
    if (!this.GOOGLE_CALENDAR_ID || !this.GOOGLE_PRIVATE_KEY || !this.GOOGLE_CLIENT_EMAIL) {
      throw new Error('Missing required env vars: GOOGLE_CALENDAR_ID, GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
    }

    this.auth = await this.#authorize();
    return this.auth;
  }

  async #authenticateWithServiceAccount() {
    console.log('[authenticateWithServiceAccount] Using service account from environment variables...');
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      throw new Error('Missing required env vars: GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
    }

    // In .env private key often contains literal '\n' sequences — convert them back to newlines
    const normalizedKey = privateKey.replace(/\\n/g, '\n');

    const jwtClient = new google.auth.JWT({
      email: clientEmail,
      key: normalizedKey,
      scopes: this.SCOPES,
    });

    try {
      // authorize() will verify the credentials (and populate tokens on the client)
      await jwtClient.authorize();
      console.log('[authenticateWithServiceAccount] Service account authenticated successfully.');
      return jwtClient;
    } catch (err) {
      console.error(`[authenticateWithServiceAccount] ❌ Authentication failed: ${err.message}`);
      throw err;
    }
  }

  async #authorize() {
    console.log('[authorize] Starting authorization process (service account)...');

    try {
      // Use service account authentication exclusively
      const client = await this.#authenticateWithServiceAccount();
      this.auth = client;
      console.log('[authorize] Authenticated with service account.');
      return client;
    } catch (err) {
      console.error(`[authorize] ❌ Service account authentication failed: ${err.message}`);
      throw err;
    }
  }

  async listEvents(numOfEvents = 10) {
    try {
      if(!this.auth) {
        throw new Error('No auth client available. Call login() first.');
      }

      const calendar = google.calendar({ version: 'v3', auth: this.auth });
      const res = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID,
        timeMin: (new Date()).toISOString(),
        maxResults: numOfEvents,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = res.data.items;
      if (!events || events.length === 0) {
        console.log('No upcoming events found.');
        return;
      }
      console.log('Upcoming 10 events:');
      events.map((event) => {
        const start = event.start.dateTime || event.start.date;
        console.log(`${start} - ${event.summary}`);
      });
    } catch (error) {
      console.error('Error listing events:', error);
    }
  }
  
  async listEventsAI(auth) {
    const usedAuth = this.auth || auth;
    if (!usedAuth) throw new Error('No auth client available. Call login() or pass auth.');
    const calendar = google.calendar({ version: 'v3', auth: usedAuth });

    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);
// 'd16af1522c1855ebb3da9355190697e13ca42d8ff0033da2bee4bde70b4c0bb1@group.calendar.google.com'
    const res = await calendar.events.list({
      calendarId: 'd16af1522c1855ebb3da9355190697e13ca42d8ff0033da2bee4bde70b4c0bb1@group.calendar.google.com',
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    

    const events = res.data.items;
    if (!events || events.length === 0) {
      console.log('No upcoming events found.');
      return;
    }
    const upcomingEvents = {};
    // console.log('Upcoming 1 week of events:');
    events.forEach((event) => {
      const start = event.start.dateTime || event.start.date;
      // console.log(`${start} - ${event.summary}`);
      upcomingEvents[event.start.dateTime || event.start.date] = {summary: event.summary, description: event.description, location: event.location};
    });
    return upcomingEvents;
  }
  async createEvent(event) {
    if (!this.auth) throw new Error('No auth client available. Call login() or pass auth.');
    const calendar = google.calendar({ version: 'v3', auth: this.auth });
    calendar.events.insert({
      calendarId: 'd16af1522c1855ebb3da9355190697e13ca42d8ff0033da2bee4bde70b4c0bb1@group.calendar.google.com',
      resource: event,
    });
    console.log('✅ Event created:');
    return 200;
    // console.log(res.data.htmlLink);
  }
  async createEvents(events) {
    if(events === 'plan already created') {
      console.log('Plan already created, skipping event creation');
      return 200;
    }
    if (!this.auth) throw new Error('No auth client available. Call login() or pass auth.');
    const calendar = google.calendar({ version: 'v3', auth: this.auth });

    events.forEach(async (event) => {
      await calendar.events.insert({
        calendarId: 'd16af1522c1855ebb3da9355190697e13ca42d8ff0033da2bee4bde70b4c0bb1@group.calendar.google.com',
        requestBody: event,
      });
    })
    console.log('[googleCl/createEvents] -> Events created');
    return 200;
  }
  async createTask(task) {
    if (!this.auth) {
        console.error('[createTask] No auth client available.');
        throw new Error('No auth client available. Call login() first.');
    }
    const tasksApi = google.tasks({ version: 'v1', auth: this.auth });
    try {
      const res = await tasksApi.tasks.insert({
        tasklist: 'MTE2ODkyMjIyMTM3NDE4NzE5MjA6MDow',
        requestBody: task
      });
      console.log('[createTask] task succesfuly inserted');
      
    }
    catch (err){
      console.error(`[createTask] ❌ Error creating task in task list "${tasklistId}": ${err.message}`);
      throw err;
    }
  }
  async listCalendars(auth) {
    const usedAuth = this.auth || auth;
    if (!usedAuth) throw new Error('[listCalendars] No auth client available. Call login() or pass auth.');
    const calendar = google.calendar({ version: 'v3', auth: usedAuth });
    const res = await calendar.calendarList.list();
    res.data.items.forEach(cal => {
      console.log(`${cal.summary} (ID: ${cal.id})`);
    });
  }
  async listTasks(numOfTasks = 10) {
    if (!this.auth) throw new Error('[listTasks] No auth client available. Call login() or pass auth.');
    const tasksApi = google.tasks({ version: 'v1', auth: this.auth });
    const res = await tasksApi.tasks.list({ tasklist: 'MTE2ODkyMjIyMTM3NDE4NzE5MjA6MDow' , maxResults: numOfTasks });
    const tasks = res.data.items;
    if (!tasks || tasks.length === 0) {
      console.log('[GCl/listTasks] -> No tasks found.');
      return [];
    }
    console.log('--- Google Tasks ---');
    let tasksFormed = {};
    tasks.forEach((task) => {
      console.log(`- ${task.title} (Due: ${task.due || 'N/A'}, Status: ${task.status}, ID: ${task.id})`);
      tasksFormed[task.title] = {notes: task.notes, due: task.due, status: task.status, completed: task.completed};
    })
    console.log(tasksFormed);
    return tasksFormed;

  }
  async listTaskLists() {
    if (!this.auth) {
        throw new Error('No auth client available. Call login() first.');
    }
    const tasksApi = google.tasks({ version: 'v1', auth: this.auth });

    try {
      const res = await tasksApi.tasklists.list();
      const taskLists = res.data.items;

      if (!taskLists || taskLists.length === 0) {
        console.log('No task lists found.');
        return [];
      }

      console.log('--- Google Task Lists ---');
      taskLists.forEach((list) => {
        console.log(`${list.title} (ID: ${list.id})`);
      });
      console.log('-------------------------');
      return taskLists;
    } catch (err) {
      console.error(`[listTaskLists] ❌ Error listing task lists: ${err.message}`);
      throw err;
    }
  }
  async main() {
    try {
      await this.login();
      await this.listEvents();
      await this.listTasks();
      
      // await this.createEvent();
    } catch (err) {
      console.error('❌ Error:', err.message);
    }
  }
}

let gc = new GoogleCalendar();
await gc.main();
export default GoogleCalendar;
