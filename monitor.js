const logger = require('./logger');

class SyncMonitor {
  constructor() {
    this.metrics = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageDuration: 0,
      lastSync: null,
      errors: []
    };
  }
  
  startSync() {
    this.syncStart = Date.now();
    logger.info('Sync started');
  }
  
  endSync(success, stats = {}) {
    const duration = Date.now() - this.syncStart;
    this.metrics.totalSyncs++;
    this.metrics.lastSync = new Date().toISOString();
    
    if (success) {
      this.metrics.successfulSyncs++;
      logger.success(`Sync completed in ${duration}ms`, stats);
    } else {
      this.metrics.failedSyncs++;
      logger.error(`Sync failed after ${duration}ms`);
    }
    
    // Update average duration
    this.metrics.averageDuration = 
      (this.metrics.averageDuration * (this.metrics.totalSyncs - 1) + duration) / 
      this.metrics.totalSyncs;
  }
  
  recordError(error) {
    this.metrics.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack
    });
    
    // Keep only last 10 errors
    if (this.metrics.errors.length > 10) {
      this.metrics.errors = this.metrics.errors.slice(-10);
    }
    
    logger.error('Error recorded', { error: error.message });
  }
  
  getStats() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalSyncs > 0 ? 
        (this.metrics.successfulSyncs / this.metrics.totalSyncs * 100).toFixed(2) + '%' : 
        'N/A'
    };
  }
  
  printStats() {
    const stats = this.getStats();
    console.log('\n📊 SYNC STATISTICS');
    console.log('==================');
    console.log(`Total Syncs: ${stats.totalSyncs}`);
    console.log(`Successful: ${stats.successfulSyncs}`);
    console.log(`Failed: ${stats.failedSyncs}`);
    console.log(`Success Rate: ${stats.successRate}`);
    console.log(`Average Duration: ${Math.round(stats.averageDuration)}ms`);
    console.log(`Last Sync: ${stats.lastSync || 'Never'}`);
    console.log('==================\n');
  }
}

module.exports = new SyncMonitor();