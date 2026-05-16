/**
 * ============================================
 * MAIN SERVER FILE
 * ============================================
 *
 * Entry point — sets up Express, Socket.IO,
 * middleware, static files, API routes, and
 * database connection.
 *
 * ============================================
 */

// Load environment variables first
require('dotenv').config();

// Core modules
const express = require('express');
const http = require('http');
const path = require('path');

// Middleware
const cors = require('cors');
const bodyParser = require('body-parser');

// Socket.IO
const { Server } = require('socket.io');

// Custom modules
const sessionMiddleware = require('./session');
const { testConnection } = require('./db');
const { initializeSocket } = require('./socket');

// Routes
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const privateChatRoutes = require('./routes/privateChatRoutes');
const roomRoutes = require('./routes/roomRoutes');
const aiRoutes = require('./routes/aiRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

// ============================================
// CREATE EXPRESS APP AND HTTP SERVER
// ============================================
const app = express();
const server = http.createServer(app);

// Trust Railway's reverse proxy (needed for secure cookies & correct IP detection)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Build allowed origins list
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : false)
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

// ============================================
// INITIALIZE SOCKET.IO
// ============================================
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// ============================================
// MIDDLEWARE SETUP
// ============================================

// CORS configuration
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// Parse JSON request bodies (increased limit for base64 data)
app.use(bodyParser.json({ limit: '15mb' }));

// Parse URL-encoded request bodies
app.use(bodyParser.urlencoded({ extended: true, limit: '15mb' }));

// Session middleware (must be before routes)
app.use(sessionMiddleware);

// ============================================
// PAGE ROUTES
// ============================================

// Login page (default)
app.get('/', (req, res) => {
    // If already logged in, redirect to chat
    if (req.session && req.session.userId) {
        return res.redirect('/chat.html');
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Chat page (protected). This must be registered before express.static,
// otherwise public/chat.html can be served without a session.
app.get('/chat.html', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../public/chat.html'));
});

// ============================================
// STATIC FILE SERVING
// ============================================
// Serve files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// API ROUTES
// ============================================
// Mount authentication routes
app.use('/api/auth', authRoutes);

// Mount chat routes
app.use('/api/chat', chatRoutes);

// Mount private chat routes
app.use('/api/chats', privateChatRoutes);

// Mount room routes
app.use('/api/rooms', roomRoutes);

// Mount AI chatbot routes
app.use('/api/ai', aiRoutes);

// Mount upload routes
app.use('/api/upload', uploadRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// ============================================
// INITIALIZE SOCKET.IO WITH SESSION
// ============================================
initializeSocket(io, sessionMiddleware);

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

async function startServer() {
    // Start the server immediately so healthchecks pass
    server.listen(PORT, () => {
        console.log('');
        console.log('============================================');
        console.log('🚀 CHAT APPLICATION SERVER STARTED');
        console.log('============================================');
        console.log(`📡 Server running on port: ${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log('============================================');
        console.log('');

        // Now test database connection in the background
        testConnection().then(dbConnected => {
            if (!dbConnected) {
                console.error('⚠️  Database connection failed on startup.');
                console.error('   The app is running but chat will not work.');
                console.error('   Check your environment variables for database credentials.');
            } else {
                // ============================================
                // 24-HOUR AUTO-DELETE JOB
                // ============================================
                console.log('🧹 Initializing 24-hour message cleanup job...');
                
                const cleanup = async () => {
                    try {
                        const { query } = require('./db');
                        console.log('🧹 Running message cleanup...');
                        
                        // Delete global messages older than 24h
                        const res1 = await query('DELETE FROM messages WHERE timestamp < NOW() - INTERVAL 1 DAY');
                        // Delete private messages older than 24h
                        const res2 = await query('DELETE FROM private_messages WHERE timestamp < NOW() - INTERVAL 1 DAY');
                        // Expire old rooms but keep chat rows so room codes are never reused
                        const res3 = await query(
                            `UPDATE chats
                             SET room_status = 'expired', closed_at = COALESCE(closed_at, NOW())
                             WHERE chat_type = 'group'
                               AND room_status = 'active'
                               AND (
                                    (expires_at IS NOT NULL AND expires_at <= NOW())
                                    OR (expires_at IS NULL AND created_at < NOW() - INTERVAL 1 DAY)
                               )`
                        );
                        // Remove participants from inactive rooms without freeing the room code
                        const resRooms = await query(
                            `DELETE cp FROM chat_participants cp
                             INNER JOIN chats c ON c.id = cp.chat_id
                             WHERE c.chat_type = 'group'
                               AND c.room_status IN ('closed', 'expired')`
                        );
                        // Delete old users (for true anonymity)
                        const res4 = await query('DELETE FROM users WHERE created_at < NOW() - INTERVAL 1 DAY AND id != 1'); // Keep admin
                        
                        console.log(`✅ Cleanup complete. Deleted ${res1.affectedRows || 0} global, ${res2.affectedRows || 0} private messages, expired ${res3.affectedRows || 0} rooms, removed ${resRooms.affectedRows || 0} inactive room participants, deleted ${res4.affectedRows || 0} old users.`);
                    } catch (err) {
                        console.error('❌ Cleanup job failed:', err);
                    }
                };

                // Run every hour
                setInterval(cleanup, 60 * 60 * 1000);
                // Also run once on startup after 30s
                setTimeout(cleanup, 30000);
            }
        });
    });
}

// Start the server
startServer();

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
