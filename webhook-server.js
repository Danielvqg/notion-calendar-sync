// webhook-server.js
const express = require('express');
const crypto = require('crypto');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const { syncNotionToCalendar } = require('./sync');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'secret123';

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Configurar streams de logs
const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
const errorLogStream = fs.createWriteStream(path.join(logsDir, 'error.log'), { flags: 'a' });

// Morgan format personalizado con más detalles
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms';

// Morgan middlewares
app.use(morgan(morganFormat, {
    stream: accessLogStream,
    skip: function (req, res) { return res.statusCode < 400 }
}));

app.use(morgan(morganFormat, {
    stream: process.stdout,
    skip: function (req, res) { return res.statusCode >= 400 }
}));

app.use(morgan(morganFormat, {
    stream: errorLogStream,
    skip: function (req, res) { return res.statusCode < 400 }
}));

// Función para escribir logs personalizados
function writeLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data })
    };
    
    const logString = JSON.stringify(logEntry) + '\n';
    
    // Log a consola
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');
    
    // Log a archivo
    const logFile = level === 'error' ? 'error.log' : 'app.log';
    fs.appendFileSync(path.join(logsDir, logFile), logString);
}

// Middleware para verificar webhook de Notion
function verifyNotionWebhook(req, res, next) {
    const signature = req.headers['notion-webhook-signature'];
    const timestamp = req.headers['notion-webhook-timestamp'];
    
    writeLog('info', 'Webhook verification attempt', {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        headers: req.headers
    });
    
    if (!signature || !timestamp) {
        writeLog('warn', 'Webhook verification failed: Missing signature or timestamp');
        return res.status(401).json({ error: 'Missing signature or timestamp' });
    }

    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(timestamp + body)
        .digest('hex');

    if (signature !== expectedSignature) {
        writeLog('warn', 'Webhook verification failed: Invalid signature', {
            receivedSignature: signature,
            expectedSignature: expectedSignature
        });
        return res.status(401).json({ error: 'Invalid signature' });
    }

    writeLog('info', 'Webhook verification successful');
    next();
}

app.use(express.json());

// Rate limiting simple
const lastSync = { time: 0 };
const SYNC_COOLDOWN = 30000; // 30 segundos

// Array para almacenar requests de test
let testRequests = [];
const MAX_TEST_REQUESTS = 50; // Límite para no consumir mucha memoria

// Endpoint de test SIN verificación (para probar Notion webhooks)
app.all('/webhook/test', (req, res) => {
    const testData = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        originalUrl: req.originalUrl,
        query: req.query,
        params: req.params,
        headers: req.headers,
        body: req.body,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    };
    
    // Agregar al array (mantener solo los últimos MAX_TEST_REQUESTS)
    testRequests.unshift(testData);
    if (testRequests.length > MAX_TEST_REQUESTS) {
        testRequests = testRequests.slice(0, MAX_TEST_REQUESTS);
    }
    
    writeLog('info', 'TEST WEBHOOK received', testData);
    
    console.log('\n🧪 TEST WEBHOOK RECEIVED:');
    console.log('========================');
    console.log('📅 Timestamp:', testData.timestamp);
    console.log('🔗 Method:', testData.method);
    console.log('🔗 URL:', testData.url);
    console.log('❓ Query:', JSON.stringify(testData.query, null, 2));
    console.log('📋 Headers:', JSON.stringify(testData.headers, null, 2));
    console.log('📦 Body:', JSON.stringify(testData.body, null, 2));
    console.log('🌐 IP:', testData.ip);
    console.log('========================\n');
    
    res.status(200).json({
        success: true,
        message: 'Test webhook received successfully!',
        timestamp: testData.timestamp,
        receivedData: {
            method: testData.method,
            query: testData.query,
            headers: testData.headers,
            body: testData.body
        }
    });
});

// Endpoint para ver todos los test requests
app.get('/webhook/test/history', (req, res) => {
    const { limit = 10 } = req.query;
    const limitedRequests = testRequests.slice(0, parseInt(limit));
    
    res.json({
        total: testRequests.length,
        showing: limitedRequests.length,
        requests: limitedRequests
    });
});

