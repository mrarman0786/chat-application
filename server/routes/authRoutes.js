/**
 * ============================================
 * AUTHENTICATION ROUTES
 * ============================================
 *
 * POST /api/auth/register - User registration
 * POST /api/auth/login    - User login
 * POST /api/auth/logout   - User logout
 * GET  /api/auth/check    - Check auth status
 *
 * ============================================
 */

const express = require('express');
const router = express.Router();

// Import database and authentication modules
const { query } = require('../db');
const { hashPassword, comparePassword } = require('../auth');

/**
 * POST /api/auth/guest
 * Enter as a guest user (no password required)
 * 
 * Request body: { username }
 * Response: { success, message, user }
 */
router.post('/guest', async (req, res) => {
    try {
        const { username, publicKey } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'Username is required'
            });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({
                success: false,
                message: 'Username must be between 3 and 20 characters'
            });
        }

        let userId;
        let user;

        // Check if user already exists
        const existingUsers = await query(
            'SELECT id, username, password, avatar FROM users WHERE username = ?',
            [username]
        );

        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];
            
            // If it's a guest account, let them in
            if (existingUser.password === 'GUEST_NO_PASSWORD') {
                userId = existingUser.id;
                user = { id: userId, username: existingUser.username, avatar: existingUser.avatar || '' };
                
                // Update public key if provided
                if (publicKey) {
                    await query('UPDATE users SET public_key = ? WHERE id = ?', [publicKey, userId]);
                }
            } else {
                // It's a registered user account
                return res.status(400).json({
                    success: false,
                    message: 'Username is taken by a registered user. Please choose another name or login.'
                });
            }
        } else {
            // Create new guest user
            try {
                const result = await query(
                    'INSERT INTO users (username, email, password, avatar, public_key) VALUES (?, ?, ?, ?, ?)',
                    [username, `${username}@guest.${Date.now()}`, 'GUEST_NO_PASSWORD', '', publicKey || null]
                );
                userId = result.insertId;
                user = { id: userId, username: username, avatar: '' };
            } catch (insertErr) {
                // Race condition handle
                if (insertErr.code === 'ER_DUP_ENTRY') {
                    const retry = await query('SELECT id, username, avatar FROM users WHERE username = ?', [username]);
                    if (retry.length > 0) {
                        userId = retry[0].id;
                        user = { id: userId, username: retry[0].username, avatar: retry[0].avatar || '' };
                    } else throw insertErr;
                } else throw insertErr;
            }
        }

        // Create session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isGuest = true;

        console.log(`✅ Guest joined: ${user.username} (ID: ${user.id})`);

        return res.status(201).json({
            success: true,
            message: 'Guest login successful!',
            user
        });

    } catch (error) {
        console.error('Guest login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during guest login'
        });
    }
});

/**
 * POST /api/auth/login
 * Authenticate user and create session
 * 
 * Request body: { username, password }
 * Response: { success, message, user }
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // ============================================
        // INPUT VALIDATION
        // ============================================
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // ============================================
        // FIND USER IN DATABASE
        // ============================================
        const users = await query(
            'SELECT id, username, email, password, avatar FROM users WHERE username = ? OR email = ?',
            [username, username] // the 'username' variable contains either the username or the email
        );

        // Check if user exists
        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        const user = users[0];

        // ============================================
        // VERIFY PASSWORD
        // ============================================
        const isPasswordValid = await comparePassword(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // ============================================
        // CREATE SESSION
        // ============================================
        // Store user info in session (not the password!)
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.email = user.email;
        req.session.avatar = user.avatar || '';

        console.log(`✅ User logged in: ${user.username} (ID: ${user.id})`);

        // Return success with user info (excluding password)
        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatar: user.avatar || ''
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during login. Please try again.'
        });
    }
});

/**
 * POST /api/auth/logout
 * Destroy user session
 * 
 * Response: { success, message }
 */
router.post('/logout', (req, res) => {
    // Get username before destroying session (for logging)
    const username = req.session.username || 'Unknown';

    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({
                success: false,
                message: 'Error during logout'
            });
        }

        // Clear the session cookie
        res.clearCookie('chatapp.sid');

        console.log(`✅ User logged out: ${username}`);

        return res.status(200).json({
            success: true,
            message: 'Logout successful'
        });
    });
});

/**
 * GET /api/auth/check
 * Check if user is currently authenticated
 * Used by frontend to verify session status
 * 
 * Response: { authenticated, user }
 */
router.get('/check', (req, res) => {
    if (req.session && req.session.userId) {
        return res.status(200).json({
            authenticated: true,
            user: {
                id: req.session.userId,
                username: req.session.username,
                email: req.session.email,
                avatar: req.session.avatar || ''
            }
        });
    }

    return res.status(200).json({
        authenticated: false,
        user: null
    });
});

module.exports = router;
