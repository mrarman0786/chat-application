/**
 * ============================================
 * UPLOAD ROUTES
 * ============================================
 * Handles avatar and file uploads via Cloudinary
 * ============================================
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { uploadAvatar, uploadChatFile } = require('../config/cloudinary');

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    next();
}

/**
 * POST /api/upload/avatar
 * Upload or update user profile picture
 */
router.post('/avatar', requireAuth, (req, res) => {
    uploadAvatar.single('avatar')(req, res, async (err) => {
        if (err) {
            console.error('Avatar upload error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        try {
            const avatarUrl = req.file.path;
            await query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.session.userId]);
            req.session.avatar = avatarUrl;

            console.log(`📸 Avatar updated for user ${req.session.username}`);

            return res.json({
                success: true,
                message: 'Avatar uploaded successfully',
                avatar: avatarUrl
            });
        } catch (error) {
            console.error('Avatar save error:', error);
            return res.status(500).json({ success: false, message: 'Failed to save avatar' });
        }
    });
});

/**
 * POST /api/upload/file
 * Upload a file for chat (image, video, document)
 * Returns the file URL and metadata
 */
router.post('/file', requireAuth, (req, res) => {
    uploadChatFile.single('file')(req, res, async (err) => {
        if (err) {
            console.error('File upload error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        try {
            const fileUrl = req.file.path;
            const fileName = req.file.originalname;
            const fileSize = req.file.size;
            const mimetype = req.file.mimetype;

            let messageType = 'file';
            if (mimetype.startsWith('image/')) messageType = 'image';
            else if (mimetype.startsWith('video/')) messageType = 'video';

            console.log(`📁 File uploaded by ${req.session.username}: ${fileName}`);

            return res.json({
                success: true,
                file: {
                    url: fileUrl,
                    name: fileName,
                    size: fileSize,
                    type: messageType
                }
            });
        } catch (error) {
            console.error('File upload error:', error);
            return res.status(500).json({ success: false, message: 'Failed to process upload' });
        }
    });
});

/**
 * PUT /api/upload/profile
 * Update user profile (username + avatar)
 */
router.put('/profile', requireAuth, async (req, res) => {
    try {
        const { avatar } = req.body;
        const updates = [];
        const params = [];

        if (avatar !== undefined) {
            updates.push('avatar = ?');
            params.push(avatar);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No updates provided' });
        }

        params.push(req.session.userId);
        await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        if (avatar) req.session.avatar = avatar;

        return res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        console.error('Profile update error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

/**
 * GET /api/upload/user-avatar/:userId
 * Get avatar URL for a specific user
 */
router.get('/user-avatar/:userId', requireAuth, async (req, res) => {
    try {
        const users = await query('SELECT avatar FROM users WHERE id = ?', [req.params.userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        return res.json({ success: true, avatar: users[0].avatar || '' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
