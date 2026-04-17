/**
 * ============================================
 * AUTHENTICATION MODULE
 * ============================================
 *
 * Password hashing, comparison, and route
 * protection middleware using bcrypt.
 *
 * ============================================
 */

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        return hashedPassword;
    } catch (error) {
        console.error('Password hashing error:', error.message);
        throw new Error('Failed to hash password');
    }
}

/**
 * Compare a plain password with a hashed password
 * @param {string} password - Plain text password to verify
 * @param {string} hashedPassword - Stored hashed password
 * @returns {Promise<boolean>} True if passwords match
 */
async function comparePassword(password, hashedPassword) {
    try {
        const isMatch = await bcrypt.compare(password, hashedPassword);
        return isMatch;
    } catch (error) {
        console.error('Password comparison error:', error.message);
        throw new Error('Failed to compare passwords');
    }
}

/**
 * Middleware to check if user is authenticated
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
function isAuthenticated(req, res, next) {
    // Check if session exists and has user data
    if (req.session && req.session.userId) {
        // User is authenticated, proceed to route handler
        console.log(`✅ Authenticated request from user: ${req.session.username}`);
        return next();
    }

    // User is not authenticated
    console.log('❌ Unauthorized access attempt');
    return res.status(401).json({
        success: false,
        message: 'Unauthorized. Please log in to access this resource.'
    });
}

/**
 * Middleware to check authentication for page access
 * Redirects to login page instead of returning JSON
 * Used for protecting HTML pages
 */
function isAuthenticatedPage(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    // Redirect to login page
    return res.redirect('/');
}

// Export authentication utilities
module.exports = {
    hashPassword,
    comparePassword,
    isAuthenticated,
    isAuthenticatedPage,
    SALT_ROUNDS
};