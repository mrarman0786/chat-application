/**
 * ============================================
 * CHAT ROUTES
 * ============================================
 * 
 * This module handles chat-related API endpoints:
 * - GET /api/chat/messages - Fetch message history (with topic filter)
 * - GET /api/chat/user - Get current user info
 * - GET /api/chat/stats - Get chat statistics
 * - POST /api/chat/summarize - AI chat summary
 * - POST /api/chat/reveal-sender - Reveal anonymous sender (admin only)
 * 
 * All routes are protected by authentication middleware
 * 
 * VIVA EXPLANATION:
 * - Messages are loaded from database with pagination support
 * - Topic filtering uses SQL LIKE for comma-separated values
 * - AI summarization uses basic NLP (keyword frequency + action detection)
 * - Anonymous reveal is restricted to the first registered user (admin)
 * 
 * ============================================
 */

const express = require('express');
const router = express.Router();

// Import database and authentication modules
const { query } = require('../db');
const { isAuthenticated } = require('../auth');

/**
 * GET /api/chat/messages
 * Fetch message history from database
 * 
 * Query params: 
 * - limit: Number of messages to fetch (default: 50)
 * - offset: Offset for pagination (default: 0)
 * - topic: Filter by topic tag (optional)
 * 
 * Response: { success, messages }
 * 
 * VIVA EXPLANATION:
 * Topic filtering uses SQL LIKE operator to search within
 * comma-separated tags stored in the topics column.
 */
router.get('/messages', isAuthenticated, async (req, res) => {
    try {
        // Parse pagination parameters
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const topic = req.query.topic || null;

        // Validate limit (prevent abuse)
        const safeLimit = Math.min(Math.max(limit, 1), 100);

        // ============================================
        // FETCH MESSAGES FROM DATABASE
        // ============================================
        let sql = `SELECT id, user_id, username, message, mood, topics, is_anonymous, timestamp 
                    FROM messages`;
        let params = [];

        // Apply topic filter if provided
        if (topic) {
            sql += ` WHERE FIND_IN_SET(?, topics) > 0`;
            params.push(topic);
        }

        sql += ` ORDER BY timestamp ASC LIMIT ? OFFSET ?`;
        params.push(safeLimit, offset);

        const messages = await query(sql, params);

        // Process messages — hide anonymous usernames
        const processedMessages = messages.map(msg => ({
            ...msg,
            username: msg.is_anonymous ? 'Anonymous User' : msg.username,
            topics: msg.topics ? msg.topics.split(',').filter(t => t) : [],
            isAnonymous: msg.is_anonymous ? true : false
        }));

        console.log(`📨 Fetched ${messages.length} messages for user: ${req.session.username}`);

        return res.status(200).json({
            success: true,
            messages: processedMessages,
            count: messages.length
        });

    } catch (error) {
        console.error('Error fetching messages:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching messages'
        });
    }
});

/**
 * GET /api/chat/user
 * Get current authenticated user info
 * Used by chat page to display username
 * 
 * Response: { success, user }
 */
router.get('/user', isAuthenticated, async (req, res) => {
    try {
        // Check if user is admin (first registered user)
        const adminCheck = await query(
            'SELECT MIN(id) as adminId FROM users'
        );
        const isAdmin = adminCheck[0].adminId === req.session.userId;

        return res.status(200).json({
            success: true,
            user: {
                id: req.session.userId,
                username: req.session.username,
                email: req.session.email,
                isAdmin: isAdmin
            }
        });
    } catch (error) {
        return res.status(200).json({
            success: true,
            user: {
                id: req.session.userId,
                username: req.session.username,
                email: req.session.email,
                isAdmin: false
            }
        });
    }
});

/**
 * GET /api/chat/stats
 * Get chat statistics (optional feature)
 * 
 * Response: { success, stats }
 */
router.get('/stats', isAuthenticated, async (req, res) => {
    try {
        // Get total message count
        const messageCount = await query(
            'SELECT COUNT(*) as total FROM messages'
        );

        // Get total user count
        const userCount = await query(
            'SELECT COUNT(*) as total FROM users'
        );

        return res.status(200).json({
            success: true,
            stats: {
                totalMessages: messageCount[0].total,
                totalUsers: userCount[0].total
            }
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching statistics'
        });
    }
});

/**
 * POST /api/chat/summarize
 * Generate AI summary of recent chat messages
 * 
 * Request body: { limit } (default: 50)
 * Response: { success, summary, keywords, keyPoints, actionItems }
 * 
 * VIVA EXPLANATION:
 * This endpoint implements basic NLP for chat summarization.
 * It uses keyword frequency analysis and action verb pattern
 * matching to extract meaningful summaries without external AI APIs.
 */
router.post('/summarize', isAuthenticated, async (req, res) => {
    try {
        const limit = parseInt(req.body.limit) || 50;
        const safeLimit = Math.min(Math.max(limit, 1), 200);

        // Fetch recent messages
        const messages = await query(
            `SELECT message, username, timestamp FROM messages 
             ORDER BY timestamp DESC LIMIT ?`,
            [safeLimit]
        );

        if (messages.length === 0) {
            return res.status(200).json({
                success: false,
                message: 'No messages to summarize'
            });
        }

        // Generate summary using NLP
        const summary = generateSummary(messages);

        console.log(`📊 Summary generated for ${messages.length} messages by ${req.session.username}`);

        return res.status(200).json({
            success: true,
            ...summary
        });

    } catch (error) {
        console.error('Error generating summary:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating summary'
        });
    }
});

