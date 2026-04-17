/**
 * ============================================
 * PRIVATE CHAT ROUTES
 * ============================================
 *
 * Endpoints for 1-to-1 private messaging:
 * POST /api/chats/create-private  - Create/get private chat
 * GET  /api/chats/my-chats        - List user's chats
 * GET  /api/chats/private/:userId - Get chat with user
 * GET  /api/chats/:chatId/messages - Get chat messages
 * POST /api/chats/:chatId/seen    - Mark messages as seen
 * GET  /api/chats/users           - All users for sidebar
 *
 * ============================================
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { isAuthenticated } = require('../auth');

/**
 * GET /api/chats/users
 * Get all registered users (for sidebar user list)
 */
router.get('/users', isAuthenticated, async (req, res) => {
    try {
        const users = await query(
            `SELECT id, username, is_online, last_seen, public_key 
             FROM users WHERE id != ? ORDER BY is_online DESC, username ASC`,
            [req.session.userId]
        );

        return res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

/**
 * POST /api/chats/create-private
 * Create a private chat between two users, or return existing one
 */
router.post('/create-private', isAuthenticated, async (req, res) => {
    try {
        const { targetUserId } = req.body;
        const currentUserId = req.session.userId;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Target user ID required' });
        }

        if (parseInt(targetUserId) === currentUserId) {
            return res.status(400).json({ success: false, message: 'Cannot chat with yourself' });
        }

        // Check if private chat already exists between these two users
        const existing = await query(
            `SELECT c.id FROM chats c
             INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
             INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
             WHERE c.chat_type = 'private'
             LIMIT 1`,
            [currentUserId, targetUserId]
        );

        if (existing.length > 0) {
            // Return existing chat
            return res.status(200).json({
                success: true,
                chatId: existing[0].id,
                isNew: false
            });
        }

        // Create new private chat
        const chat = await query(
            `INSERT INTO chats (chat_type) VALUES ('private')`
        );

        const chatId = chat.insertId;

        // Add both participants
        await query(
            `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)`,
            [chatId, currentUserId, chatId, targetUserId]
        );

        console.log(`💬 Private chat created: #${chatId} between users ${currentUserId} and ${targetUserId}`);

        return res.status(201).json({
            success: true,
            chatId: chatId,
            isNew: true
        });

    } catch (error) {
        console.error('Error creating private chat:', error);
        return res.status(500).json({ success: false, message: 'Error creating chat' });
    }
});

/**
 * GET /api/chats/my-chats
 * List all private chats for the logged-in user with last message preview
 */
router.get('/my-chats', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;

        // Get all chats the user is part of, with the other participant's info
        const chats = await query(
            `SELECT c.id as chatId, c.chat_type, c.created_at,
                    u.id as otherUserId, u.username as otherUsername, 
                    u.is_online as otherOnline, u.last_seen as otherLastSeen, u.public_key as otherPublicKey,
                    (SELECT COUNT(*) FROM private_messages pm 
                     WHERE pm.chat_id = c.id AND pm.is_seen = FALSE AND pm.sender_id != ?) as unreadCount
             FROM chats c
             INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
             INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id != ?
             INNER JOIN users u ON cp2.user_id = u.id
             WHERE c.chat_type = 'private'
             ORDER BY c.created_at DESC`,
            [userId, userId, userId]
        );

        // Get last message for each chat
        for (let chat of chats) {
            const lastMsg = await query(
                `SELECT message, sender_username, timestamp, is_ai 
                 FROM private_messages WHERE chat_id = ? 
                 ORDER BY timestamp DESC LIMIT 1`,
                [chat.chatId]
            );
            chat.lastMessage = lastMsg.length > 0 ? lastMsg[0] : null;
        }

        // Sort by last message time
        chats.sort((a, b) => {
            const timeA = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.created_at);
            const timeB = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.created_at);
            return timeB - timeA;
        });

        return res.status(200).json({ success: true, chats });
    } catch (error) {
        console.error('Error fetching chats:', error);
        return res.status(500).json({ success: false, message: 'Error fetching chats' });
    }
});

/**
 * GET /api/chats/private/:userId
 * Get private chat between logged-in user and target user
 */
