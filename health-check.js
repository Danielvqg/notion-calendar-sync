const express = require('express');
const { syncNotionToCalendar } = require('./sync');
const monitor = require('./monitor');
const logger = require('./logger');

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = monitor.getStats();
  const isHealthy = stats.failedSyncs === 0 || 
    (stats.totalSyncs > 0 && stats.successfulSyncs / stats.totalSyncs > 0.8);
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    metrics: stats
  });
});

// Manual sync trigger
app.post('/sync', async (req, res) => {
  try {
    logger.info('Manual sync triggered via API');
    monitor.startSync();
    const stats = await syncNotionToCalendar();
    monitor.endSync(true, stats);
    
    res.json({ 
      success: true, 
      message: 'Sync completed successfully',
      stats 
    });
  } catch (error) {
    monitor.endSync(false);
    monitor.recordError(error);
    logger.error('Manual sync failed', { error: error.message });
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Statistics endpoint
app.get('/stats', (req, res) => {
  res.json(monitor.getStats());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Health check server listening on port ${PORT}`);
});