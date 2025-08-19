// ============================================================================
// NOTION TO GOOGLE CALENDAR SYNC - NODE.JS COMPLETE SOLUTION
// ============================================================================

const { Client } = require('@notionhq/client');
const { google } = require('googleapis');
require('dotenv').config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    notion: {
        token: process.env.NOTION_TOKEN,
        databaseId: process.env.NOTION_DATABASE_ID,
    },
    google: {
        // Calendar mapping based on tags
        calendarMapping: {
            'research': process.env.PERSONAL_CALENDAR_ID || 'primary',
            'read': process.env.GROWTH_CALENDAR_ID || 'your-growth@gmail.com',
            'planning': process.env.PERSONAL_CALENDAR_ID || 'primary',
            'study': process.env.STUDY_CALENDAR_ID || 'your-study@gmail.com',
            'exam': process.env.STUDY_CALENDAR_ID || 'your-study@gmail.com',
            'review': process.env.PERSONAL_CALENDAR_ID || 'primary',
            'business': process.env.BUSINESS_CALENDAR_ID || 'your-business@gmail.com',
            'default': 'primary'
        },
        // Priority-based color coding
        priorityColors: {
            'A': '11', // Red (Highest)
            'B': '5',  // Yellow (High) 
            'C': '2',  // Green (Medium)
            'D': '8',  // Gray (Low)
            'default': '1' // Blue
        },
        credentials: {
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        }
    }
};

// ============================================================================
// NOTION CLIENT
// ============================================================================

class NotionTaskManager {
    constructor(config) {
        this.notion = new Client({ auth: config.notion.token });
        this.databaseId = config.notion.databaseId;
    }

    async getTasks() {
        try {
            console.log('📋 Fetching tasks from Notion...');

            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);

            const fiveDaysLater = new Date(today);
            fiveDaysLater.setDate(today.getDate() + 5);

            const yesterdayStr = yesterday.toISOString().split('T')[0]; // "2025-08-14"
            const fiveDaysLaterStr = fiveDaysLater.toISOString().split('T')[0]; // "2025-08-20"


            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: {
                    and: [
                        {
                            property: 'Due Date',
                            date: {
                                on_or_after: yesterdayStr,
                            }
                        },
                        {
                            property: 'Due Date',
                            date: {
                                on_or_before: fiveDaysLaterStr,
                            }
                        },
                        {
                            or: [
                                { property: 'Status', status: { equals: 'Not started' } },
                                { property: 'Status', status: { equals: 'In Progress' } },
                                { property: 'Status', status: { equals: 'Done' } }
                            ]
                        }
                    ]

                }
            });

            const tasksToSync = response.results;
            console.log(`📋 Found ${tasksToSync.length} tasks to sync`);
            return tasksToSync.map(page => this.formatTask(page));

        } catch (error) {
            console.error('❌ Error fetching tasks from Notion:', error.message);
            throw error;
        }
    }

    formatTask(page) {
        const props = page.properties;

        return {
            id: page.id,
            title: this.getTextProperty(props.Title),
            description: this.getTextProperty(props.Description),
            tags: this.getMultiSelectProperty(props.Tags),
            priority: this.getSelectProperty(props.Priority) || 'C',
            startTime: this.getDateProperty(props['Start Time']),
            endTime: this.getDateProperty(props['End Time']),
            dueDate: this.getDateProperty(props['Due Date']),
            timeMinutes: this.getNumberProperty(props.Time) || 1,
            status: this.getStatusProperty(props.Status),
            assignee: this.getPeopleProperty(props.Assignee),
            lastSync: this.getDateProperty(props['Last Sync']),
            url: page.url,
            lastEditedTime: page.last_edited_time
        };
    }

    // Helper methods for property extraction
    getTextProperty(prop) {
        if (!prop) return '';
        if (prop.type === 'title' && prop.title?.length > 0) {
            return prop.title[0].plain_text;
        }
        if (prop.type === 'rich_text' && prop.rich_text?.length > 0) {
            return prop.rich_text[0].plain_text;
        }
        return '';
    }

    getMultiSelectProperty(prop) {
        return prop?.multi_select?.map(item => item.name) || [];
    }

    getSelectProperty(prop) {
        return prop?.select?.name || null;
    }

    getDateProperty(prop) {
        return prop?.date?.start || null;
    }

    getNumberProperty(prop) {
        return prop?.number || null;
    }

    getStatusProperty(prop) {
        return prop?.status?.name || 'Not started';
    }

    getPeopleProperty(prop) {
        return prop?.people?.[0]?.name || null;
    }

    async updateLastSync(taskId, eventId) {
        try {
            await this.notion.pages.update({
                page_id: taskId,
                properties: {
                    'Last Sync': {
                        date: { start: new Date().toISOString() }
                    },
                }
            });
            console.log(`✅ Updated sync timestamp for task: ${taskId.substring(0, 8)}...`);
        } catch (error) {
            console.error(`❌ Error updating task ${taskId}:`, error.message);
        }
    }
}

