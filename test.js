const { NotionTaskManager, GoogleCalendarManager } = require('./sync');
require('dotenv').config();

async function testConfiguration() {
  console.log('🧪 Testing configuration...\n');

  try {
    // Test Notion connection
    console.log('📋 Testing Notion connection...');
    const notionManager = new NotionTaskManager({
      notion: {
        token: process.env.NOTION_TOKEN,
        databaseId: process.env.NOTION_DATABASE_ID
      }
    });
    
    const tasks = await notionManager.getTasks();
    console.log(`✅ Notion: Found ${tasks.length} tasks\n`);

    // Test Google Calendar connection
    console.log('📅 Testing Google Calendar connection...');
    const calendarManager = new GoogleCalendarManager({
      google: {
        calendarMapping: {
          'work': process.env.WORK_CALENDAR_ID || 'primary',
          'personal': 'primary',
          'default': 'primary'
        },
        priorityColors: { 'A': '11', 'B': '5', 'C': '2', 'D': '8', 'default': '1' },
        credentials: {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        }
      }
    });
    
    await calendarManager.authenticate();
    const events = await calendarManager.getExistingEvents();
    console.log(`✅ Google Calendar: Found ${events.length} existing events\n`);

    // Test tag routing
    console.log('🏷️  Testing tag-based calendar routing...');
    const testTags = [
      ['work', 'urgent'],
      ['personal', 'health'],
      ['study', 'education'],
      ['project', 'development'],
      []
    ];

    testTags.forEach(tags => {
      const calendar = calendarManager.getCalendarForTask(tags);
      console.log(`   Tags [${tags.join(', ') || 'none'}] → ${calendar}`);
    });

    console.log('\n✅ All tests passed! Configuration is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('Notion')) {
      console.log('\n🔧 Notion troubleshooting:');
      console.log('   • Check your NOTION_TOKEN in .env');
      console.log('   • Verify NOTION_DATABASE_ID is correct');
      console.log('   • Ensure integration has access to the database');
    }
    
    if (error.message.includes('Google') || error.message.includes('Calendar')) {
      console.log('\n🔧 Google Calendar troubleshooting:');
      console.log('   • Check your Google credentials in .env');
      console.log('   • Run: node auth.js to get refresh token');
      console.log('   • Ensure Calendar API is enabled in Google Cloud Console');
    }
  }
}

if (require.main === module) {
  testConfiguration().catch(console.error);
}
