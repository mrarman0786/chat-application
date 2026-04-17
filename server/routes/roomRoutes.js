const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../db');
const { isAuthenticated } = require('../auth');

/**
 * Generate a random 8-character alphanumeric code
 */
function generateRoomCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars (e.g. 1A2B3C4D)
}

/**
 * POST /api/rooms/create
 * Creates a new room and returns the room code and chat ID
 */
router.post('/create', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        let roomCode = generateRoomCode();
        let isUnique = false;

        // Ensure uniqueness (simple retry logic)
        for (let i = 0; i < 5; i++) {
            const existing = await query('SELECT id FROM chats WHERE room_code = ?', [roomCode]);
            if (existing.length === 0) {
                isUnique = true;
                break;
            }
            roomCode = generateRoomCode();
        }

        if (!isUnique) {
            return res.status(500).json({ success: false, message: 'Failed to generate unique room code' });
        }

        // Create the chat room
        const result = await query(
            `INSERT INTO chats (chat_type, room_code, name) VALUES ('group', ?, 'Anonymous Room')`,
            [roomCode]
        );
        const chatId = result.insertId;

        // Add creator as participant
        await query(
            `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`,
            [chatId, userId]
        );

        res.status(201).json({
            success: true,
            chatId,
            roomCode
        });

    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ success: false, message: 'Server error creating room' });
    }
});

/**
 * POST /api/rooms/join
 * Joins an existing room by code
 */
router.post('/join', isAuthenticated, async (req, res) => {
    try {
        const { roomCode } = req.body;
        const userId = req.session.userId;

        if (!roomCode) {
            return res.status(400).json({ success: false, message: 'Room code is required' });
        }

        // Find the room
        const room = await query('SELECT id FROM chats WHERE room_code = ? AND chat_type = ?', [roomCode.toUpperCase().trim(), 'group']);
        
        if (room.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found or has expired' });
        }

        const chatId = room[0].id;

        // Check if already a participant
        const participant = await query('SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ?', [chatId, userId]);
        
        if (participant.length === 0) {
            // Check room capacity (limit to 10)
            const countRes = await query('SELECT COUNT(*) as count FROM chat_participants WHERE chat_id = ?', [chatId]);
            if (countRes[0].count >= 10) {
                return res.status(403).json({ success: false, message: 'Room is full (Max 10 participants)' });
            }

            // Join the room
            await query(
                `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`,
                [chatId, userId]
            );
        }

        // Fetch participants' public keys for E2EE
        const participantsData = await query(
            `SELECT u.id, u.username, u.public_key 
             FROM chat_participants cp
             JOIN users u ON cp.user_id = u.id
             WHERE cp.chat_id = ? AND u.id != ?`,
            [chatId, userId]
        );

        res.status(200).json({
            success: true,
            chatId,
            roomCode: roomCode.toUpperCase().trim(),
            participants: participantsData
        });

    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({ success: false, message: 'Server error joining room' });
    }
});

module.exports = router;