// Endpoint para limpiar test requests
app.delete('/webhook/test/history', (req, res) => {
    const count = testRequests.length;
    testRequests = [];
    
    writeLog('info', `Cleared ${count} test requests`);
    res.json({ 
        message: `Cleared ${count} test requests`,
        timestamp: new Date().toISOString()
    });
});

// Endpoint para webhook de Notion CON verificación
app.post('/webhook/notion', async (req, res) => {
    writeLog('info', 'Webhook received from Notion', {
        body: req.body,
        headers: req.headers
    });
    
    const now = Date.now();
    if (now - lastSync.time < SYNC_COOLDOWN) {
        writeLog('info', 'Sync cooldown active, skipping sync');
        return res.status(200).json({ message: 'Sync cooldown active' });
    }

    try {
        lastSync.time = now;
        writeLog('info', 'Starting sync triggered by webhook');
        
        const stats = await syncNotionToCalendar();
        
        writeLog('info', 'Webhook sync completed successfully', { stats });
        
        res.status(200).json({
            success: true,
            message: 'Sync completed successfully',
            stats: stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        writeLog('error', 'Webhook sync failed', {
            error: error.message,
            stack: error.stack
        });
        
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
        writeLog('info', 'Manual sync triggered');
        const stats = await syncNotionToCalendar();
        writeLog('info', 'Manual sync completed', { stats });
        res.json({ success: true, stats });
    } catch (error) {
        writeLog('error', 'Manual sync failed', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para ver logs
app.get('/logs', (req, res) => {
    try {
        const { type = 'app', lines = 50 } = req.query;
        const logFile = type === 'error' ? 'error.log' : 
                       type === 'access' ? 'access.log' : 'app.log';
        
        const logPath = path.join(logsDir, logFile);
        
        if (!fs.existsSync(logPath)) {
            return res.status(404).json({ error: 'Log file not found' });
        }
        
        const logContent = fs.readFileSync(logPath, 'utf8');
        const logLines = logContent.split('\n').filter(line => line.trim());
        const recentLines = logLines.slice(-parseInt(lines));
        
        res.json({
            logType: type,
            totalLines: logLines.length,
            displayedLines: recentLines.length,
            logs: recentLines
        });
        
    } catch (error) {
        writeLog('error', 'Error reading logs', { error: error.message });
        res.status(500).json({ error: 'Error reading logs' });
    }
});

// Endpoint para limpiar logs
app.delete('/logs', (req, res) => {
    try {
        const logFiles = ['app.log', 'error.log', 'access.log'];
        let cleared = 0;
        
        logFiles.forEach(file => {
            const logPath = path.join(logsDir, file);
            if (fs.existsSync(logPath)) {
                fs.writeFileSync(logPath, '');
                cleared++;
            }
        });
        
        writeLog('info', `Logs cleared: ${cleared} files`);
        res.json({ message: `Cleared ${cleared} log files` });
        
    } catch (error) {
        writeLog('error', 'Error clearing logs', { error: error.message });
        res.status(500).json({ error: 'Error clearing logs' });
    }
});

// Health check
app.get('/health', (req, res) => {
    const healthInfo = {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        lastSync: lastSync.time ? new Date(lastSync.time).toISOString() : null
    };
    
    res.json(healthInfo);
});

// Sync programático cada hora
setInterval(async () => {
    try {
        writeLog('info', 'Hourly sync starting');
        const stats = await syncNotionToCalendar();
        writeLog('info', 'Hourly sync completed', { stats });
    } catch (error) {
        writeLog('error', 'Hourly sync failed', {
            error: error.message,
            stack: error.stack
        });
    }
}, 3600000); // 1 hora

// Error handler global
app.use((error, req, res, next) => {
    writeLog('error', 'Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
    });
    
    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    writeLog('info', `Webhook server started on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
    });
    
    console.log(`🚀 Webhook server running on port ${PORT}`);
    console.log(`📝 View logs: http://localhost:${PORT}/logs`);
    console.log(`🔧 Manual sync: http://localhost:${PORT}/sync/manual`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
    console.log(`🧪 TEST webhook: http://localhost:${PORT}/webhook/test`);
    console.log(`📋 Test history: http://localhost:${PORT}/webhook/test/history`);
    console.log(`🎯 REAL webhook: http://localhost:${PORT}/webhook/notion`);
});

module.exports = app;