const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function getGoogleRefreshToken() {
  console.log('🔐 Google OAuth Setup Helper');
  console.log('=============================\n');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const scopes = [
    'https://www.googleapis.com/auth/calendar'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });

  console.log('1. Open this URL in your browser:');
  console.log(authUrl);
  console.log('\n2. Authorize the application');
  console.log('3. Copy the authorization code\n');

  const code = await new Promise(resolve => {
    rl.question('Enter the authorization code: ', resolve);
  });

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\n✅ Success! Your refresh token is:');
    console.log(tokens.refresh_token);
    console.log('\nAdd this to your .env file as GOOGLE_REFRESH_TOKEN');
    
    rl.close();
  } catch (error) {
    console.error('❌ Error getting tokens:', error.message);
    rl.close();
  }
}

if (require.main === module) {
  getGoogleRefreshToken().catch(console.error);
}