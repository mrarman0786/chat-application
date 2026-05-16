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
const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL);
const cookieSecure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : (isProduction && isRailway);

const sessionMiddleware = session({
    // Secret key used to sign the session ID cookie
    // IMPORTANT: Use a strong, unique secret in production
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',

    // Don't save session if nothing changed (performance optimization)
    resave: false,

    // Don't create session until something is stored
    saveUninitialized: false,

    // Trust the reverse proxy when secure cookies are enabled
    proxy: cookieSecure,

    // Cookie configuration
    cookie: {
        // Session duration (24 hours by default)
        maxAge: parseInt(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000,

        // Cookie only sent over HTTPS when the deployment requires it.
        // Local two-browser HTTP testing should use COOKIE_SECURE=false.
        secure: cookieSecure,

        // Prevents client-side JavaScript from reading the cookie
        httpOnly: true,

        // sameSite=None requires secure cookies; use lax for local HTTP testing
        sameSite: cookieSecure ? 'none' : 'lax'
    },

    // Session name (default is 'connect.sid')
    name: 'chatapp.sid'
});

module.exports = sessionMiddleware;
