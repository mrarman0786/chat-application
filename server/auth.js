/**
 * ============================================
 * AUTHENTICATION MODULE
 * ============================================
 * 
 * This module provides authentication utilities:
 * - Password hashing with bcrypt
 * - Password comparison
 * - Authentication middleware for route protection
 * 
 * VIVA EXPLANATION:
 * - bcrypt uses salt rounds to make hashing slow (prevents brute force)
 * - Each password gets a unique salt (prevents rainbow table attacks)
 * - Middleware checks session before allowing access to protected routes
 * 
 * ============================================
 */

const bcrypt = require('bcryptjs');

// Number of salt rounds for bcrypt hashing
// Higher = more secure but slower (10-12 is recommended)
const SALT_ROUNDS = 10;

/**
 * Hash a password using bcrypt
 * 
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 * 
 * VIVA EXPLANATION:
 * bcrypt.hash() automatically generates a salt and combines it
 * with the password before hashing. The salt is stored in the
 * resulting hash string, so we don't need to store it separately.
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
 * 
 * @param {string} password - Plain text password to verify
 * @param {string} hashedPassword - Stored hashed password
 * @returns {Promise<boolean>} True if passwords match
 * 
 * VIVA EXPLANATION:
 * bcrypt.compare() extracts the salt from the hashed password,
 * hashes the plain password with that salt, and compares the results.
 * This is done in constant time to prevent timing attacks.
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
 * Use this to protect routes that require login
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 * 
 * VIVA EXPLANATION:
 * This middleware checks if a valid session exists with user data.
 * If authenticated, it calls next() to proceed to the route handler.
 * If not authenticated, it returns 401 Unauthorized status.
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
