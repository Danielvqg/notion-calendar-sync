# Installation and Usage Instructions

# 1. Initialize the project
mkdir notion-calendar-sync
cd notion-calendar-sync

# 2. Install dependencies
npm install @notionhq/client googleapis dotenv

# 3. Create the files
- Copy the main sync.js code from the first artifact
- Copy package.json from the second artifact  
- Create .env file with your credentials
- Create setup.js and auth.js from this artifact

# 4. Set up authentication
node setup.js  # Interactive setup
node auth.js   # Get Google refresh token (if needed)

# 5. Run the sync
npm run sync
