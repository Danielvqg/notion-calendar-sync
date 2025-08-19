// webhook-server.js
const express = require('express');
const crypto = require('crypto');
const { syncNotionToCalendar } = require('./sync');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'secret123';

// Middleware para verificar webhook de Notion
function verifyNotionWebhook(req, res, next) {
    const signature = req.headers['notion-webhook-signature'];
    const timestamp = req.headers['notion-webhook-timestamp'];
    
    if (!signature || !timestamp) {
        return res.status(401).json({ error: 'Missing signature or timestamp' });
    }

    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(timestamp + body)
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
}

app.use(express.json());

// Rate limiting simple
const lastSync = { time: 0 };
const SYNC_COOLDOWN = 30000; // 30 segundos

// Endpoint para webhook de Notion
app.post('/webhook/notion', verifyNotionWebhook, async (req, res) => {
    console.log('🔔 Webhook received from Notion');
    
    const now = Date.now();
    if (now - lastSync.time < SYNC_COOLDOWN) {
        console.log('⏳ Sync cooldown active, skipping...');
        return res.status(200).json({ message: 'Sync cooldown active' });
    }

    try {
        lastSync.time = now;
        console.log('🚀 Starting sync triggered by webhook...');
        
        const stats = await syncNotionToCalendar();
        
        res.status(200).json({
            success: true,
            message: 'Sync completed successfully',
            stats: stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Webhook sync failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint manual para testing
app.post('/sync/manual', async (req, res) => {
    try {
        console.log('🔧 Manual sync triggered...');
        const stats = await syncNotionToCalendar();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('❌ Manual sync failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Sync programático cada hora
setInterval(async () => {
    try {
        console.log('⏰ Hourly sync starting...');
        await syncNotionToCalendar();
    } catch (error) {
        console.error('❌ Hourly sync failed:', error);
    }
}, 3600000); // 1 hora

app.listen(PORT, () => {
    console.log(`🚀 Webhook server running on port ${PORT}`);
});

module.exports = app;