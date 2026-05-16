const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../db');
const { isAuthenticated } = require('../auth');

const ROOM_TTL_HOURS = Math.max(parseInt(process.env.ROOM_TTL_HOURS || '24', 10), 1);
const DEFAULT_MAX_PARTICIPANTS = Math.max(parseInt(process.env.ROOM_MAX_PARTICIPANTS || '10', 10), 2);

/**
 * Generate a random 8-character alphanumeric code.
 * Codes stay unique because closed/expired chat rows are retained.
 */
function generateRoomCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function normalizeRoomCode(roomCode) {
    return String(roomCode || '').trim().toUpperCase();
}

function isRoomExpired(room) {
    return room.expires_at && new Date(room.expires_at).getTime() <= Date.now();
}

function storeRoomSession(req, room) {
    req.session.currentRoom = {
        chatId: room.chatId || room.id,
        roomCode: room.roomCode || room.room_code
    };
}

function clearRoomSession(req, chatId = null) {
    if (!req.session.currentRoom) return;
    if (!chatId || Number(req.session.currentRoom.chatId) === Number(chatId)) {
        delete req.session.currentRoom;
    }
}

async function expireOldRooms() {
    await query(
        `UPDATE chats
         SET room_status = 'expired', closed_at = COALESCE(closed_at, NOW())
         WHERE chat_type = 'group'
           AND room_status = 'active'
           AND (
                (expires_at IS NOT NULL AND expires_at <= NOW())
                OR (expires_at IS NULL AND created_at < NOW() - INTERVAL 1 DAY)
           )`
    );
}

async function getParticipants(chatId) {
    return query(
        `SELECT u.id, u.username, u.public_key, u.is_online
         FROM chat_participants cp
         JOIN users u ON cp.user_id = u.id
         WHERE cp.chat_id = ?
         ORDER BY cp.joined_at ASC`,
        [chatId]
    );
}

async function findActiveRoomByCode(roomCode) {
    const rooms = await query(
        `SELECT id, room_code, room_status, expires_at, max_participants
         FROM chats
         WHERE room_code = ? AND chat_type = 'group'
         LIMIT 1`,
        [roomCode]
    );

    if (rooms.length === 0) return null;
    return rooms[0];
}

/**
 * POST /api/rooms/create
 * Creates a new multi-person room session and returns a non-reused room code.
 */
router.post('/create', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const expiresAt = new Date(Date.now() + ROOM_TTL_HOURS * 60 * 60 * 1000);

        await expireOldRooms();

        let chatId = null;
        let roomCode = null;

        for (let i = 0; i < 12; i++) {
            const candidate = generateRoomCode();

            try {
                const result = await query(
                    `INSERT INTO chats
                     (chat_type, room_code, name, room_status, expires_at, created_by, max_participants)
                     VALUES ('group', ?, 'Anonymous Room', 'active', ?, ?, ?)`,
                    [candidate, expiresAt, userId, DEFAULT_MAX_PARTICIPANTS]
                );

                chatId = result.insertId;
                roomCode = candidate;
                break;
            } catch (insertErr) {
                if (insertErr.code !== 'ER_DUP_ENTRY') throw insertErr;
            }
        }

        if (!chatId || !roomCode) {
            return res.status(500).json({ success: false, message: 'Failed to generate unique room code' });
        }

        await query(
            `INSERT INTO chat_participants (chat_id, user_id)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE joined_at = CURRENT_TIMESTAMP`,
            [chatId, userId]
        );

        storeRoomSession(req, { chatId, roomCode });

        return res.status(201).json({
            success: true,
            chatId,
            roomCode,
            participantCount: 1,
            maxParticipants: DEFAULT_MAX_PARTICIPANTS,
            expiresAt
        });

    } catch (error) {
        console.error('Error creating room:', error);
        return res.status(500).json({ success: false, message: 'Server error creating room' });
    }
});

/**
 * POST /api/rooms/join
 * Joins an active room by code. The code is tied to one room session only.
 */