// ============================================================================
// GOOGLE CALENDAR CLIENT
// ============================================================================

class GoogleCalendarManager {
    constructor(config) {
        this.config = config;
        this.calendar = google.calendar('v3');
        this.auth = null;
    }

    async authenticate() {
        try {
            console.log('🔐 Authenticating with Google Calendar...');

            const oauth2Client = new google.auth.OAuth2(
                this.config.google.credentials.client_id,
                this.config.google.credentials.client_secret,
                'urn:ietf:wg:oauth:2.0:oob'
            );

            oauth2Client.setCredentials({
                refresh_token: this.config.google.credentials.refresh_token
            });

            this.auth = oauth2Client;
            console.log('✅ Google Calendar authentication successful');

        } catch (error) {
            console.error('❌ Google Calendar authentication failed:', error.message);
            throw error;
        }
    }

    getCalendarForTask(tags) {
        const mapping = this.config.google.calendarMapping;

        // Check each tag against calendar mapping
        for (const tag of tags) {
            const lowercaseTag = tag.toLowerCase();
            if (mapping[lowercaseTag]) {
                console.log(`📅 Tag "${tag}" → Calendar: ${mapping[lowercaseTag]}`);
                return mapping[lowercaseTag];
            }
        }

        console.log(`📅 No matching tags, using default calendar: ${mapping.default}`);
        return mapping.default;
    }

    calculateEventTiming(task) {
        let startDateTime, endDateTime;

        switch (task.status) {
            case 'Done':
                if (task.startTime && task.endTime) {
                    startDateTime = task.startTime;
                    endDateTime = task.endTime;
                } else {
                    return null;
                }
                break;

            case 'In Progress':
                // startTime + timeMinutes
                if (task.startTime) {
                    startDateTime = task.startTime;
                    const start = new Date(task.startTime);
                    const end = new Date(start.getTime() + (task.timeMinutes * 60 * 1000));
                    endDateTime = end.toISOString();
                } else {
                    return null;
                }
                break;

            case 'Not Started':
                // programmed?
                if (task.startTime) {
                    startDateTime = task.startTime;
                    const start = new Date(task.startTime);
                    const end = new Date(start.getTime() + (task.timeMinutes * 60 * 1000));
                    endDateTime = end.toISOString();
                // allDay
                } else if (task.dueDate) {
                    const dueDate = new Date(task.dueDate);
                    return {
                        startDate: dueDate.toISOString().split('T')[0], // YYYY-MM-DD
                        endDate: dueDate.toISOString().split('T')[0],
                        allDay: true
                    };

                } else {
                    return null;
                }
                break;
            default:
                // fallback
                if (task.startTime && task.endTime) {
                    startDateTime = task.startTime;
                    endDateTime = task.endTime;
                } else if (task.startTime) {
                    startDateTime = task.startTime;
                    const start = new Date(task.startTime);
                    const end = new Date(start.getTime() + (task.timeMinutes * 60 * 1000));
                    endDateTime = end.toISOString();
                } else if (task.dueDate) {
                    const due = new Date(task.dueDate);
                    const start = new Date(due.getTime() - (task.timeMinutes * 60 * 1000));
                    startDateTime = start.toISOString();
                    endDateTime = task.dueDate;
                } else {
                    return null;
                }
        }

        return { startDateTime, endDateTime };
    }

    buildEventDescription(task) {
        let description = task.description || '';
        description += '📋 DETAILS:\n';
        description += `• Priority: ${task.priority}\n`;
        description += `• Status: ${task.status}\n`;
        description += `• Tags: ${task.tags.join(', ') || 'None'}\n`;
        description += `• Estimated Time: ${task.timeMinutes} minutes\n`;
        description += `\n🔗 View in Notion: ${task.url}`;

        return description;
    }