/**
 * POST /api/chat/reveal-sender
 * Reveal the real sender of an anonymous message (Admin only)
 * 
 * Request body: { messageId }
 * Response: { success, realSender }
 * 
 * VIVA EXPLANATION:
 * Only the admin (first registered user) can reveal anonymous senders.
 * This provides accountability while preserving anonymity for regular users.
 */
router.post('/reveal-sender', isAuthenticated, async (req, res) => {
    try {
        const { messageId } = req.body;

        if (!messageId) {
            return res.status(400).json({
                success: false,
                message: 'Message ID is required'
            });
        }

        // Check if user is admin (first registered user)
        const adminCheck = await query(
            'SELECT MIN(id) as adminId FROM users'
        );

        if (adminCheck[0].adminId !== req.session.userId) {
            return res.status(403).json({
                success: false,
                message: 'Only admin can reveal anonymous senders'
            });
        }

        // Get the real sender
        const messages = await query(
            'SELECT username, user_id FROM messages WHERE id = ? AND is_anonymous = TRUE',
            [messageId]
        );

        if (messages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Anonymous message not found'
            });
        }

        console.log(`🔍 Admin revealed anonymous sender for message #${messageId}: ${messages[0].username}`);

        return res.status(200).json({
            success: true,
            realSender: messages[0].username,
            messageId: messageId
        });

    } catch (error) {
        console.error('Error revealing sender:', error);
        return res.status(500).json({
            success: false,
            message: 'Error revealing sender'
        });
    }
});

/**
 * GET /api/chat/topics
 * Get all unique topics from messages
 * 
 * Response: { success, topics }
 */
router.get('/topics', isAuthenticated, async (req, res) => {
    try {
        const messages = await query(
            `SELECT DISTINCT topics FROM messages WHERE topics != '' AND topics IS NOT NULL`
        );

        // Extract unique topics from comma-separated values
        const topicSet = new Set();
        messages.forEach(msg => {
            if (msg.topics) {
                msg.topics.split(',').forEach(t => {
                    const trimmed = t.trim();
                    if (trimmed) topicSet.add(trimmed);
                });
            }
        });

        return res.status(200).json({
            success: true,
            topics: Array.from(topicSet).sort()
        });

    } catch (error) {
        console.error('Error fetching topics:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching topics'
        });
    }
});

// ============================================
// NLP SUMMARY ENGINE (same as socket.js for REST API)
// ============================================
function generateSummary(messages) {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'this', 'that', 'these',
        'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
        'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
        'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
        'not', 'no', 'yes', 'so', 'if', 'then', 'than', 'too', 'very',
        'just', 'about', 'also', 'more', 'some', 'any', 'all', 'each',
        'from', 'up', 'out', 'as', 'into', 'through', 'during', 'before',
        'after', 'above', 'below', 'between', 'same', 'different', 'other',
        'ok', 'okay', 'hi', 'hello', 'hey', 'yeah', 'lol', 'haha',
        'im', 'dont', 'cant', 'wont', 'didnt', 'isnt', 'arent', 'lets'
    ]);

    const actionPatterns = [
        /\bneed to\b/i, /\bshould\b/i, /\bmust\b/i, /\bhave to\b/i,
        /\blet's\b/i, /\blets\b/i, /\bplan to\b/i,
        /\bgoing to\b/i, /\bremember to\b/i, /\bdon't forget\b/i,
        /\bmake sure\b/i, /\btodo\b/i, /\bdeadline\b/i, /\bdue\b/i,
        /\bsubmit\b/i, /\bcomplete\b/i, /\bfinish\b/i, /\bprepare\b/i
    ];

    const wordFreq = {};
    const allSentences = [];

    messages.forEach(msg => {
        const text = msg.message;
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 3);
        sentences.forEach(s => {
            allSentences.push({ text: s.trim(), username: msg.username });
        });

        const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
        words.forEach(word => {
            if (word.length > 2 && !stopWords.has(word)) {
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
        });
    });

    const keywords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word, count]) => ({ word, count }));

    const actionItems = [];
    messages.forEach(msg => {
        for (const pattern of actionPatterns) {
            if (pattern.test(msg.message)) {
                actionItems.push({ text: msg.message, by: msg.username });
                break;
            }
        }
    });

    const scoredSentences = allSentences.map(s => {
        let score = 0;
        const words = s.text.toLowerCase().split(/\s+/);
        words.forEach(word => { if (wordFreq[word]) score += wordFreq[word]; });
        if (words.length > 5) score += 2;
        if (words.length > 10) score += 3;
        return { ...s, score };
    });

    const keyPoints = scoredSentences
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(s => s.text);

    const topKeywords = keywords.slice(0, 5).map(k => k.word);
    const discussionTopics = topKeywords.map(k => k.charAt(0).toUpperCase() + k.slice(1));

    return {
        summary: `Analyzed ${messages.length} messages. Key topics: ${discussionTopics.join(', ') || 'general discussion'}.`,
        keywords,
        keyPoints: keyPoints.length > 0 ? keyPoints : ['No significant discussion points detected.'],
        actionItems: actionItems.slice(0, 10),
        discussionTopics,
        messageCount: messages.length,
        participantCount: new Set(messages.map(m => m.username)).size
    };
}

module.exports = router;
