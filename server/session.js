/**
 * ============================================
 * SESSION CONFIGURATION MODULE
 * ============================================
 * 
 * This module configures express-session for user authentication.
 * Sessions are used to maintain user login state across requests.
 * 
 * VIVA EXPLANATION:
 * - Sessions store user data on the server side
 * - A session ID is sent to the client via cookie
 * - This is more secure than storing data in cookies directly
 * - Session-based auth is stateful (unlike JWT which is stateless)
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
const sessionMiddleware = session({
    // Secret key used to sign the session ID cookie
    // IMPORTANT: Use a strong, unique secret in production
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',

    // Don't save session if nothing changed (performance optimization)
    resave: false,

    // Don't create session until something is stored
    saveUninitialized: false,

    // Cookie configuration
    cookie: {
        // Session duration (24 hours by default)
        maxAge: parseInt(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000,

        // Cookie only sent over HTTPS in production
        secure: process.env.NODE_ENV === 'production',

        // Prevents client-side JavaScript from reading the cookie
        httpOnly: true,

        // CSRF protection - cookie sent only for same-site requests
        sameSite: 'lax'
    },

    // Session name (default is 'connect.sid')
    name: 'chatapp.sid'
});

/**
 * VIVA EXPLANATION - Session Flow:
 * 
 * 1. User logs in with valid credentials
 * 2. Server creates a session and stores user data
 * 3. Session ID is sent to client as a cookie
 * 4. Client includes cookie in subsequent requests
 * 5. Server validates session ID and retrieves user data
 * 6. On logout, session is destroyed
 * 
 * Security considerations:
 * - httpOnly prevents XSS attacks from stealing session
 * - secure ensures cookie only sent over HTTPS
 * - sameSite prevents CSRF attacks
 */

module.exports = sessionMiddleware;