    async createCalendarEvent(task) {
        const timing = this.calculateEventTiming(task);
        if (!timing) {
            console.log(`⏭️  Skipping task "${task.title}" - no timing information`);
            return null;
        }
        const calendarId = this.getCalendarForTask(task.tags);

        const event = {
            summary: `${task.title} [${task.priority}]`,
            description: this.buildEventDescription(task),
            extendedProperties: {
                private: {
                    notionTaskId: task.id,
                    priority: task.priority,
                    tags: task.tags.join(','),
                    lastEditedTime: task.lastEditedTime
                }
            }
        };

        if (timing.allDay) {
            event.start = { date: timing.startDate };
            event.end = { date: timing.endDate };
        } else {
            event.start = {
                dateTime: timing.startDateTime,
                timeZone: 'America/Lima'
            };
            event.end = {
                dateTime: timing.endDateTime,
                timeZone: 'America/Lima'
            };
        }

        try {
            const response = await this.calendar.events.insert({
                auth: this.auth,
                calendarId: calendarId,
                resource: event
            });

            console.log(`✅ Created event: "${task.title}" in ${calendarId}`);
            return response.data;

        } catch (error) {
            console.error(`❌ Error creating event for "${task.title}":`, error.message);
            return null;
        }
    }

    async updateCalendarEvent(eventId, calendarId, task) {
        const timing = this.calculateEventTiming(task);
        const newCalendarId = this.getCalendarForTask(task.tags);

        if (!timing) {
            console.log(`⏭️  Skipping update for "${task.title}" - no timing information`);
            return null;
        }

        const event = {
            summary: `${task.title} [${task.priority}]`,
            description: this.buildEventDescription(task),
            extendedProperties: {
                private: {
                    notionTaskId: task.id,
                    priority: task.priority,
                    tags: task.tags.join(','),
                    lastEditedTime: task.lastEditedTime
                }
            }
        };

        if (timing.allDay) {
            event.start = { date: timing.startDate };
            event.end = { date: timing.endDate };
        } else {
            event.start = {
                dateTime: timing.startDateTime,
                timeZone: 'America/Lima'
            };
            event.end = {
                dateTime: timing.endDateTime,
                timeZone: 'America/Lima'
            };
        }

        try {
            if (newCalendarId !== calendarId) {
                await this.deleteEvent(eventId, calendarId);
                await this.createCalendarEvent(task);
                console.log(`✅ Moved event "${task.title}" to calendar: ${newCalendarId}`);
            } else {
                const response = await this.calendar.events.update({
                    auth: this.auth,
                    calendarId: calendarId,
                    eventId: eventId,
                    resource: event
                });
                console.log("new updated event", event)
                console.log(`📝 Updated event: "${task.title}"`);
                return response.data;
            }
        } catch (error) {
            console.error(`❌ Error updating event for "${task.title}":`, error.message);
            return null;
        }
    }

    async getExistingEvents() {
        const events = [];
        const calendars = new Set(Object.values(this.config.google.calendarMapping));
        console.log('🔍 Searching for existing events...');

        // Usar el mismo rango de fechas que Notion
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const fiveDaysLater = new Date(today);
        fiveDaysLater.setDate(today.getDate() + 5);

        // Convertir a ISO string para Google Calendar API
        const timeMin = yesterday.toISOString();
        const timeMax = fiveDaysLater.toISOString();

        console.log(`📅 Searching events from ${timeMin.split('T')[0]} to ${timeMax.split('T')[0]}`);

        for (const calendarId of calendars) {
            try {
                const response = await this.calendar.events.list({
                    auth: this.auth,
                    calendarId: calendarId,
                    timeMin: timeMin,
                    timeMax: timeMax,
                    maxResults: 500,
                    singleEvents: true,
                    orderBy: 'startTime'
                });

                const notionEvents = response.data.items.filter(event =>
                    event.extendedProperties?.private?.notionTaskId
                );

                events.push(...notionEvents.map(event => ({
                    ...event,
                    calendarId: calendarId
                })));

                console.log(`📅 Found ${notionEvents.length} Notion events in calendar: ${calendarId}`);

            } catch (error) {
                console.error(`❌ Error fetching events from ${calendarId}:`, error.message);
            }
        }

        console.log(`📅 Total existing Notion-synced events found: ${events.length}`);
        return events;
    }