router.post('/join', isAuthenticated, async (req, res) => {
    try {
        const roomCode = normalizeRoomCode(req.body.roomCode);
        const userId = req.session.userId;

        if (!/^[A-Z0-9]{8}$/.test(roomCode)) {
            return res.status(400).json({ success: false, message: 'Enter a valid 8-character room code' });
        }

        await expireOldRooms();

        const room = await findActiveRoomByCode(roomCode);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }

        if (room.room_status !== 'active' || isRoomExpired(room)) {
            if (isRoomExpired(room)) {
                await query(
                    `UPDATE chats
                     SET room_status = 'expired', closed_at = COALESCE(closed_at, NOW())
                     WHERE id = ? AND room_status = 'active'`,
                    [room.id]
                );
            }
            clearRoomSession(req, room.id);
            return res.status(410).json({ success: false, message: 'Room code has expired or is closed' });
        }

        const participant = await query(
            'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ?',
            [room.id, userId]
        );

        if (participant.length === 0) {
            const countRes = await query('SELECT COUNT(*) as count FROM chat_participants WHERE chat_id = ?', [room.id]);
            const maxParticipants = room.max_participants || DEFAULT_MAX_PARTICIPANTS;

            if (countRes[0].count >= maxParticipants) {
                return res.status(403).json({ success: false, message: `Room is full (max ${maxParticipants} participants)` });
            }

            await query(
                `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`,
                [room.id, userId]
            );
        }

        storeRoomSession(req, { chatId: room.id, roomCode: room.room_code });

        const participants = await getParticipants(room.id);

        return res.status(200).json({
            success: true,
            chatId: room.id,
            roomCode: room.room_code,
            participants,
            participantCount: participants.length,
            maxParticipants: room.max_participants || DEFAULT_MAX_PARTICIPANTS,
            expiresAt: room.expires_at
        });

    } catch (error) {
        console.error('Error joining room:', error);
        return res.status(500).json({ success: false, message: 'Server error joining room' });
    }
});

/**
 * GET /api/rooms/current
 * Restores the current room from the user's server session after refresh.
 */
router.get('/current', isAuthenticated, async (req, res) => {
    try {
        const currentRoom = req.session.currentRoom;
        if (!currentRoom || !currentRoom.chatId) {
            return res.status(200).json({ success: true, room: null });
        }

        await expireOldRooms();

        const rooms = await query(
            `SELECT c.id, c.room_code, c.room_status, c.expires_at, c.max_participants
             FROM chats c
             JOIN chat_participants cp ON cp.chat_id = c.id AND cp.user_id = ?
             WHERE c.id = ? AND c.chat_type = 'group'
             LIMIT 1`,
            [req.session.userId, currentRoom.chatId]
        );

        if (rooms.length === 0 || rooms[0].room_status !== 'active' || isRoomExpired(rooms[0])) {
            clearRoomSession(req, currentRoom.chatId);
            return res.status(200).json({ success: true, room: null });
        }

        const room = rooms[0];
        const participants = await getParticipants(room.id);

        return res.status(200).json({
            success: true,
            room: {
                chatId: room.id,
                roomCode: room.room_code,
                participants,
                participantCount: participants.length,
                maxParticipants: room.max_participants || DEFAULT_MAX_PARTICIPANTS,
                expiresAt: room.expires_at
            }
        });

    } catch (error) {
        console.error('Error restoring room session:', error);
        return res.status(500).json({ success: false, message: 'Server error restoring room session' });
    }
});

/**
 * POST /api/rooms/leave
 * Leaves the current room session. If the room is empty, it is closed and the code is never reused.
 */
router.post('/leave', isAuthenticated, async (req, res) => {
    try {
        const chatId = parseInt(req.body.chatId || (req.session.currentRoom && req.session.currentRoom.chatId), 10);
        if (!chatId) {
            clearRoomSession(req);
            return res.status(200).json({ success: true, roomClosed: false, remainingCount: 0 });
        }

        const membership = await query(
            'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ?',
            [chatId, req.session.userId]
        );

        if (membership.length === 0) {
            clearRoomSession(req, chatId);
            return res.status(200).json({ success: true, roomClosed: false, remainingCount: null });
        }

        await query('DELETE FROM chat_participants WHERE chat_id = ? AND user_id = ?', [chatId, req.session.userId]);
        clearRoomSession(req, chatId);

        const countRes = await query('SELECT COUNT(*) as count FROM chat_participants WHERE chat_id = ?', [chatId]);
        const remainingCount = countRes[0].count;
        let roomClosed = false;

        if (remainingCount === 0) {
            await query(
                `UPDATE chats
                 SET room_status = 'closed', closed_at = COALESCE(closed_at, NOW())
                 WHERE id = ? AND chat_type = 'group'`,
                [chatId]
            );
            roomClosed = true;
        }

        return res.status(200).json({ success: true, roomClosed, remainingCount });

    } catch (error) {
        console.error('Error leaving room:', error);
        return res.status(500).json({ success: false, message: 'Server error leaving room' });
    }
});

module.exports = router;
