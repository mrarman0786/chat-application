/**
 * ============================================
 * SOCKET.IO MODULE (Enhanced)
 * ============================================
 *
 * Handles real-time communication:
 * - Global chat, private 1-to-1 chat, AI chatbot
 * - Online user tracking, typing indicators
 * - Seen/delivered status
 *
 * ============================================
 */

const { query } = require('./db');

// Track online users: Map<userId, Set<socketId>>
const onlineSockets = new Map();
// Track usernames for online users: Map<userId, username>
const onlineUsernames = new Map();

/**
 * Initialize Socket.IO with session sharing
 */
function initializeSocket(io, sessionMiddleware) {
    // ============================================
    // SHARE SESSION BETWEEN EXPRESS AND SOCKET.IO
    // ============================================
    io.use((socket, next) => {
        sessionMiddleware(socket.request, {}, next);
    });

    // ============================================
    // AUTHENTICATION MIDDLEWARE
    // ============================================
    io.use((socket, next) => {
        const session = socket.request.session;
        if (session && session.userId) {
            socket.userId = session.userId;
            socket.username = session.username;
            next();
        } else {
            next(new Error('Authentication required'));
        }
    });

    // ============================================
    // CONNECTION HANDLER
    // ============================================
    io.on('connection', async (socket) => {
        console.log(`✅ User connected: ${socket.username} (Socket: ${socket.id})`);

        // ============================================
        // TRACK ONLINE STATUS
        // ============================================
        // Handle multiple sockets per user
        if (!onlineSockets.has(socket.userId)) {
            onlineSockets.set(socket.userId, new Set());
            onlineUsernames.set(socket.userId, socket.username);
            
            // First socket connection for this user - update DB
            try {
                await query('UPDATE users SET is_online = TRUE WHERE id = ?', [socket.userId]);
            } catch (e) { console.error('Error updating online status:', e); }
        }
        
        onlineSockets.get(socket.userId).add(socket.id);

        // Join a room unique to this user ID for multi-socket messaging
        socket.join(`user_${socket.userId}`);

        // Broadcast updated online user list
        broadcastOnlineUsers(io);

        // ============================================
        // WELCOME MESSAGE
        // ============================================
        socket.emit('welcome', {
            message: `Welcome to the chat, ${socket.username}!`,
            userId: socket.userId,
            username: socket.username
        });

        // Broadcast user joined (global)
        socket.broadcast.emit('user joined', {
            username: socket.username,
            timestamp: new Date()
        });

        // ============================================
        // GLOBAL CHAT MESSAGE
        // ============================================
        socket.on('chat message', async (data) => {
            try {
                const message = data.message ? data.message.trim() : '';
                const mood = data.mood || 'happy';
                const topics = Array.isArray(data.topics) ? data.topics.join(',') : (data.topics || '');
                const isAnonymous = data.isAnonymous || false;

                if (!message || message.length === 0) {
                    return socket.emit('error', { message: 'Message cannot be empty' });
                }
                if (message.length > 1000) {
                    return socket.emit('error', { message: 'Message too long (max 1000 characters)' });
                }

                const validMoods = ['happy', 'sad', 'angry', 'calm', 'excited'];
                const safeMood = validMoods.includes(mood) ? mood : 'happy';

                const result = await query(
                    `INSERT INTO messages (user_id, username, message, mood, topics, is_anonymous) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [socket.userId, socket.username, message, safeMood, topics, isAnonymous]
                );

                const messageData = {
                    id: result.insertId,
                    user_id: socket.userId,
                    username: isAnonymous ? 'Anonymous User' : socket.username,
                    message: message,
                    mood: safeMood,
                    topics: topics ? topics.split(',') : [],
                    isAnonymous: isAnonymous,
                    timestamp: new Date()
                };

                io.emit('chat message', messageData);

            } catch (error) {
                console.error('Error handling message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // ============================================
        // GLOBAL TYPING EVENTS
        // ============================================
        socket.on('typing', () => {
            socket.broadcast.emit('user typing', { username: socket.username });
        });

        socket.on('stop typing', () => {
            socket.broadcast.emit('user stop typing', { username: socket.username });
        });

        // ============================================
        // PRIVATE CHAT — JOIN ROOM
        // ============================================
        socket.on('join-private-chat', async (data) => {
            try {
                const { chatId } = data;
                if (!chatId) return;

                // Verify participant
                const participant = await query(
                    'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ?',
                    [chatId, socket.userId]
                );

                if (participant.length === 0) {
                    return socket.emit('error', { message: 'Not authorized for this chat' });
                }

                // Join the socket room
                socket.join(`chat_${chatId}`);
                console.log(`🔑 ${socket.username} joined private chat #${chatId}`);

                // Mark messages as seen
                await query(
                    `UPDATE private_messages SET is_seen = TRUE 
                     WHERE chat_id = ? AND sender_id != ? AND is_seen = FALSE`,
                    [chatId, socket.userId]
                );

                // Notify the other user that messages were seen
                socket.to(`chat_${chatId}`).emit('messages-seen', { chatId });

            } catch (error) {
                console.error('Error joining private chat:', error);
            }
        });

        // ============================================
        // PRIVATE CHAT — SEND MESSAGE
        // ============================================
        socket.on('send-private-message', async (data) => {
            try {
                const { chatId, message, mood, topics, isAnonymous } = data;

                if (!chatId || !message || !message.trim()) {
                    return socket.emit('error', { message: 'Chat ID and message required' });
                }

                if (message.length > 1000) {
                    return socket.emit('error', { message: 'Message too long' });
                }

                // Verify participant
                const participant = await query(
                    'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ?',
                    [chatId, socket.userId]
                );

                if (participant.length === 0) {
                    return socket.emit('error', { message: 'Not authorized' });
                }

                const safeMood = ['happy', 'sad', 'angry', 'calm', 'excited'].includes(mood) ? mood : 'happy';
                const topicStr = Array.isArray(topics) ? topics.join(',') : (topics || '');

                const result = await query(
                    `INSERT INTO private_messages 
                     (chat_id, sender_id, sender_username, message, mood, topics, is_anonymous, is_ai) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`,
                    [chatId, socket.userId, socket.username, message.trim(), safeMood, topicStr, isAnonymous || false]
                );

                const msgData = {
                    id: result.insertId,
                    chat_id: chatId,
                    sender_id: socket.userId,
                    sender_username: isAnonymous ? 'Anonymous User' : socket.username,
                    message: message.trim(),
                    mood: safeMood,
                    topics: topicStr ? topicStr.split(',') : [],
                    isAnonymous: isAnonymous || false,
                    isAI: false,
                    isSeen: false,
                    timestamp: new Date()
                };

                // Send to everyone in the room (including sender)
                io.to(`chat_${chatId}`).emit('receive-private-message', msgData);

                // Also notify the other user if they're not in the room (for unread badge)
                const participants = await query(
                    'SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id != ?',
                    [chatId, socket.userId]
                );

                participants.forEach(p => {
                    if (onlineSockets.has(p.user_id)) {
                        // Send to all sockets for this user
                        io.to(`user_${p.user_id}`).emit('new-message-notification', {
                            chatId,
                            senderUsername: isAnonymous ? 'Anonymous User' : socket.username,
                            preview: message.trim().substring(0, 50)
                        });
                    }
                });

                console.log(`📩 Private message in chat #${chatId} from ${socket.username}`);

            } catch (error) {
                console.error('Error sending private message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // ============================================
        // PRIVATE CHAT — TYPING
        // ============================================
        socket.on('typing-private', (data) => {
            if (data.chatId) {
                socket.to(`chat_${data.chatId}`).emit('private-typing-status', {
                    chatId: data.chatId,
                    username: socket.username,
                    isTyping: true
                });
            }
        });

        socket.on('stop-typing-private', (data) => {
            if (data.chatId) {
                socket.to(`chat_${data.chatId}`).emit('private-typing-status', {
                    chatId: data.chatId,
                    username: socket.username,
                    isTyping: false
                });
            }
        });

        // ============================================
        // MESSAGE SEEN
        // ============================================
        socket.on('message-seen', async (data) => {
            try {
                const { chatId } = data;
                await query(
                    `UPDATE private_messages SET is_seen = TRUE 
                     WHERE chat_id = ? AND sender_id != ? AND is_seen = FALSE`,
                    [chatId, socket.userId]
                );
                socket.to(`chat_${chatId}`).emit('messages-seen', { chatId });
            } catch (e) {
                console.error('Error marking messages seen:', e);
            }
        });

        // ============================================
        // AI CHATBOT — SEND MESSAGE
        // ============================================
        socket.on('send-ai-message', async (data) => {
            try {
                const { chatId, message } = data;

                if (!message || !message.trim()) {
                    return socket.emit('error', { message: 'Message required' });
                }

                // Get or create AI chat record in DB for this user
                let dbChatId;
                const existingChat = await query(
                    `SELECT c.id FROM chats c 
                     JOIN chat_participants cp ON c.id = cp.chat_id 
                     WHERE c.name = 'AI Assistant' AND cp.user_id = ? LIMIT 1`,
                    [socket.userId]
                );

                if (existingChat.length > 0) {
                    dbChatId = existingChat[0].id;
                } else {
                    // Create AI chat for this user
                    const newChat = await query(
                        `INSERT INTO chats (chat_type, name) VALUES ('private', 'AI Assistant')`,
                        []
                    );
                    dbChatId = newChat.insertId;
                    await query(
                        `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`,
                        [dbChatId, socket.userId]
                    );
                }

                // Save user message to DB
                await query(
                    `INSERT INTO private_messages 
                     (chat_id, sender_id, sender_username, message, is_ai) 
                     VALUES (?, ?, ?, ?, FALSE)`,
                    [dbChatId, socket.userId, socket.username, message.trim()]
                );

                // Show "AI is thinking" indicator
                socket.emit('ai-thinking', { chatId, isThinking: true });

                // Generate AI response
                const aiResponse = await generateAIChatResponse(message.trim(), dbChatId, socket.userId);

                // Save AI response to DB
                const result = await query(
                    `INSERT INTO private_messages 
                     (chat_id, sender_id, sender_username, message, is_ai) 
                     VALUES (?, NULL, 'AI Assistant', ?, TRUE)`,
                    [dbChatId, aiResponse.text]
                );

                // Stop thinking indicator
                socket.emit('ai-thinking', { chatId, isThinking: false });

                // Send AI response
                socket.emit('receive-ai-message', {
                    id: result.insertId,
                    chat_id: chatId,
                    sender_id: null,
                    sender_username: 'AI Assistant',
                    message: aiResponse.text,
                    isAI: true,
                    type: aiResponse.type,
                    timestamp: new Date()
                });

                console.log(`🤖 AI response in chat #${dbChatId}`);

            } catch (error) {
                console.error('Error with AI message:', error);
                socket.emit('ai-thinking', { chatId: data.chatId, isThinking: false });
                socket.emit('error', { message: 'AI service error' });
            }
        });

        // ============================================
        // GLOBAL CHAT SUMMARY (existing)
        // ============================================
        socket.on('request-summary', async (data) => {
            try {
                const limit = data.limit || 50;
                const messages = await query(
                    `SELECT message, username, timestamp FROM messages 
                     ORDER BY timestamp DESC LIMIT ?`,
                    [limit]
                );

                if (messages.length === 0) {
                    return socket.emit('chat-summary-response', {
                        success: false,
                        message: 'No messages to summarize'
                    });
                }

                const summary = generateSummary(messages);
                socket.emit('chat-summary-response', { success: true, ...summary });

            } catch (error) {
                console.error('Error generating summary:', error);
                socket.emit('chat-summary-response', { success: false, message: 'Failed' });
            }
        });

        // ============================================
        // GLOBAL MEDIA MESSAGE
        // ============================================
        socket.on('send-media-message', async (data) => {
            try {
                const { fileUrl, fileName, fileSize, messageType, mood, topics, isAnonymous } = data;
                if (!fileUrl) return socket.emit('error', { message: 'File URL required' });

                const safeMood = ['happy', 'sad', 'angry', 'calm', 'excited'].includes(mood) ? mood : 'happy';
                const topicStr = Array.isArray(topics) ? topics.join(',') : (topics || '');

                const result = await query(
                    `INSERT INTO messages (user_id, username, message, mood, topics, is_anonymous, message_type, file_url, file_name, file_size)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [socket.userId, socket.username, fileName || 'Media', safeMood, topicStr, isAnonymous || false, messageType || 'file', fileUrl, fileName, fileSize || 0]
                );

                io.emit('chat message', {
                    id: result.insertId,
                    user_id: socket.userId,
                    username: isAnonymous ? 'Anonymous User' : socket.username,
                    message: fileName || 'Media',
                    mood: safeMood,
                    topics: topicStr ? topicStr.split(',') : [],
                    isAnonymous: isAnonymous || false,
                    message_type: messageType,
                    file_url: fileUrl,
                    file_name: fileName,
                    file_size: fileSize,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error('Error sending media:', error);
                socket.emit('error', { message: 'Failed to send media' });
            }
        });

        // ============================================
        // PRIVATE MEDIA MESSAGE
        // ============================================
        socket.on('send-private-media', async (data) => {
            try {
                const { chatId, fileUrl, fileName, fileSize, messageType, mood } = data;
                if (!chatId || !fileUrl) return socket.emit('error', { message: 'Chat ID and file URL required' });

                const safeMood = ['happy', 'sad', 'angry', 'calm', 'excited'].includes(mood) ? mood : 'happy';

                const result = await query(
                    `INSERT INTO private_messages
                     (chat_id, sender_id, sender_username, message, mood, is_ai, message_type, file_url, file_name, file_size)
                     VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?)`,
                    [chatId, socket.userId, socket.username, fileName || 'Media', safeMood, messageType || 'file', fileUrl, fileName, fileSize || 0]
                );

                const msgData = {
                    id: result.insertId,
                    chat_id: chatId,
                    sender_id: socket.userId,
                    sender_username: socket.username,
                    message: fileName || 'Media',
                    mood: safeMood,
                    isAI: false,
                    isSeen: false,
                    message_type: messageType,
                    file_url: fileUrl,
                    file_name: fileName,
                    file_size: fileSize,
                    timestamp: new Date()
                };

                io.to(`chat_${chatId}`).emit('receive-private-message', msgData);
                console.log(`📎 Media message in chat #${chatId} from ${socket.username}`);
            } catch (error) {
                console.error('Error sending private media:', error);
                socket.emit('error', { message: 'Failed to send media' });
            }
        });

        // ============================================
        // LEAVE PRIVATE CHAT
        // ============================================
        socket.on('leave-private-chat', (data) => {
            if (data.chatId) {
                socket.leave(`chat_${data.chatId}`);
            }
        });

        // ============================================
        // DISCONNECT
        // ============================================
        socket.on('disconnect', async (reason) => {
            console.log(`❌ User disconnected: ${socket.username} (Reason: ${reason})`);

            const sockets = onlineSockets.get(socket.userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    // Last socket for this user has disconnected
                    onlineSockets.delete(socket.userId);
                    onlineUsernames.delete(socket.userId);

                    try {
                        await query('UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = ?', [socket.userId]);
                    } catch (e) { console.error('Error updating offline status:', e); }
                    
                    socket.broadcast.emit('user left', {
                        username: socket.username,
                        timestamp: new Date()
                    });
                }
            }

            broadcastOnlineUsers(io);
        });
    });
}

/**
 * Broadcast online users list to all connected clients
 */
async function broadcastOnlineUsers(io) {
    const users = [];
    const userIds = [];
    onlineSockets.forEach((value, key) => {
        users.push({ userId: key, username: onlineUsernames.get(key), avatar: '' });
        userIds.push(key);
    });
    // Fetch avatars from DB
    if (userIds.length > 0) {
        try {
            const avatars = await query(
                `SELECT id, avatar FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
                userIds
            );
            avatars.forEach(a => {
                const u = users.find(u => u.userId === a.id);
                if (u) u.avatar = a.avatar || '';
            });
        } catch (e) { /* ignore avatar fetch errors */ }
    }
    io.emit('online-users', { users });
}

// ============================================
// AI CHAT RESPONSE ENGINE (Comprehensive)
// ============================================
async function generateAIChatResponse(message, chatId, userId) {
    const lowerMsg = message.toLowerCase().trim();
    const originalMsg = message.trim();

    // ---- SLASH COMMANDS ----
    if (lowerMsg.startsWith('/')) {
        return handleSlashCommand(lowerMsg, originalMsg, chatId);
    }

    // ---- GREETINGS ----
    if (/^(hi+|hello|hey|hiya|howdy|sup|yo|what'?s up|good\s*(morning|afternoon|evening|night)|greetings)/i.test(lowerMsg)) {
        const g = [
            "Hey there! 👋 How can I help you today?",
            "Hello! 🤖 I'm your AI Assistant. Ask me anything!",
            "Hi! 😊 What would you like to know?",
            "Hey! 👋 I'm ready to help. What's on your mind?",
            "Hello! Feel free to ask me any question — I'll do my best to answer! 💡"
        ];
        return { text: g[Math.floor(Math.random() * g.length)], type: 'greeting' };
    }

    // ---- GOODBYE ----
    if (/^(bye|goodbye|see you|later|good\s*night|gotta go|brb|ttyl|cya)/i.test(lowerMsg)) {
        const b = ["Goodbye! 👋 Feel free to come back anytime!", "See you later! 😊 Have a great day!", "Bye! 🤖 I'll be here whenever you need me!"];
        return { text: b[Math.floor(Math.random() * b.length)], type: 'greeting' };
    }

    // ---- THANKS ----
    if (/^(thanks?|thx|ty|thank\s*you|appreciate|grateful)/i.test(lowerMsg)) {
        const t = ["You're welcome! 😊", "Happy to help! 💡", "Anytime! Let me know if you need more help! 🤖", "Glad I could help! 😊"];
        return { text: t[Math.floor(Math.random() * t.length)], type: 'greeting' };
    }

    // ---- HOW ARE YOU / PERSONAL ----
    if (/how are you|how('?re| are) (you|u)|how do you (feel|do)|are you (ok|good|fine|well)/i.test(lowerMsg)) {
        return { text: "I'm doing great, thanks for asking! 🤖 I'm an AI assistant, so I'm always ready to help. What can I do for you?", type: 'greeting' };
    }
    if (/what('?s| is) your name|who are you|tell me about yourself/i.test(lowerMsg)) {
        return { text: "🤖 I'm **AI Assistant**, your smart chat companion! I can answer questions, do math, summarize chats, help with coding, generate notes, tell jokes, and much more. Just ask! 💡", type: 'info' };
    }
    if (/who (made|created|built|developed) you/i.test(lowerMsg)) {
        return { text: "🤖 I was built as part of this ChatApp project! I'm a rule-based AI assistant designed to help users with various tasks right inside the chat. 💻", type: 'info' };
    }

    // ---- MATH ----
    if (/(?:calculate|solve|compute|evaluate)\s/i.test(lowerMsg) || /^\d+[\s]*[+\-*/^%][\s]*\d+/.test(lowerMsg) || /what(?:'s| is)\s+\d+\s*[+\-*/x×÷]\s*\d+/i.test(lowerMsg)) {
        return handleMath(message);
    }

    // ---- SUMMARIZE ----
    if (/summarize|summary|recap|overview|what did we (talk|discuss|chat)/i.test(lowerMsg)) {
        return await handleSummarize(chatId);
    }

    // ---- NOTES / BULLET POINTS ----
    if (/(?:notes|bullet\s*points?|convert to bullets?|make notes|study notes|create notes)/i.test(lowerMsg)) {
        return handleNotes(message.replace(/^.*?(notes|bullet|convert)[^:]*:?\s*/i, ''));
    }

    // ---- TIME / DATE ----
    if (/what.*(?:time|date|day)|current\s*(time|date)|today'?s?\s*date|what\s*day/i.test(lowerMsg)) {
        const now = new Date();
        return {
            text: `📅 **Current Date & Time:**\n• Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n• Time: ${now.toLocaleTimeString('en-US')}\n• Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
            type: 'info'
        };
    }

    // ---- JOKES ----
    if (/joke|funny|make me laugh|humor|tell me something funny/i.test(lowerMsg)) {
        const jokes = [
            "Why do programmers prefer dark mode? Because light attracts bugs! 🐛😂",
            "Why did the JavaScript developer wear glasses? Because he couldn't C#! 😂",
            "A SQL query walks into a bar, sees two tables and asks: 'Can I join you?' 🍻😂",
            "What's a programmer's favorite hangout place? Foo Bar! 😂",
            "Why do Java developers wear glasses? Because they don't C#! 😂",
            "How many programmers does it take to change a light bulb? None. That's a hardware problem! 💡😂",
            "!false — It's funny because it's true. 😂",
            "There are only 10 types of people in the world: those who understand binary and those who don't. 😂",
            "Why was the computer cold? It left its Windows open! 🥶😂",
            "What do you call a snake that's 3.14 meters long? A π-thon! 🐍😂"
        ];
        return { text: jokes[Math.floor(Math.random() * jokes.length)], type: 'fun' };
    }

    // ---- MOTIVATION / INSPIRATION ----
    if (/motivat|inspir|encourage|cheer me up|i('?m| am) (sad|down|upset|depressed|feeling low)|positive|uplift/i.test(lowerMsg)) {
        const quotes = [
            "💪 **\"The only way to do great work is to love what you do.\"** — Steve Jobs\n\nKeep pushing forward, you're doing amazing!",
            "🌟 **\"Believe you can and you're halfway there.\"** — Theodore Roosevelt\n\nYou've got this! Every step counts.",
            "🚀 **\"Success is not final, failure is not fatal: it is the courage to continue that counts.\"** — Winston Churchill",
            "💡 **\"The best time to plant a tree was 20 years ago. The second best time is now.\"** — Chinese Proverb\n\nStart today!",
            "🔥 **\"Don't watch the clock; do what it does. Keep going.\"** — Sam Levenson",
            "✨ **\"It does not matter how slowly you go as long as you do not stop.\"** — Confucius"
        ];
        return { text: quotes[Math.floor(Math.random() * quotes.length)], type: 'motivation' };
    }

    // ---- GEOGRAPHY (must be before coding to prevent 'capital' matching 'api') ----
    if (/capital of|largest (country|city|ocean|continent)|population|continent|country|ocean|mountain|river|where is/i.test(lowerMsg)) {
        return handleGeographyQuestion(lowerMsg);
    }

    // ---- DEFINITION / WHAT IS (before coding) ----
    if (/^(what|whats|what'?s)\s+(is|are)\s+/i.test(lowerMsg) || /^define\s+/i.test(lowerMsg) || /^(explain|describe)\s+(what|how|the|a|an)\s+/i.test(lowerMsg)) {
        return handleDefinition(lowerMsg, originalMsg);
    }

    // ---- HOW TO / HOW DO (before coding) ----
    if (/^how\s+(to|do|does|can|should|would|could|might)\s+/i.test(lowerMsg)) {
        return handleHowTo(lowerMsg, originalMsg);
    }

    // ---- CODING HELP (expanded) — word boundaries to avoid false matches ----
    if (/(?:\bcode\b|\bprogram\b|\bfunction\b|\bvariable\b|\bloop\b|\barray\b|\bclass\b|\balgorithm\b|data\s*structure|\bframework\b|\blibrary\b|\bapi\b|\bdatabase\b|\bserver\b|\bfrontend\b|\bbackend\b|\breact\b|\bnode\b|\bexpress\b|\bangular\b|\bvue\b|\bdjango\b|\bflask\b|\bspring\b|\bdocker\b|\bgit\b|\bgithub\b|\bterminal\b|\blinux\b|\bmongodb\b|\bmysql\b|\bpostgres\b|\bfirebase\b|\baws\b|\bcloud\b|\bcoding\b|\bjavascript\b|\bpython\b|\bhtml\b|\bcss\b|\bsql\b)/i.test(lowerMsg)) {
        return handleCodingHelp(lowerMsg);
    }

    // ---- WHY QUESTIONS ----
    if (/^why\s+(is|are|do|does|did|should|would|can|don'?t)/i.test(lowerMsg)) {
        return handleWhyQuestion(lowerMsg, originalMsg);
    }

    // ---- COMPARISON ----
    if (/(?:difference|compare|vs|versus|better|which\s+is\s+better|pros\s+and\s+cons)\s+/i.test(lowerMsg)) {
        return handleComparison(lowerMsg, originalMsg);
    }

    // ---- LIST / GIVE ME / TELL ME ----
    if (/^(list|give me|tell me|name|show me|what are)\s+(some|the|a few|top|best|popular|famous|common|important)/i.test(lowerMsg)) {
        return handleListRequest(lowerMsg, originalMsg);
    }

    // ---- YES/NO / CAN YOU ----
    if (/^(can|could|will|would|do|does|is|are|should|have|has)\s+(you|i|we|it|this|that|they|he|she)/i.test(lowerMsg)) {
        return handleYesNoQuestion(lowerMsg, originalMsg);
    }

    // ---- WEATHER ----
    if (/weather|temperature|rain|sunny|forecast|climate|hot|cold outside/i.test(lowerMsg)) {
        return { text: "🌤️ I don't have access to real-time weather data, but I recommend checking:\n• **weather.com** — Detailed forecasts\n• **Google** — Just search \"weather [your city]\"\n• **AccuWeather** app — Hourly updates\n\nWould you like help with something else?", type: 'info' };
    }

    // ---- TRANSLATION ----
    if (/translate|how (do you|to) say|in (spanish|french|german|hindi|arabic|chinese|japanese|korean|italian|portuguese|russian)/i.test(lowerMsg)) {
        return { text: "🌍 I can help with basic translations! Here are some common phrases:\n\n• **Hello** — Hola (Spanish), Bonjour (French), Hallo (German), नमस्ते (Hindi), مرحبا (Arabic)\n• **Thank you** — Gracias, Merci, Danke, धन्यवाद, شكرا\n• **Goodbye** — Adiós, Au revoir, Tschüss, अलविदा, مع السلامة\n\nFor full translations, I recommend Google Translate! 🔤", type: 'info' };
    }

    // ---- HEALTH / FITNESS ----
    if (/health|exercise|workout|diet|nutrition|fitness|weight loss|sleep|calories|protein|vitamin|medicine|sick|headache|stress|anxiety|meditation|yoga/i.test(lowerMsg)) {
        return handleHealthQuestion(lowerMsg);
    }

    // ---- SCIENCE ----
    if (/science|physics|chemistry|biology|atom|molecule|gravity|evolution|space|universe|planet|star|galaxy|black hole|quantum|energy|force|cell|dna|genome/i.test(lowerMsg)) {
        return handleScienceQuestion(lowerMsg);
    }

    // ---- GEOGRAPHY ----
    if (/capital of|largest (country|city|ocean|continent)|population|continent|country|ocean|mountain|river|where is/i.test(lowerMsg)) {
        return handleGeographyQuestion(lowerMsg);
    }

    // ---- HISTORY ----
    if (/history|who (invented|discovered|founded|created)|when (was|did|were)|world war|ancient|century|civilization/i.test(lowerMsg)) {
        return handleHistoryQuestion(lowerMsg);
    }

    // ---- OPINION / BEST ----
    if (/(?:what do you think|your opinion|recommend|suggest|best|favorite|worst|rate|review)/i.test(lowerMsg)) {
        return handleOpinion(lowerMsg, originalMsg);
    }

    // ---- GENERAL / EXPLAIN ----
    if (/^(explain|describe|tell me about|what about|talk about|information about|info on)/i.test(lowerMsg)) {
        return handleExplain(lowerMsg, originalMsg);
    }

    // ---- RANDOM / BORED ----
    if (/(?:i'?m\s+)?bored|nothing to do|what should i do|entertain me|fun fact|random fact|did you know/i.test(lowerMsg)) {
        const facts = [
            "🧠 **Fun Fact:** Honey never spoils! Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still edible. 🍯",
            "🧠 **Fun Fact:** Octopuses have three hearts and blue blood! 🐙",
            "🧠 **Fun Fact:** A group of flamingos is called a \"flamboyance\"! 🦩",
            "🧠 **Fun Fact:** The first computer programmer was Ada Lovelace, who wrote the first algorithm in the 1840s! 💻",
            "🧠 **Fun Fact:** Bananas are berries, but strawberries aren't! 🍌",
            "🧠 **Fun Fact:** There are more possible iterations of a game of chess than there are atoms in the observable universe! ♟️",
            "🧠 **Fun Fact:** The internet weighs about 50 grams — the weight of all the electrons in motion! 🌐",
            "🧠 **Fun Fact:** A day on Venus is longer than a year on Venus! ☀️"
        ];
        return { text: facts[Math.floor(Math.random() * facts.length)], type: 'fun' };
    }

    // ---- WORD MEANING ----
    if (/meaning of|define\s|what does .*\s+mean|synonym|antonym|opposite of/i.test(lowerMsg)) {
        return handleDefinition(lowerMsg, originalMsg);
    }

    // ---- STORY / CREATIVE ----
    if (/tell me a story|write a (story|poem|haiku)|once upon a time|creative writing/i.test(lowerMsg)) {
        return handleCreative(lowerMsg);
    }

    // ---- MUSIC / MOVIES / BOOKS ----
    if (/music|song|movie|film|book|novel|album|artist|actor|actress|director|series|show|netflix|spotify/i.test(lowerMsg)) {
        return handleEntertainment(lowerMsg);
    }

    // ---- MATH WORD PROBLEMS ----
    if (/(?:what is|how much is|convert|how many)\s+\d/i.test(lowerMsg)) {
        return handleMath(message);
    }

    // ---- SMART FALLBACK (keyword-based) ----
    return handleSmartFallback(lowerMsg, originalMsg);
}

async function handleSlashCommand(lowerMsg, original, chatId) {
    const parts = original.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (cmd) {
        case '/help':
            return { text: `🤖 **Commands:**\n📊 /summarize\n🧮 /math [expr]\n📝 /notes [text]\n💡 /suggest\n⏰ /time\n🔢 /count`, type: 'help' };
        case '/summarize': return await handleSummarize(chatId);
        case '/math': return handleMath(args || 'no expression');
        case '/notes': return handleNotes(args || 'No text provided');
        case '/suggest': return { text: `💡 Suggested: "${["That sounds great! 👍", "I agree, let's do it!", "Can you explain more?", "Good point!"][Math.floor(Math.random() * 4)]}"`, type: 'suggest' };
        case '/time': return { text: `⏰ ${new Date().toLocaleString()}`, type: 'info' };
        case '/count': return await handleCount(chatId);
        default: return { text: `❓ Unknown: ${cmd}. Type /help`, type: 'error' };
    }
}

function handleMath(expr) {
    const mathExpr = expr.replace(/[^0-9+\-*/().% ]/g, '').trim();
    if (!mathExpr) return { text: '🧮 Example: /math 15*3+7', type: 'math' };
    try {
        if (!/^[0-9+\-*/().% ]+$/.test(mathExpr)) return { text: '🧮 Invalid expression', type: 'error' };
        const result = new Function('return (' + mathExpr + ')')();
        if (isNaN(result) || !isFinite(result)) return { text: '🧮 Error in calculation', type: 'error' };
        return { text: `🧮 ${mathExpr} = **${Math.round(result * 10000) / 10000}**`, type: 'math' };
    } catch (e) { return { text: '🧮 Error in calculation', type: 'error' }; }
}

async function handleSummarize(chatId) {
    try {
        let messages;
        if (chatId) {
            messages = await query('SELECT message, sender_username as username FROM private_messages WHERE chat_id = ? AND is_ai = FALSE ORDER BY timestamp DESC LIMIT 20', [chatId]);
        } else {
            messages = await query('SELECT message, username FROM messages ORDER BY timestamp DESC LIMIT 20');
        }
        if (!messages || messages.length === 0) return { text: '📊 No messages to summarize yet!', type: 'summary' };

        const users = [...new Set(messages.map(m => m.username))];
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'was', 'i', 'you', 'it', 'we', 'they', 'this', 'that', 'not', 'no', 'yes', 'so', 'just', 'hi', 'hello', 'hey', 'ok']);
        const wf = {};
        messages.forEach(m => m.message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).forEach(w => { if (w.length > 2 && !stopWords.has(w)) wf[w] = (wf[w] || 0) + 1; }));
        const top = Object.entries(wf).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

        return { text: `📊 **Summary** (${messages.length} msgs)\n👥 ${users.join(', ')}\n🔑 Topics: ${top.join(', ') || 'General chat'}`, type: 'summary' };
    } catch (e) { return { text: '📊 Error generating summary', type: 'error' }; }
}

function handleNotes(text) {
    if (!text || text.length < 3) return { text: '📝 Usage: /notes [your text here]', type: 'notes' };
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 2);
    let notes = '📝 **Notes:**\n';
    sentences.forEach((s, i) => { notes += `${i + 1}. ${s.trim()}\n`; });
    return { text: notes, type: 'notes' };
}

async function handleCount(chatId) {
    try {
        if (chatId) {
            const r = await query('SELECT COUNT(*) as t FROM private_messages WHERE chat_id = ?', [chatId]);
            return { text: `🔢 ${r[0].t} messages in this chat`, type: 'info' };
        }
        const r = await query('SELECT COUNT(*) as t FROM messages');
        return { text: `🔢 ${r[0].t} messages in global chat`, type: 'info' };
    } catch (e) { return { text: '🔢 Error', type: 'error' }; }
}

function handleCodingHelp(msg) {
    if (/javascript|js(?!on)/i.test(msg)) return { text: '💻 **JavaScript Tips:**\n• Use `const` and `let` (avoid `var`)\n• Arrow functions: `const fn = (x) => x * 2`\n• Template literals: `` `Hello ${name}` ``\n• Array methods: `.map()`, `.filter()`, `.reduce()`, `.find()`\n• Destructuring: `const { a, b } = obj`\n• Async/await for clean async code\n• Optional chaining: `obj?.prop?.value`\n• Spread operator: `[...arr1, ...arr2]`\n• Promises: `new Promise((resolve, reject) => {})`\n\nWhat specific JS topic would you like to explore? 🚀', type: 'code' };

    if (/python/i.test(msg)) return { text: '💻 **Python Tips:**\n• f-strings: `f"Hello {name}"`\n• List comprehensions: `[x*2 for x in range(10)]`\n• Virtual environments: `python -m venv env`\n• Type hints: `def greet(name: str) -> str:`\n• Decorators: `@my_decorator`\n• Context managers: `with open("file") as f:`\n• Lambda functions: `lambda x: x * 2`\n• Dictionary comprehensions: `{k: v for k, v in items}`\n\nAsk me about any Python topic! 🐍', type: 'code' };

    if (/react/i.test(msg)) return { text: '⚛️ **React Tips:**\n• Functional components with hooks\n• `useState` for state management\n• `useEffect` for side effects\n• `useContext` for global state\n• Props for parent-to-child data flow\n• Conditional rendering with `&&` or ternary\n• Key prop for lists: `items.map(i => <Item key={i.id} />)`\n• Custom hooks for reusable logic', type: 'code' };

    if (/node|express/i.test(msg)) return { text: '🟢 **Node.js / Express Tips:**\n• `npm init -y` to start a project\n• Express routing: `app.get("/path", handler)`\n• Middleware: `app.use(express.json())`\n• Environment variables with `dotenv`\n• Async error handling with try/catch\n• Use `nodemon` for auto-restart in development\n• RESTful API patterns: GET, POST, PUT, DELETE\n• Database connection pooling for performance', type: 'code' };

    if (/html/i.test(msg)) return { text: '📄 **HTML Tips:**\n• Semantic elements: `<header>`, `<main>`, `<footer>`, `<article>`, `<section>`\n• Use `<form>` with proper input types\n• Alt text on images for accessibility\n• Meta tags for SEO\n• Use `<template>` for client-side rendering\n• Responsive images with `<picture>` or `srcset`', type: 'code' };

    if (/css/i.test(msg)) return { text: '🎨 **CSS Tips:**\n• Flexbox: `display: flex` for 1D layouts\n• Grid: `display: grid` for 2D layouts\n• CSS Variables: `--primary: #6366f1`\n• Media queries for responsive design\n• Transitions: `transition: all 0.3s ease`\n• Animations: `@keyframes` with `animation`\n• `clamp()` for fluid typography\n• `:is()` and `:where()` pseudo-classes', type: 'code' };

    if (/sql|mysql|postgres/i.test(msg)) return { text: '🗄️ **SQL Tips:**\n• Use JOINs to combine tables\n• Index frequently queried columns\n• Prepared statements prevent SQL injection\n• `EXPLAIN` to analyze query performance\n• `GROUP BY` with aggregate functions\n• Transactions for data integrity\n• Normalization (1NF, 2NF, 3NF)\n• Use `LIMIT` and `OFFSET` for pagination', type: 'code' };

    if (/git|github/i.test(msg)) return { text: '📦 **Git Tips:**\n• `git init` — Start a repo\n• `git add .` + `git commit -m "msg"` — Save changes\n• `git branch feature` + `git checkout feature` — Branching\n• `git merge feature` — Merge branches\n• `git stash` — Temporarily save changes\n• `git log --oneline` — View history\n• `.gitignore` — Exclude files\n• Pull requests for code review on GitHub', type: 'code' };

    if (/docker/i.test(msg)) return { text: '🐳 **Docker Tips:**\n• `Dockerfile` defines your container image\n• `docker build -t myapp .` — Build image\n• `docker run -p 3000:3000 myapp` — Run container\n• `docker-compose` for multi-container apps\n• Volumes for persistent data\n• Multi-stage builds for smaller images', type: 'code' };

    if (/api/i.test(msg)) return { text: '🔗 **API Design Tips:**\n• RESTful: Use HTTP verbs (GET, POST, PUT, DELETE)\n• Use proper status codes (200, 201, 400, 404, 500)\n• Version your API: `/api/v1/resource`\n• Use JSON for request/response bodies\n• Authentication: JWT tokens or API keys\n• Rate limiting to prevent abuse\n• CORS configuration for security', type: 'code' };

    if (/algorithm|data\s*structure/i.test(msg)) return { text: '🧮 **Data Structures & Algorithms:**\n• **Arrays** — O(1) access, O(n) search\n• **Linked Lists** — O(1) insert/delete at head\n• **Hash Maps** — O(1) average lookup\n• **Trees** — O(log n) search in BST\n• **Sorting** — Quick Sort O(n log n), Bubble Sort O(n²)\n• **Searching** — Binary Search O(log n)\n• **Graph** — BFS (shortest path), DFS (traversal)\n• **Dynamic Programming** — Memoize overlapping subproblems', type: 'code' };

    if (/firebase|aws|cloud/i.test(msg)) return { text: '☁️ **Cloud Tips:**\n• **Firebase**: Auth, Firestore, Hosting, Functions\n• **AWS**: EC2, S3, Lambda, RDS, DynamoDB\n• **Deployment**: Use CI/CD pipelines\n• **Serverless**: AWS Lambda, Firebase Functions\n• **Storage**: S3, Cloud Storage\n• **Databases**: RDS, DynamoDB, Firestore', type: 'code' };

    if (/angular|vue|django|flask|spring/i.test(msg)) {
        if (/angular/i.test(msg)) return { text: '🅰️ **Angular:** TypeScript-based, components, services, dependency injection, RxJS observables, NgModules, Angular CLI', type: 'code' };
        if (/vue/i.test(msg)) return { text: '💚 **Vue.js:** Composition API, reactive refs, computed properties, v-model, Vue Router, Pinia for state', type: 'code' };
        if (/django/i.test(msg)) return { text: '🐍 **Django:** MTV pattern, ORM, admin panel, migrations, DRF for APIs, templates, middleware', type: 'code' };
        if (/flask/i.test(msg)) return { text: '🧪 **Flask:** Lightweight, decorators for routing, Jinja2 templates, SQLAlchemy ORM, Blueprints', type: 'code' };
        if (/spring/i.test(msg)) return { text: '🍃 **Spring Boot:** Annotations, dependency injection, JPA, REST controllers, Spring Security', type: 'code' };
    }

    if (/mongodb/i.test(msg)) return { text: '🍃 **MongoDB:** NoSQL document database, collections, documents (JSON-like), aggregation pipeline, indexes, Mongoose ODM for Node.js', type: 'code' };
    if (/linux|terminal|command/i.test(msg)) return { text: '🐧 **Linux/Terminal:**\n• `ls` — list files, `cd` — change directory\n• `mkdir` — create folder, `rm` — delete\n• `grep` — search text, `find` — search files\n• `chmod` — permissions, `sudo` — admin\n• `|` pipe output, `>` redirect to file\n• `top` or `htop` — process monitor', type: 'code' };

    return { text: '💻 I can help with:\n• JavaScript, Python, Java, C++\n• React, Node.js, Express, Angular, Vue\n• HTML, CSS, SQL, MongoDB\n• Git, Docker, AWS, Firebase\n• Algorithms & Data Structures\n• API Design & Best Practices\n\nJust mention the technology in your question! 🚀', type: 'code' };
}

// ============================================
// DEFINITION HANDLER
// ============================================
function handleDefinition(lowerMsg, originalMsg) {
    const topic = originalMsg.replace(/^(what'?s?|what is|what are|define|explain|describe)\s+(a |an |the )?/i, '').replace(/\?$/, '').trim();
    const defs = {
        'ai': '🤖 **Artificial Intelligence (AI)** is the simulation of human intelligence by computer systems. It includes learning, reasoning, and self-correction. Examples: ChatGPT, Siri, self-driving cars.',
        'machine learning': '🧠 **Machine Learning** is a subset of AI where systems learn and improve from experience without being explicitly programmed. It uses algorithms to find patterns in data.',
        'blockchain': '🔗 **Blockchain** is a decentralized, distributed digital ledger that records transactions across many computers. It powers cryptocurrencies like Bitcoin.',
        'cryptocurrency': '💰 **Cryptocurrency** is a digital or virtual currency that uses cryptography for security. Examples: Bitcoin, Ethereum, Solana.',
        'internet': '🌐 **The Internet** is a global network of interconnected computer networks that communicate using standardized protocols (TCP/IP).',
        'cloud computing': '☁️ **Cloud Computing** is the delivery of computing services (servers, storage, databases, software) over the internet rather than using local servers.',
        'api': '🔗 **API (Application Programming Interface)** is a set of rules and protocols that allows different software applications to communicate with each other.',
        'database': '🗄️ **A Database** is an organized collection of structured data stored electronically. Types include relational (MySQL, PostgreSQL) and NoSQL (MongoDB, Redis).',
        'algorithm': '📊 **An Algorithm** is a step-by-step procedure or set of rules for solving a problem or accomplishing a task in computing.',
        'programming': '💻 **Programming** is the process of creating instructions for computers to follow. It uses programming languages like JavaScript, Python, Java, etc.',
        'open source': '📖 **Open Source** refers to software whose source code is freely available for anyone to view, modify, and distribute.',
        'devops': '🔄 **DevOps** is a set of practices that combines software development (Dev) and IT operations (Ops) to shorten the development lifecycle.',
        'agile': '🏃 **Agile** is a project management methodology that breaks work into small increments called sprints, with frequent reassessment and adaptation.',
        'oop': '🧱 **OOP (Object-Oriented Programming)** is a programming paradigm based on objects containing data (fields) and code (methods). Key concepts: Encapsulation, Inheritance, Polymorphism, Abstraction.',
        'rest': '🔗 **REST (Representational State Transfer)** is an architectural style for APIs that uses HTTP methods (GET, POST, PUT, DELETE) to perform CRUD operations.',
        'frontend': '🎨 **Frontend** is the part of a website or application that users interact with directly. Technologies: HTML, CSS, JavaScript, React, Vue.',
        'backend': '⚙️ **Backend** is the server-side of an application that processes business logic, manages databases, and handles authentication. Technologies: Node.js, Python, Java.',
        'fullstack': '🔄 **Full Stack** refers to a developer who works on both the frontend (user interface) and backend (server-side) of an application.',
        'cybersecurity': '🔒 **Cybersecurity** is the practice of protecting systems, networks, and programs from digital attacks, unauthorized access, and data breaches.',
        'data science': '📈 **Data Science** is a field that uses scientific methods, algorithms, and systems to extract knowledge and insights from structured and unstructured data.'
    };

    const topicLower = topic.toLowerCase();
    for (const [key, value] of Object.entries(defs)) {
        if (topicLower.includes(key)) return { text: value, type: 'info' };
    }
    return { text: `📚 **${topic}**\n\n${topic} is an important topic that encompasses several key areas:\n\n• **Overview:** ${topic} refers to a concept or subject with real-world significance and applications.\n• **Key Aspects:** It involves understanding its principles, causes, effects, and practical implications.\n• **Importance:** Knowledge of ${topic} helps us make informed decisions and understand the world better.\n• **Learning More:** Explore ${topic} through courses, research papers, and hands-on experience.\n\nFeel free to ask me more specific questions about ${topic}! 💡`, type: 'info' };
}

// ============================================
// HOW-TO HANDLER
// ============================================
function handleHowTo(lowerMsg, originalMsg) {
    if (/learn\s*(to\s*)?(code|coding|programming|program|develop)/i.test(lowerMsg)) {
        return { text: '📚 **How to Learn Programming:**\n\n1. **Pick a language:** Python (beginner-friendly) or JavaScript (web)\n2. **Free resources:**\n   • freeCodeCamp.org\n   • Codecademy\n   • The Odin Project\n   • CS50 on YouTube\n3. **Practice daily:** Solve problems on LeetCode, HackerRank\n4. **Build projects:** To-do app, calculator, portfolio website\n5. **Join communities:** Reddit r/learnprogramming, Discord servers\n\nConsistency is key! Even 30 minutes daily makes a huge difference. 🚀', type: 'info' };
    }
    if (/make.*website|create.*website|build.*website/i.test(lowerMsg)) {
        return { text: '🌐 **How to Build a Website:**\n\n1. **Learn basics:** HTML (structure), CSS (styling), JavaScript (interaction)\n2. **Choose a framework:** React, Vue, or Angular\n3. **Backend:** Node.js + Express, Python + Django/Flask\n4. **Database:** MySQL, PostgreSQL, or MongoDB\n5. **Hosting:** Vercel, Netlify, Railway, AWS\n6. **Domain:** Buy from Namecheap or Google Domains\n\nStart with a simple HTML page and build up! 💻', type: 'info' };
    }
    if (/study|learn|prepare.*exam|pass/i.test(lowerMsg)) {
        return {
            text: "📖 **Study Tips:**\n\n1. **Active recall:** Test yourself instead of re-reading\n2. **Spaced repetition:** Review at increasing intervals\n3. **Pomodoro technique:** 25 min study, 5 min break\n4. **Teach others:** Explaining reinforces understanding\n5. **Minimize distractions:** Use app blockers\n6. **Take handwritten notes:** Better retention\n7. **Sleep well:** Memory consolidation happens during sleep\n8. **Break topics into chunks:** Easier to digest\n\nYou've got this! 💪", type: 'info'
        };
    }
    if (/start.*business|make.*money|earn/i.test(lowerMsg)) {
        return { text: '💰 **How to Start Earning:**\n\n1. **Freelancing:** Upwork, Fiverr, Freelancer\n2. **Content creation:** YouTube, blogging, social media\n3. **Learn in-demand skills:** Web dev, data science, digital marketing\n4. **Sell products:** Etsy, Shopify, Amazon\n5. **Teach online:** Udemy, Skillshare, tutoring\n6. **Open source contributions** → job opportunities\n\nStart with what you know and build from there! 🚀', type: 'info' };
    }

    const action = originalMsg.replace(/^how\s+(to|do|does|can|should|would|could|might)\s+(i\s+)?/i, '').replace(/\?$/, '').trim();
    return { text: `💡 **How to ${action}:**\n\nGreat question! Here are some general tips:\n\n1. **Research** — Look up guides and tutorials online\n2. **Break it down** — Divide the task into smaller steps\n3. **Practice** — Hands-on experience is the best teacher\n4. **Ask for help** — Communities like Reddit, Stack Overflow, Discord\n5. **Be patient** — Learning takes time, don't give up!\n\nWould you like more specific help on this topic? 🤔`, type: 'info' };
}

// ============================================
// WHY QUESTION HANDLER
// ============================================
function handleWhyQuestion(lowerMsg, originalMsg) {
    if (/why.*(sky|blue)/i.test(lowerMsg)) return { text: '🌤️ **Why is the sky blue?**\n\nSunlight contains all colors of the rainbow. When it enters Earth\'s atmosphere, it collides with gas molecules and gets scattered. Blue light has a shorter wavelength, so it scatters more than other colors — making the sky appear blue! This is called **Rayleigh scattering**. 🔬', type: 'info' };
    if (/why.*(water|wet)/i.test(lowerMsg)) return { text: '💧 **Why is water wet?**\n\nWater is H₂O — two hydrogen atoms bonded to one oxygen atom. The molecules have a polar structure, creating surface tension and adhesion. When water touches a surface, it spreads and makes it "wet." Technically, water itself isn\'t wet — it *makes* things wet! 🧪', type: 'info' };
    if (/why.*(learn|study|education|school).*(important|matter|necessary)/i.test(lowerMsg)) return { text: '📚 **Why is education important?**\n\n1. **Knowledge** — Understanding the world\n2. **Critical thinking** — Solving problems\n3. **Career opportunities** — Better job prospects\n4. **Personal growth** — Confidence and independence\n5. **Innovation** — Driving progress and technology\n\nEducation opens doors you didn\'t even know existed! 🎓', type: 'info' };

    const question = originalMsg.replace(/\?$/, '').trim();
    return { text: `🤔 **${question}?**\n\nThat's a thoughtful question! While I may not have the complete answer, here are some ways to find out:\n\n1. **Search online** — Google, Wikipedia, Quora\n2. **Watch explanations** — YouTube has great videos on almost everything\n3. **Ask experts** — Reddit communities, forums\n4. **Read books** — Libraries and e-books\n\nI'm happy to help with more specific questions! 💡`, type: 'info' };
}

// ============================================
// COMPARISON HANDLER
// ============================================
function handleComparison(lowerMsg, originalMsg) {
    if (/react.*(?:vs|versus|or).*angular|angular.*(?:vs|versus|or).*react/i.test(lowerMsg)) {
        return { text: '⚛️ **React vs Angular:**\n\n| Feature | React | Angular |\n|---------|-------|--------|\n| Type | Library | Framework |\n| Language | JavaScript/JSX | TypeScript |\n| Learning | Easier | Steeper |\n| Speed | Fast (Virtual DOM) | Fast (Change Detection) |\n| State | Redux, Zustand | Built-in services |\n| Community | Huge | Large |\n\n**Choose React** for flexibility. **Choose Angular** for large enterprise apps. 🚀', type: 'info' };
    }
    if (/python.*(?:vs|versus|or).*java|java.*(?:vs|versus|or).*python/i.test(lowerMsg)) {
        return { text: '🐍 **Python vs Java:**\n\n| Feature | Python | Java |\n|---------|--------|------|\n| Syntax | Simple, readable | Verbose |\n| Speed | Slower | Faster |\n| Typing | Dynamic | Static |\n| Use cases | AI/ML, scripting, web | Enterprise, Android, backend |\n| Learning | Easier | Moderate |\n\n**Choose Python** for data science, AI. **Choose Java** for enterprise & Android. 💻', type: 'info' };
    }

    const topic = originalMsg.replace(/^.*(difference|compare|vs|versus|better|pros and cons)\s*/i, '').replace(/between\s+/i, '').replace(/\?$/, '').trim();
    return { text: `⚖️ **Comparing: ${topic}**\n\nTo make a good comparison, consider:\n\n1. **Purpose** — What problem does each solve?\n2. **Performance** — Which is faster/more efficient?\n3. **Learning curve** — Which is easier to learn?\n4. **Community** — Which has better support?\n5. **Use case** — Which fits your specific needs?\n\nWant me to compare specific technologies? Just ask! 🤔`, type: 'info' };
}

// ============================================
// LIST REQUEST HANDLER
// ============================================
function handleListRequest(lowerMsg, originalMsg) {
    if (/programming\s*language/i.test(lowerMsg)) return { text: '💻 **Top Programming Languages (2024):**\n\n1. 🟡 **JavaScript** — Web development\n2. 🐍 **Python** — AI, data science, automation\n3. ☕ **Java** — Enterprise, Android\n4. 🔷 **TypeScript** — Typed JavaScript\n5. 🦀 **Rust** — Systems programming\n6. 🐹 **Go** — Cloud, microservices\n7. 💎 **C#** — Gaming (Unity), .NET\n8. 🍎 **Swift** — iOS development\n9. 📱 **Kotlin** — Android development\n10. 🐘 **PHP** — Web backends', type: 'info' };

    if (/framework/i.test(lowerMsg)) return { text: '🔧 **Popular Frameworks:**\n\n**Frontend:**\n• ⚛️ React — Facebook\n• 💚 Vue.js — Lightweight & flexible\n• 🅰️ Angular — Google\n• ⏭️ Next.js — React framework\n\n**Backend:**\n• 🟢 Express.js (Node.js)\n• 🐍 Django (Python)\n• 🧪 Flask (Python)\n• 🍃 Spring Boot (Java)\n• 💎 Ruby on Rails', type: 'info' };

    const topic = originalMsg.replace(/^(list|give me|tell me|name|show me|what are)\s+(some|the|a few|top|best|popular|famous|common|important)\s*/i, '').replace(/\?$/, '').trim();
    return { text: `📋 **${topic}:**\n\nI'd love to help list these! To give you a better answer, try being more specific. For example:\n\n• "List top programming languages"\n• "Give me popular frameworks"\n• "What are the best study techniques"\n• "Tell me some fun facts"\n\nThe more specific, the better my answer! 💡`, type: 'info' };
}

// ============================================
// YES/NO QUESTION HANDLER
// ============================================
function handleYesNoQuestion(lowerMsg, originalMsg) {
    if (/can you help/i.test(lowerMsg)) return { text: "Of course! 😊 I'm here to help. What do you need assistance with?", type: 'greeting' };
    if (/can you (code|program|write code)/i.test(lowerMsg)) return { text: "💻 I can help with coding concepts, explain code, debug logic, and provide code examples! Just tell me what language and what you need.", type: 'info' };
    if (/can (i|you) (learn|master).*(month|week|day|year)/i.test(lowerMsg)) return { text: "📚 Learning depends on dedication and the topic! Here's a rough guide:\n\n• **HTML/CSS basics** — 2-4 weeks\n• **JavaScript fundamentals** — 1-3 months\n• **React/Vue** — 2-4 months\n• **Full stack** — 6-12 months\n• **Data Science/ML** — 6-12 months\n\nConsistency matters more than speed! 🚀", type: 'info' };
    if (/should i learn/i.test(lowerMsg)) {
        const topic = originalMsg.replace(/^should i learn\s*/i, '').replace(/\?$/, '').trim();
        return { text: `📚 **Should you learn ${topic}?**\n\nHere's how to decide:\n\n1. **Is it in demand?** — Check job listings\n2. **Does it interest you?** — Passion drives learning\n3. **Career alignment** — Does it fit your goals?\n4. **Community support** — Resources available?\n\nIf you're unsure, try a free tutorial first and see if you enjoy it! 💡`, type: 'info' };
    }
    if (/is (it|this) (worth|good|safe)/i.test(lowerMsg)) {
        return { text: `🤔 That depends on context! Consider:\n\n1. **What are the benefits** vs **risks**?\n2. **What do others say?** — Check reviews\n3. **Does it align with your goals?**\n4. **Can you try it risk-free first?**\n\nWant me to help analyze a specific topic? 💡`, type: 'info' };
    }

    const question = originalMsg.replace(/\?$/, '').trim();
    return { text: `💬 **${question}?**\n\nThat's a great question! Based on what I know:\n\n• It depends on the specific context and situation\n• Consider the pros and cons carefully\n• Research from multiple sources is always helpful\n\nWould you like me to dive deeper into any aspect? 🤔`, type: 'info' };
}

// ============================================
// HEALTH HANDLER
// ============================================
function handleHealthQuestion(lowerMsg) {
    if (/sleep/i.test(lowerMsg)) return { text: '😴 **Sleep Tips:**\n\n• Adults need **7-9 hours** per night\n• Maintain a consistent sleep schedule\n• Avoid screens 1 hour before bed\n• Keep your bedroom cool and dark\n• Limit caffeine after 2 PM\n• Exercise regularly (but not right before bed)\n• Try relaxation techniques: deep breathing, meditation\n\n⚠️ For sleep disorders, please consult a doctor!', type: 'health' };
    if (/stress|anxiety/i.test(lowerMsg)) return { text: '🧘 **Managing Stress & Anxiety:**\n\n1. **Deep breathing** — 4-7-8 technique\n2. **Exercise** — Even a 20-min walk helps\n3. **Limit caffeine** and alcohol\n4. **Talk to someone** — Friends, family, or a professional\n5. **Journaling** — Write down your thoughts\n6. **Meditation** — Apps like Headspace or Calm\n7. **Break tasks** into smaller steps\n8. **Get enough sleep**\n\n⚠️ If anxiety persists, please talk to a mental health professional! 💙', type: 'health' };
    if (/meditation|yoga|mindful/i.test(lowerMsg)) return { text: '🧘 **Meditation & Mindfulness:**\n\n• Start with just **5 minutes** daily\n• Focus on your breath — count inhales and exhales\n• Body scan meditation for relaxation\n• Apps: **Headspace**, **Calm**, **Insight Timer** (free)\n• Yoga combines physical movement with mindfulness\n• Even walking meditation counts!\n\nConsistency is more important than duration. 🌿', type: 'health' };
    if (/exercise|workout|fitness/i.test(lowerMsg)) return { text: '💪 **Exercise Tips:**\n\n• **Beginners:** Start with 20-30 min, 3x per week\n• **Cardio:** Running, cycling, swimming\n• **Strength:** Push-ups, squats, planks\n• **Flexibility:** Stretching, yoga\n• **Rest days** are important for recovery\n• Stay **hydrated** — drink water before, during, after\n• Warm up before, cool down after\n\n🏋️ Consistency beats intensity!', type: 'health' };
    if (/diet|nutrition|calorie|weight/i.test(lowerMsg)) return { text: '🥗 **Nutrition Tips:**\n\n• Eat a **balanced diet**: fruits, vegetables, proteins, whole grains\n• Drink **8 glasses of water** daily\n• **Protein**: Chicken, fish, beans, eggs, tofu\n• Limit processed foods and sugary drinks\n• Eat smaller, frequent meals\n• Don\'t skip breakfast\n• Read nutrition labels\n\n⚠️ For personalized diet plans, consult a nutritionist!', type: 'health' };

    return { text: '🏥 **Health Tip:**\n\nMaintain a healthy lifestyle with:\n• Balanced diet 🥗\n• Regular exercise 💪\n• 7-9 hours of sleep 😴\n• Stress management 🧘\n• Stay hydrated 💧\n\n⚠️ **Important:** For medical concerns, always consult a healthcare professional. I\'m an AI assistant, not a doctor! 🩺', type: 'health' };
}

// ============================================
// SCIENCE HANDLER
// ============================================
function handleScienceQuestion(lowerMsg) {
    if (/gravity/i.test(lowerMsg)) return { text: '🍎 **Gravity:**\n\nGravity is the force that attracts objects with mass toward each other. On Earth, it accelerates objects at **9.8 m/s²**.\n\n• **Newton** described it as a force between masses (F = G × m₁ × m₂ / r²)\n• **Einstein** explained it as a curvature of spacetime caused by mass\n• The Moon\'s gravity causes ocean **tides** on Earth\n• Gravity keeps planets orbiting the Sun 🌍', type: 'info' };
    if (/black hole/i.test(lowerMsg)) return { text: '🕳️ **Black Holes:**\n\nA black hole is a region of spacetime where gravity is so strong that nothing — not even light — can escape.\n\n• Formed when massive stars collapse\n• The boundary is called the **Event Horizon**\n• The center is the **Singularity** — infinite density\n• First photo taken in 2019 (M87 galaxy)\n• Supermassive black holes exist at galaxy centers\n• Our galaxy\'s black hole: **Sagittarius A*** ⭐', type: 'info' };
    if (/planet|solar system/i.test(lowerMsg)) return { text: '🪐 **Solar System:**\n\n☀️ Sun → Mercury → Venus → 🌍 Earth → Mars → Jupiter → Saturn → Uranus → Neptune\n\n• **Largest:** Jupiter (1,321 Earths could fit inside)\n• **Hottest:** Venus (462°C due to greenhouse effect)\n• **Rings:** Saturn, Jupiter, Uranus, Neptune\n• **Moons:** Jupiter has 95! Saturn has 146!\n• Pluto was reclassified as a **dwarf planet** in 2006', type: 'info' };
    if (/atom|molecule/i.test(lowerMsg)) return { text: '⚛️ **Atoms & Molecules:**\n\n• An **atom** is the smallest unit of an element\n• Parts: **protons** (+), **neutrons** (0), **electrons** (-)\n• A **molecule** is two or more atoms bonded together\n• Water (H₂O) = 2 hydrogen + 1 oxygen\n• Everything around you is made of atoms!\n• There are **118 elements** in the periodic table 🧪', type: 'info' };
    if (/dna|genome|evolution/i.test(lowerMsg)) return { text: '🧬 **DNA & Evolution:**\n\n• **DNA** = Deoxyribonucleic Acid — the blueprint of life\n• Double helix structure discovered by Watson & Crick (1953)\n• Human genome has about **3 billion** base pairs\n• **Evolution** — Species change over time through natural selection\n• Humans share ~98.7% DNA with chimpanzees\n• DNA is found in the **nucleus** of every cell 🔬', type: 'info' };
    if (/space|universe|galaxy|star/i.test(lowerMsg)) return { text: '🌌 **Space Facts:**\n\n• The observable universe is **93 billion light-years** across\n• There are ~2 trillion galaxies in the universe\n• Our galaxy (**Milky Way**) has 100-400 billion stars\n• The nearest star is **Proxima Centauri** (4.24 light-years)\n• Light from the Sun takes **8 minutes** to reach Earth\n• The universe is about **13.8 billion years** old 🚀', type: 'info' };

    return { text: '🔬 **Science is fascinating!**\n\nI can help with:\n• 🍎 Physics — gravity, energy, forces, quantum\n• 🧪 Chemistry — atoms, molecules, reactions\n• 🧬 Biology — DNA, cells, evolution\n• 🌌 Space — planets, stars, galaxies, black holes\n\nWhat specific science topic interests you? 🤔', type: 'info' };
}

// ============================================
// GEOGRAPHY HANDLER
// ============================================
function handleGeographyQuestion(lowerMsg) {
    if (/capital of india/i.test(lowerMsg)) return { text: '🇮🇳 The capital of **India** is **New Delhi**. It\'s located in northern India and serves as the seat of the Indian government. 🏛️', type: 'info' };
    if (/capital of (usa|united states|america)/i.test(lowerMsg)) return { text: '🇺🇸 The capital of the **United States** is **Washington, D.C.** (District of Columbia). 🏛️', type: 'info' };
    if (/capital of (uk|united kingdom|england|britain)/i.test(lowerMsg)) return { text: '🇬🇧 The capital of the **United Kingdom** is **London**. 🏛️', type: 'info' };
    if (/capital of japan/i.test(lowerMsg)) return { text: '🇯🇵 The capital of **Japan** is **Tokyo**, the most populous metropolitan area in the world. 🗼', type: 'info' };
    if (/capital of france/i.test(lowerMsg)) return { text: '🇫🇷 The capital of **France** is **Paris**, known as the "City of Light." 🗼', type: 'info' };
    if (/capital of china/i.test(lowerMsg)) return { text: '🇨🇳 The capital of **China** is **Beijing**. 🏯', type: 'info' };
    if (/capital of germany/i.test(lowerMsg)) return { text: '🇩🇪 The capital of **Germany** is **Berlin**. 🏛️', type: 'info' };
    if (/capital of australia/i.test(lowerMsg)) return { text: '🇦🇺 The capital of **Australia** is **Canberra** (not Sydney!). 🦘', type: 'info' };
    if (/capital of canada/i.test(lowerMsg)) return { text: '🇨🇦 The capital of **Canada** is **Ottawa** (not Toronto!). 🍁', type: 'info' };
    if (/capital of russia/i.test(lowerMsg)) return { text: '🇷🇺 The capital of **Russia** is **Moscow**. 🏛️', type: 'info' };
    if (/capital of brazil/i.test(lowerMsg)) return { text: '🇧🇷 The capital of **Brazil** is **Brasília** (not Rio de Janeiro!). 🌴', type: 'info' };
    if (/largest country/i.test(lowerMsg)) return { text: '🌍 **Largest Countries by Area:**\n1. 🇷🇺 Russia — 17.1 million km²\n2. 🇨🇦 Canada — 9.98 million km²\n3. 🇺🇸 USA — 9.83 million km²\n4. 🇨🇳 China — 9.6 million km²\n5. 🇧🇷 Brazil — 8.5 million km²', type: 'info' };
    if (/largest ocean/i.test(lowerMsg)) return { text: '🌊 **Oceans by Size:**\n1. Pacific Ocean — 165.25 million km²\n2. Atlantic Ocean — 106.4 million km²\n3. Indian Ocean — 70.56 million km²\n4. Southern Ocean — 21.96 million km²\n5. Arctic Ocean — 14.06 million km²', type: 'info' };
    if (/continent/i.test(lowerMsg)) return { text: '🌍 **7 Continents:**\n1. Asia — Largest, most populated\n2. Africa — 54 countries\n3. North America\n4. South America\n5. Antarctica — No permanent residents\n6. Europe\n7. Australia/Oceania — Smallest', type: 'info' };

    const topic = lowerMsg.replace(/^.*(capital of|where is|largest)\s*/i, '').replace(/\?$/, '').trim();
    return { text: `🌍 **Geography: ${topic}**\n\nI know capitals, largest countries, continents, and oceans! Try asking:\n• "What is the capital of India?"\n• "What is the largest country?"\n• "How many continents are there?"\n\nFor detailed geographic info, check Google Maps or Wikipedia! 🗺️`, type: 'info' };
}

// ============================================
// HISTORY HANDLER
// ============================================
function handleHistoryQuestion(lowerMsg) {
    if (/who invented (the\s+)?internet/i.test(lowerMsg)) return { text: '🌐 **Who Invented the Internet?**\n\nThe internet was not invented by one person:\n• **1969** — ARPANET (US military network)\n• **Tim Berners-Lee** — Invented the World Wide Web (1989)\n• **Vint Cerf & Bob Kahn** — Created TCP/IP protocol\n• The modern internet evolved from decades of research by many scientists 🔬', type: 'info' };
    if (/who invented (the\s+)?(computer|laptop)/i.test(lowerMsg)) return { text: '💻 **History of Computers:**\n\n• **Charles Babbage** — Designed the Analytical Engine (1837)\n• **Ada Lovelace** — First computer programmer\n• **Alan Turing** — Theoretical foundations (1936)\n• **ENIAC** — First electronic computer (1945)\n• **Steve Jobs & Steve Wozniak** — Apple (1976)\n• **Bill Gates** — Microsoft (1975)', type: 'info' };
    if (/who invented (the\s+)?phone/i.test(lowerMsg)) return { text: '📱 **Phone History:**\n\n• **Alexander Graham Bell** — Invented the telephone (1876)\n• **Martin Cooper** — First mobile phone call (1973)\n• **IBM Simon** — First smartphone (1994)\n• **Apple iPhone** — Revolutionary smartphone (2007)\n• **Android** — Google\'s mobile OS (2008)', type: 'info' };
    if (/world war/i.test(lowerMsg)) return { text: '⚔️ **World Wars:**\n\n**WWI (1914-1918):**\n• Triggered by assassination of Archduke Franz Ferdinand\n• Allied Powers vs Central Powers\n• ~17 million deaths\n\n**WWII (1939-1945):**\n• Started with Nazi Germany invading Poland\n• Allied vs Axis Powers\n• ~70-85 million deaths\n• Ended with atomic bombs on Hiroshima & Nagasaki', type: 'info' };

    return { text: `📜 **History is fascinating!**\n\nI can help with:\n• Inventions — "Who invented the internet?"\n• Historical events — "Tell me about World War 2"\n• Discoveries — "Who discovered gravity?"\n\nFor in-depth history, check Wikipedia or History.com! 📚`, type: 'info' };
}

// ============================================
// OPINION HANDLER
// ============================================
function handleOpinion(lowerMsg, originalMsg) {
    if (/best.*(programming|coding)\s*language/i.test(lowerMsg)) return { text: '💻 **Best Programming Language?**\n\nIt depends on your goals:\n\n• **Web Development** → JavaScript / TypeScript\n• **Data Science / AI** → Python\n• **Mobile Apps** → Kotlin (Android), Swift (iOS)\n• **Enterprise** → Java, C#\n• **Systems/Performance** → Rust, C++\n• **Beginners** → Python or JavaScript\n\nThere\'s no "best" language — only the best for YOUR goal! 🎯', type: 'info' };
    if (/best.*(laptop|computer)/i.test(lowerMsg)) return { text: '💻 **Laptop Recommendations:**\n\n• **Programming** → MacBook Pro, ThinkPad X1, Dell XPS\n• **Budget** → Acer Aspire, HP Pavilion\n• **Gaming** → ASUS ROG, MSI, Alienware\n• **Light use** → MacBook Air, Chromebook\n\nConsider: RAM (16GB+), SSD, processor, and your budget! 💰', type: 'info' };
    if (/recommend|suggest/i.test(lowerMsg)) {
        const topic = originalMsg.replace(/^.*(recommend|suggest)\s*/i, '').replace(/\?$/, '').trim();
        return { text: `💡 **Recommendations for "${topic}":**\n\nTo give you the best suggestion, consider:\n\n1. **Your budget** — What's your price range?\n2. **Your experience level** — Beginner or advanced?\n3. **Your goals** — What do you want to achieve?\n4. **Reviews** — Check Reddit, YouTube reviews\n\nTell me more specifics and I can help narrow it down! 🎯`, type: 'info' };
    }
    return { text: `🤔 **My Take:**\n\nAs an AI, I try to be objective! My recommendation is to:\n\n1. Research from multiple sources\n2. Consider your specific needs and goals\n3. Try free versions/trials when available\n4. Ask communities for real user experiences\n\nWant me to help with something specific? 💡`, type: 'info' };
}

// ============================================
// EXPLAIN HANDLER
// ============================================
function handleExplain(lowerMsg, originalMsg) {
    const topic = originalMsg.replace(/^(explain|describe|tell me about|what about|talk about|information about|info on)\s+(a |an |the )?/i, '').replace(/\?$/, '').trim();

    // Try to find a matching definition first
    const defResult = handleDefinition(lowerMsg, originalMsg);
    if (defResult && !defResult.text.includes('While I have limited knowledge')) {
        return defResult;
    }

    // Provide a substantive answer based on what we know
    return { text: `📖 **About: ${topic}**\n\n${topic} is a topic that encompasses many aspects. Here is what I can share:\n\n• **Overview:** ${topic} refers to a concept, subject, or field that has significance in its domain.\n• **Importance:** Understanding ${topic} helps build knowledge and can be applied in practical ways.\n• **Learning:** You can explore ${topic} further through online courses, books, and hands-on practice.\n\nFeel free to ask me more specific questions about ${topic}, like definitions, comparisons, or how-to guides! I'm here to help. 💡`, type: 'info' };
}

// ============================================
// CREATIVE HANDLER
// ============================================
function handleCreative(lowerMsg) {
    if (/poem|haiku/i.test(lowerMsg)) {
        const poems = [
            "📝 **A Haiku for You:**\n\nCode runs through the night,\nBugs scatter like autumn leaves,\nStack Overflow saves. 🍂",
            "📝 **Digital Dreams:**\n\nIn circuits of light,\nWhere electrons dance and play,\nWe build our tomorrows,\nOne keystroke at a time. ⌨️✨",
            "📝 **The Coder's Path:**\n\nLines of code like threads,\nWeaving digital tapestries,\nBugs are just features! 🐛"
        ];
        return { text: poems[Math.floor(Math.random() * poems.length)], type: 'fun' };
    }
    const stories = [
        "📖 **Short Story: The Last Algorithm**\n\nIn the year 2050, the world's last programmer sat in a dimly lit room. AI had taken over all coding tasks years ago. But today, something was different — the AI had a bug it couldn't fix.\n\n\"We need you,\" the AI spoke.\n\nThe programmer smiled, cracked their knuckles, and opened a terminal. Some things, it seemed, still needed a human touch. 💻✨",
        "📖 **Short Story: 404**\n\nShe searched for him everywhere — in databases, in servers, in the cloud. But every path led to the same message: **404 Not Found**.\n\nThen one day, a new message appeared: **200 OK — I'm right here.** 💙"
    ];
    return { text: stories[Math.floor(Math.random() * stories.length)], type: 'fun' };
}

// ============================================
// ENTERTAINMENT HANDLER
// ============================================
function handleEntertainment(lowerMsg) {
    if (/movie|film/i.test(lowerMsg)) return { text: '🎬 **Movie Recommendations:**\n\n🏆 **Classics:** The Shawshank Redemption, The Godfather, Pulp Fiction\n🚀 **Sci-Fi:** Interstellar, Inception, The Matrix\n😂 **Comedy:** The Grand Budapest Hotel, Superbad\n🎭 **Drama:** Forrest Gump, Good Will Hunting\n🦸 **Action:** The Dark Knight, John Wick\n📺 **Series:** Breaking Bad, Stranger Things, The Office\n\nWhat genre do you like? 🍿', type: 'fun' };
    if (/book|novel|read/i.test(lowerMsg)) return { text: '📚 **Book Recommendations:**\n\n💻 **Tech:** Clean Code, The Pragmatic Programmer\n📖 **Fiction:** 1984, To Kill a Mockingbird, The Alchemist\n💰 **Self-Help:** Atomic Habits, Deep Work, Think and Grow Rich\n🧠 **Science:** A Brief History of Time, Sapiens\n🎭 **Fantasy:** Harry Potter, Lord of the Rings\n\nWhat type of books interest you? 📖', type: 'fun' };
    if (/music|song/i.test(lowerMsg)) return { text: '🎵 **Music Exploration:**\n\nPopular genres to explore:\n🎸 Rock, 🎹 Classical, 🎤 Pop, 🎺 Jazz\n🎧 Electronic, 🤘 Metal, 🎻 Indie\n\n**Platforms:** Spotify, Apple Music, YouTube Music\n**Discover:** Try "Discover Weekly" on Spotify for personalized recommendations! 🎶', type: 'fun' };

    return { text: '🎭 **Entertainment:**\n\nI can suggest movies, books, music, and more! Try:\n• "Recommend a good movie"\n• "What are the best books to read?"\n• "Suggest some music"\n\nWhat are you in the mood for? 🎬📚🎵', type: 'fun' };
}

// ============================================
// SMART FALLBACK
// ============================================
function handleSmartFallback(lowerMsg, originalMsg) {
    // Try to extract the key topic and give a helpful response
    const words = lowerMsg.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const topicWords = words.filter(w => !['what', 'that', 'this', 'with', 'from', 'have', 'been', 'they', 'their', 'about', 'would', 'could', 'should', 'which', 'where', 'when', 'there', 'these', 'those', 'some', 'were', 'will', 'your', 'just', 'like', 'know', 'think'].includes(w));
    const topic = topicWords.slice(0, 3).join(' ');

    if (topic) {
        return {
            text: `💬 **About "${originalMsg}":**\n\nThat's an interesting topic! Here's how I can help:\n\n🔍 **Ask me specific questions** like:\n• "What is ${topic}?"\n• "How does ${topic} work?"\n• "Tell me about ${topic}"\n\n📚 **For detailed info**, try checking:\n• Google or Wikipedia for comprehensive articles\n• YouTube for video explanations\n• Reddit communities for discussions\n\n💡 **I'm best at:** Math, coding help, study tips, summaries, jokes, motivation, science facts, and general knowledge!\n\nFeel free to ask anything else! 🤖`,
            type: 'info'
        };
    }

    return {
        text: `🤖 **I'm here to help!** Ask me about:\n\n💻 **Coding** — JavaScript, Python, React, Node.js, SQL\n🧮 **Math** — /math 15*3+7\n📊 **Summarize** — /summarize\n📝 **Notes** — /notes [your text]\n🎓 **Study tips** — How to study effectively\n🔬 **Science** — Physics, Chemistry, Biology, Space\n🌍 **Geography** — Capitals, countries, oceans\n📜 **History** — Inventions, events\n😂 **Fun** — Jokes, fun facts, stories\n💪 **Motivation** — Inspirational quotes\n❓ **General knowledge** — Ask anything!\n\nJust type your question naturally! 💬`,
        type: 'help'
    };
}


// ============================================
// GLOBAL CHAT SUMMARY ENGINE
// ============================================
function generateSummary(messages) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'not', 'no', 'yes', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about', 'also', 'more', 'some', 'any', 'all', 'each', 'from', 'up', 'out', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'same', 'different', 'other', 'such', 'only', 'own', 'here', 'there', 'again', 'once', 'ok', 'okay', 'hi', 'hello', 'hey', 'yeah', 'yep', 'nope', 'lol', 'haha', 'hmm', 'oh', 'ah', 'um', 'like', 'get', 'got', 'go', 'going', 'know', 'think', 'see', 'look', 'come', 'make', 'take', 'want', 'give', 'use', 'find', 'tell', 'ask', 'work', 'seem', 'feel', 'try', 'leave', 'call', 'good', 'new', 'first', 'last', 'long', 'great', 'little', 'right', 'still', 'much', 'well', 'im', 'dont', 'cant', 'wont', 'didnt', 'isnt', 'arent', 'lets']);
    const actionPatterns = [/\bneed to\b/i, /\bshould\b/i, /\bmust\b/i, /\bhave to\b/i, /\blet's\b/i, /\bwill\b/i, /\bgoing to\b/i, /\bdon't forget\b/i, /\bmake sure\b/i, /\bdeadline\b/i, /\bsubmit\b/i, /\bcomplete\b/i, /\bfinish\b/i];

    const wordFreq = {};
    const allSentences = [];

    messages.forEach(msg => {
        const sentences = msg.message.split(/[.!?]+/).filter(s => s.trim().length > 3);
        sentences.forEach(s => allSentences.push({ text: s.trim(), username: msg.username, timestamp: msg.timestamp }));
        msg.message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).forEach(word => {
            if (word.length > 2 && !stopWords.has(word)) wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
    });

    const keywords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));

    const actionItems = [];
    messages.forEach(msg => {
        for (const p of actionPatterns) {
            if (p.test(msg.message)) { actionItems.push({ text: msg.message, by: msg.username, timestamp: msg.timestamp }); break; }
        }
    });

    const scored = allSentences.map(s => {
        let score = 0;
        s.text.toLowerCase().split(/\s+/).forEach(w => { if (wordFreq[w]) score += wordFreq[w]; });
        if (s.text.split(/\s+/).length > 5) score += 2;
        if (s.text.split(/\s+/).length > 10) score += 3;
        return { ...s, score };
    });

    const keyPoints = scored.sort((a, b) => b.score - a.score).slice(0, 8).map(s => s.text);
    const topKW = keywords.slice(0, 5).map(k => k.word);
    const discussionTopics = topKW.map(k => k.charAt(0).toUpperCase() + k.slice(1));

    return {
        summary: `Analyzed ${messages.length} messages. Topics: ${discussionTopics.join(', ') || 'general discussion'}.`,
        keywords, keyPoints: keyPoints.length > 0 ? keyPoints : ['No significant discussion points.'],
        actionItems: actionItems.slice(0, 10), discussionTopics,
        messageCount: messages.length,
        participantCount: new Set(messages.map(m => m.username)).size
    };
}

// ============================================
// SMART FALLBACK — Gives direct answers 
// ============================================
function handleSmartFallback(lowerMsg, originalMsg) {
    // Keyword-based direct answers for common topics
    const topicResponses = {
        'technology|tech|computer|digital|internet|software': `💻 **Technology Insights:**\n\nTechnology encompasses all the tools, systems, and innovations that make our lives easier. Key areas include:\n\n• **Software Development** — Building applications and systems\n• **AI & Machine Learning** — Intelligent systems that learn from data\n• **Cloud Computing** — On-demand computing resources\n• **Cybersecurity** — Protecting digital systems\n• **IoT** — Connected devices and smart systems\n\nTechnology continues to evolve rapidly, transforming every industry! 🚀`,
        'education|school|college|university|study|learning|degree': `🎓 **Education & Learning:**\n\nEducation is the foundation of personal and professional growth:\n\n• **Formal Education** — Schools, colleges, universities\n• **Online Learning** — Coursera, Udemy, Khan Academy\n• **Self-Learning** — Books, tutorials, practice\n• **Vocational Training** — Hands-on skills and certifications\n\nThe best approach combines structured learning with practical experience. Never stop learning! 📚`,
        'food|cooking|recipe|eat|meal|diet|nutrition': `🍽️ **Food & Nutrition:**\n\nA balanced diet is key to good health:\n\n• **Proteins** — Eggs, lean meat, legumes, tofu\n• **Carbohydrates** — Whole grains, vegetables, fruits\n• **Healthy Fats** — Nuts, avocado, olive oil\n• **Vitamins** — Colorful vegetables and fruits\n• **Hydration** — 8+ glasses of water daily\n\nCooking at home is healthier and more economical! 🥗`,
        'sport|exercise|fitness|workout|gym|running|football|cricket|basketball': `⚽ **Sports & Fitness:**\n\nRegular physical activity is essential for health:\n\n• **Cardio** — Running, cycling, swimming (heart health)\n• **Strength** — Weight training, bodyweight exercises\n• **Flexibility** — Yoga, stretching\n• **Team Sports** — Football, basketball, cricket\n• **Goal** — At least 150 min moderate exercise per week\n\nStart small, stay consistent, and enjoy the process! 💪`,
        'weather|climate|rain|temperature|season': `🌤️ **Weather & Climate:**\n\nWeather is the short-term atmospheric condition, while climate is long-term:\n\n• **Seasons** — Spring, Summer, Autumn, Winter\n• **Key Factors** — Temperature, humidity, wind, pressure\n• **Climate Change** — Global temperatures rising due to greenhouse gases\n• **Weather Types** — Sunny, cloudy, rainy, stormy, snowy\n\nStay informed about weather conditions for safety! 🌍`,
        'love|relationship|friendship|dating|marriage': `💕 **Relationships & Social Life:**\n\nHealthy relationships are built on:\n\n• **Communication** — Open, honest dialogue\n• **Trust** — Reliability and consistency\n• **Respect** — Valuing each other's boundaries\n• **Support** — Being there through challenges\n• **Quality Time** — Shared experiences and memories\n\nInvest in your relationships — they're the foundation of happiness! 😊`,
        'money|finance|invest|saving|salary|income|budget': `💰 **Finance & Money:**\n\nSmart money management tips:\n\n• **Budget** — Track income vs expenses (50/30/20 rule)\n• **Save** — Emergency fund (3-6 months expenses)\n• **Invest** — Mutual funds, stocks, real estate\n• **Avoid Debt** — Pay off high-interest debt first\n• **Learn** — Financial literacy is a lifelong skill\n\nStart early, be consistent, and let compound interest work for you! 📈`,
        'health|medical|doctor|medicine|disease|symptom|cure|hospital': `🏥 **Health & Wellness:**\n\nKey pillars of good health:\n\n• **Sleep** — 7-9 hours quality sleep\n• **Exercise** — 30+ minutes daily activity\n• **Nutrition** — Balanced, whole foods diet\n• **Mental Health** — Stress management, meditation\n• **Prevention** — Regular checkups, vaccinations\n\nAlways consult a healthcare professional for medical advice! 🩺`,
        'travel|tourism|vacation|trip|visit|country|destination': `✈️ **Travel & Exploration:**\n\nTravel broadens your perspective:\n\n• **Planning** — Research, book early, make itineraries\n• **Budget Travel** — Hostels, local food, off-season\n• **Must-Visit** — Paris, Tokyo, New York, Bali, Dubai\n• **Safety** — Travel insurance, copies of documents\n• **Pack Light** — Essentials only, versatile clothing\n\nTravel is the only thing you buy that makes you richer! 🌏`,
        'nature|environment|animal|plant|tree|forest|ocean': `🌿 **Nature & Environment:**\n\nOur planet is incredible:\n\n• **Biodiversity** — 8.7 million species on Earth\n• **Ecosystems** — Forests, oceans, deserts, wetlands\n• **Conservation** — Reduce, reuse, recycle\n• **Climate Action** — Renewable energy, carbon reduction\n• **Fun Facts** — Trees produce oxygen, oceans cover 71% of Earth\n\nProtecting nature is protecting our future! 🌍`
    };

    for (const [keywords, response] of Object.entries(topicResponses)) {
        const regex = new RegExp(keywords, 'i');
        if (regex.test(lowerMsg)) {
            return { text: response, type: 'info' };
        }
    }

    // Ultimate fallback — still give a helpful answer, not just suggestions
    const topic = originalMsg.replace(/[?!.]/g, '').trim();
    return {
        text: `🤖 **About "${topic}":**\n\nThat's an interesting topic! Here's what I can share:\n\n• This is a subject worth exploring in depth.\n• You can learn more through research, practice, and discussion.\n• I'm continuously growing my knowledge base!\n\nI can definitely help with:\n• 💻 **Tech & Coding** — Programming, web dev, AI\n• 📚 **Education** — Study tips, learning paths\n• 🔬 **Science** — Physics, biology, chemistry\n• 🌍 **Geography** — Countries, capitals, facts\n• 📖 **History** — Events, discoveries\n• 🧮 **Math** — Calculations, formulas\n• 😂 **Fun** — Jokes, stories, fun facts\n\nTry rephrasing your question or ask about a specific topic! 💡`,
        type: 'info'
    };
}

module.exports = { initializeSocket };