    async deleteEvent(eventId, calendarId) {
        try {
            await this.calendar.events.delete({
                auth: this.auth,
                calendarId: calendarId,
                eventId: eventId
            });
            console.log(`🗑️  Deleted event: ${eventId}`);
        } catch (error) {
            console.error(`❌ Error deleting event ${eventId}:`, error.message);
        }
    }
}

// ============================================================================
// MAIN SYNC FUNCTION
// ============================================================================

async function syncNotionToCalendar() {
    console.log('\n🚀 Starting Notion to Google Calendar sync...');
    console.log('==========================================');

    try {
        // Initialize clients
        const notionManager = new NotionTaskManager(CONFIG);
        const calendarManager = new GoogleCalendarManager(CONFIG);

        // Authenticate with Google
        await calendarManager.authenticate();

        // Get tasks from Notion
        const notionTasks = await notionManager.getTasks();

        // Get existing calendar events
        const existingEvents = await calendarManager.getExistingEvents();

        // Create map of existing events by Notion task ID
        const eventMap = new Map();
        existingEvents.forEach(event => {
            const notionTaskId = event.extendedProperties?.private?.notionTaskId;
            if (notionTaskId) {
                eventMap.set(notionTaskId, event);
            }
        });

        // Track sync statistics
        let stats = {
            created: 0,
            updated: 0,
            skipped: 0,
            deleted: 0,
            errors: 0
        };

        console.log('\n📊 Processing tasks...');
        console.log('==========================================');

        // Process each Notion task
        for (const task of notionTasks) {
            console.log(`\n🔍 Processing task: "${task.title}" (ID: ${task.id})`);
            const existingEvent = eventMap.get(task.id);

            try {
                if (existingEvent) {
                    // Check if task was modified since last sync
                    const eventLastEdit = existingEvent.extendedProperties?.private?.lastEditedTime;
                    console.log(eventLastEdit, task.lastEditedTime)
                    if (eventLastEdit && eventLastEdit === task.lastEditedTime) {
                        console.log(`⏭️  Skipping "${task.title}" - no changes since last sync`);
                        stats.skipped++;
                        continue;
                    }

                    // Update existing event
                    const updatedEvent = await calendarManager.updateCalendarEvent(
                        existingEvent.id,
                        existingEvent.calendarId,
                        task
                    );

                    if (updatedEvent) {
                        await notionManager.updateLastSync(task.id, updatedEvent.id);
                        stats.updated++;
                    } else {
                        stats.errors++;
                    }

                } else {
                    // Create new event
                    const newEvent = await calendarManager.createCalendarEvent(task);

                    if (newEvent) {
                        await notionManager.updateLastSync(task.id, newEvent.id);
                        stats.created++;
                    } else {
                        stats.skipped++;
                    }
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`❌ Error processing task "${task.title}":`, error.message);
                stats.errors++;
            }
        }

        // Clean up orphaned events (events for deleted Notion tasks)
        console.log('\n🧹 Cleaning up orphaned events...');
        const notionTaskIds = new Set(notionTasks.map(task => task.id));

        for (const event of existingEvents) {
            const eventTaskId = event.extendedProperties?.private?.notionTaskId;
            if (eventTaskId && !notionTaskIds.has(eventTaskId)) {
                await calendarManager.deleteEvent(event.id, event.calendarId);
                stats.deleted++;
            }
        }

        // Print final statistics
        console.log('\n✅ Sync completed successfully!');
        console.log('==========================================');
        console.log(`📊 Final Statistics:`);
        console.log(`   • Created: ${stats.created} events`);
        console.log(`   • Updated: ${stats.updated} events`);
        console.log(`   • Skipped: ${stats.skipped} events`);
        console.log(`   • Deleted: ${stats.deleted} events`);
        console.log(`   • Errors:  ${stats.errors} events`);
        console.log('==========================================\n');

        return stats;

    } catch (error) {
        console.error('\n💥 Sync failed:', error.message);
        throw error;
    }
}

// ============================================================================
// CLI AND EXECUTION
// ============================================================================

// Run sync if called directly
if (require.main === module) {
    syncNotionToCalendar()
        .then((stats) => {
            console.log('🎉 Notion to Calendar sync completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Sync process failed:', error.message);
            process.exit(1);
        });
}

// Export for use in other modules
module.exports = {
    syncNotionToCalendar,
    NotionTaskManager,
    GoogleCalendarManager,
    CONFIG
};