router.get('/private/:userId', isAuthenticated, async (req, res) => {
    try {
        const targetUserId = parseInt(req.params.userId);
        const currentUserId = req.session.userId;

        const existing = await query(
            `SELECT c.id FROM chats c
             INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
             INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
             WHERE c.chat_type = 'private'
             LIMIT 1`,
            [currentUserId, targetUserId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'No chat found' });
        }

        return res.status(200).json({ success: true, chatId: existing[0].id });
    } catch (error) {
        console.error('Error finding private chat:', error);
        return res.status(500).json({ success: false, message: 'Error finding chat' });
    }
});

/**
 * GET /api/chats/:chatId/messages
 * Get messages for a specific chat room
 */
router.get('/:chatId/messages', isAuthenticated, async (req, res) => {
    try {
        const chatId = parseInt(req.params.chatId);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        // Verify user is participant
        const participant = await query(
            `SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ?`,
            [chatId, req.session.userId]
        );

        if (participant.length === 0) {
            return res.status(403).json({ success: false, message: 'Not a participant' });
        }

        const messages = await query(
            `SELECT id, chat_id, sender_id, sender_username, message, 
                    mood, topics, is_anonymous, is_ai, is_seen, is_burn, timestamp 
             FROM private_messages 
             WHERE chat_id = ? 
             ORDER BY timestamp ASC 
             LIMIT ? OFFSET ?`,
            [chatId, limit, offset]
        );

        // Fetch reactions for these messages
        const messageIds = messages.map(m => m.id);
        let reactions = [];
        if (messageIds.length > 0) {
            reactions = await query(
                `SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (${messageIds.map(() => '?').join(',')})`,
                messageIds
            );
        }

        // Process messages
        const processed = messages.map(msg => {
            const msgReactions = reactions.filter(r => r.message_id === msg.id);
            return {
                ...msg,
                topics: msg.topics ? msg.topics.split(',').filter(t => t) : [],
                isAnonymous: !!msg.is_anonymous,
                isAI: !!msg.is_ai,
                isSeen: !!msg.is_seen,
                isBurn: !!msg.is_burn,
                reactions: msgReactions.map(r => ({ emoji: r.emoji, userId: r.user_id }))
            };
        });

        return res.status(200).json({ success: true, messages: processed });
    } catch (error) {
        console.error('Error fetching chat messages:', error);
        return res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

/**
 * POST /api/chats/:chatId/seen
 * Mark all messages in a chat as seen
 */
router.post('/:chatId/seen', isAuthenticated, async (req, res) => {
    try {
        const chatId = parseInt(req.params.chatId);

        await query(
            `UPDATE private_messages SET is_seen = TRUE 
             WHERE chat_id = ? AND sender_id != ? AND is_seen = FALSE`,
            [chatId, req.session.userId]
        );

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error marking as seen:', error);
        return res.status(500).json({ success: false, message: 'Error updating seen status' });
    }
});

/**
 * DELETE /api/chats/messages/:id
 * Delete a private message (own messages only, or admin can delete any)
 */
router.delete('/messages/:id', isAuthenticated, async (req, res) => {
    try {
        const messageId = parseInt(req.params.id);
        if (!messageId) return res.status(400).json({ success: false, message: 'Message ID required' });

        // Get the message and verify user is participant
        const messages = await query(
            `SELECT pm.id, pm.sender_id, pm.chat_id FROM private_messages pm
             INNER JOIN chat_participants cp ON pm.chat_id = cp.chat_id AND cp.user_id = ?
             WHERE pm.id = ?`,
            [req.session.userId, messageId]
        );

        if (messages.length === 0) return res.status(404).json({ success: false, message: 'Message not found or not authorized' });

        const msg = messages[0];

        // Check admin
        const adminCheck = await query('SELECT MIN(id) as adminId FROM users');
        const isAdmin = adminCheck[0].adminId === req.session.userId;

        if (msg.sender_id !== req.session.userId && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this message' });
        }

        await query('DELETE FROM private_messages WHERE id = ?', [messageId]);
        console.log(`🗑️ Private message #${messageId} deleted by ${req.session.username}`);
        return res.status(200).json({ success: true, messageId, chatId: msg.chat_id });
    } catch (error) {
        console.error('Error deleting private message:', error);
        return res.status(500).json({ success: false, message: 'Error deleting message' });
    }
});

module.exports = router;
