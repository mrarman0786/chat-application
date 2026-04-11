/**
 * ============================================
 * SESSION CONFIGURATION MODULE
 * ============================================
 *
 * Configures express-session for user authentication.
 *
 * ============================================
 */

const session = require('express-session');

// Load environment variables
require('dotenv').config();

/**
 * Session middleware configuration
 * This middleware will be applied to all routes
 */
const isProduction = process.env.NODE_ENV === 'production';

const sessionMiddleware = session({
    // Secret key used to sign the session ID cookie
    // IMPORTANT: Use a strong, unique secret in production
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',

    // Don't save session if nothing changed (performance optimization)
    resave: false,

    // Don't create session until something is stored
    saveUninitialized: false,

    // Trust Railway's reverse proxy for secure cookies
    proxy: isProduction,

    // Cookie configuration
    cookie: {
        // Session duration (24 hours by default)
        maxAge: parseInt(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000,

        // Cookie only sent over HTTPS in production
        secure: isProduction,

        // Prevents client-side JavaScript from reading the cookie
        httpOnly: true,

        // In production behind proxy, use 'none' for cross-origin; otherwise 'lax'
        sameSite: isProduction ? 'none' : 'lax'
    },

    // Session name (default is 'connect.sid')
    name: 'chatapp.sid'
});

module.exports = sessionMiddleware;
