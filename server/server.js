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

// Mount AI chatbot routes
app.use('/api/ai', aiRoutes);

// Mount upload routes
app.use('/api/upload', uploadRoutes);

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

// Chat page (protected)
app.get('/chat.html', (req, res) => {
    // Check if authenticated
    if (!req.session || !req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../public/chat.html'));
});

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
    // Test database connection first
    const dbConnected = await testConnection();

    if (!dbConnected) {
        console.error('❌ Cannot start server without database connection');
        console.error('   Please ensure MySQL is running and check your .env configuration');
        process.exit(1);
    }

    // Start the server
    server.listen(PORT, () => {
        console.log('');
        console.log('============================================');
        console.log('🚀 CHAT APPLICATION SERVER STARTED');
        console.log('============================================');
        console.log(`📡 Server running on: http://localhost:${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log('============================================');
        console.log('');
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
