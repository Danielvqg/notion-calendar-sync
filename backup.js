const fs = require('fs');
const path = require('path');

class EventBackup {
  constructor(backupDir = './backups') {
    this.backupDir = backupDir;
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  }
  
  async createBackup(calendarManager) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupDir, `events-backup-${timestamp}.json`);
    
    try {
      const events = await calendarManager.getExistingEvents();
      const backup = {
        timestamp: new Date().toISOString(),
        eventCount: events.length,
        events: events
      };
      
      fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
      console.log(`💾 Backup created: ${backupFile} (${events.length} events)`);
      
      return backupFile;
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw error;
    }
  }
  
  listBackups() {
    const files = fs.readdirSync(this.backupDir)
      .filter(file => file.startsWith('events-backup-') && file.endsWith('.json'))
      .sort()
      .reverse();
    
    return files.map(file => {
      const filepath = path.join(this.backupDir, file);
      const stats = fs.statSync(filepath);
      return {
        filename: file,
        path: filepath,
        created: stats.mtime,
        size: stats.size
      };
    });
  }
  
  restoreFromBackup(backupFile) {
    try {
      const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      console.log(`🔄 Backup contains ${backup.eventCount} events from ${backup.timestamp}`);
      return backup.events;
    } catch (error) {
      console.error('❌ Restore failed:', error.message);
      throw error;
    }
  }
}

module.exports = EventBackup;