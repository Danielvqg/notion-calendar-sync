const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupEnvironment() {
  console.log('🚀 Notion-Calendar Sync Setup');
  console.log('===============================\n');

  const config = {};

  // Notion Configuration
  console.log('📋 NOTION CONFIGURATION');
  console.log('1. Go to https://www.notion.so/my-integrations');
  console.log('2. Create a new integration');
  console.log('3. Copy the integration token\n');
  
  config.NOTION_TOKEN = await question('Enter your Notion integration token: ');
  
  console.log('\n4. Go to your Tasks database in Notion');
  console.log('5. Copy the database ID from the URL');
  console.log('   URL format: https://notion.so/your-workspace/DATABASE_ID?v=...\n');
  
  config.NOTION_DATABASE_ID = await question('Enter your Tasks database ID: ');

  // Google Calendar Configuration
  console.log('\n📅 GOOGLE CALENDAR CONFIGURATION');
  console.log('1. Go to https://console.cloud.google.com/');
  console.log('2. Create a new project or select existing');
  console.log('3. Enable Google Calendar API');
  console.log('4. Create OAuth 2.0 credentials');
  console.log('5. Download the credentials JSON\n');
  
  config.GOOGLE_CLIENT_ID = await question('Enter your Google Client ID: ');
  config.GOOGLE_CLIENT_SECRET = await question('Enter your Google Client Secret: ');
  
  console.log('\n6. To get refresh token, run the auth script first');
  console.log('   We\'ll create a helper script for this\n');
  
  config.GOOGLE_REFRESH_TOKEN = await question('Enter your Google Refresh Token (or leave empty for now): ');

  // Calendar IDs (optional)
  console.log('\n📧 CALENDAR IDS (Optional - press Enter to use defaults)');
  config.WORK_CALENDAR_ID = await question('Work calendar ID (default: your-work@gmail.com): ') || 'your-work@gmail.com';
  config.PERSONAL_CALENDAR_ID = await question('Personal calendar ID (default: primary): ') || 'primary';
  config.HEALTH_CALENDAR_ID = await question('Health calendar ID (default: your-health@gmail.com): ') || 'your-health@gmail.com';
  config.STUDY_CALENDAR_ID = await question('Studying calendar ID (default: your-study@gmail.com): ') || 'your-study@gmail.com';

  // Create .env file
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync('.env', envContent);
  
  console.log('\n✅ Configuration saved to .env file');
  console.log('\nNext steps:');
  console.log('1. If you need to get Google refresh token, run: node auth.js');
  console.log('2. Install dependencies: npm install');
  console.log('3. Run the sync: npm run sync');
  
  rl.close();
}

if (require.main === module) {
  setupEnvironment().catch(console.error);
}

module.exports = { setupEnvironment };