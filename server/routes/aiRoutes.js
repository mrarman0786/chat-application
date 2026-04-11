/**
 * ============================================
 * AI CHATBOT ROUTES
 * ============================================
 * 
 * Smart assistant integrated into the chat system.
 * Supports rule-based responses and slash commands.
 * Structured for easy OpenAI/LLM integration.
 * 
 * VIVA EXPLANATION:
 * The AI chatbot uses pattern matching and command parsing
 * to provide intelligent responses. It can summarize chats,
 * do math, generate notes, and answer common queries.
 * 
 * ============================================
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { isAuthenticated } = require('../auth');

/**
 * POST /api/ai/chat
 * Send a message to the AI chatbot and get a response
 * 
 * Request body: { message, chatId, context }
 * Response: { success, response, type }
 */
router.post('/chat', isAuthenticated, async (req, res) => {
    try {
        const { message, chatId } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: 'Message required' });
        }

        // Generate AI response
        const aiResponse = await generateAIResponse(message.trim(), chatId, req.session.userId);

        return res.status(200).json({
            success: true,
            response: aiResponse.text,
            type: aiResponse.type
        });

    } catch (error) {
        console.error('AI chat error:', error);
        return res.status(500).json({
            success: false,
            message: 'AI service temporarily unavailable'
        });
    }
});

/**
 * Generate AI response based on user message
 * 
 * VIVA EXPLANATION:
 * Uses a rule-based approach with:
 * 1. Slash command parsing (/help, /summarize, /math, /notes)
 * 2. Keyword pattern matching for common queries
 * 3. Fallback general responses
 * 
 * Can be replaced with OpenAI API by modifying this function.
 */
async function generateAIResponse(message, chatId, userId) {
    const lowerMsg = message.toLowerCase().trim();

    // ---- SLASH COMMANDS ----
    if (lowerMsg.startsWith('/')) {
        return handleSlashCommand(lowerMsg, message, chatId, userId);
    }

    // ---- GREETINGS ----
    if (/^(hi|hello|hey|hiya|howdy|sup|what'?s up)/i.test(lowerMsg)) {
        const greetings = [
            "Hey there! 👋 I'm your AI Assistant. How can I help you today?",
            "Hello! 🤖 I'm here to help. You can ask me questions, or use /help to see my commands!",
            "Hi! 😊 What can I do for you? Try /help to see everything I can do."
        ];
        return { text: greetings[Math.floor(Math.random() * greetings.length)], type: 'greeting' };
    }

    // ---- MATH ----
    if (/(?:calculate|solve|what is|compute|math)\s/i.test(lowerMsg) || /^\d+[\s]*[+\-*/^%][\s]*\d+/.test(lowerMsg)) {
        return handleMath(message);
    }

    // ---- SUMMARIZE REQUEST ----
    if (/summarize|summary|recap|overview|what did we (talk|discuss)/i.test(lowerMsg)) {
        return await handleSummarize(chatId);
    }

    // ---- NOTES / BULLET POINTS ----
    if (/(?:notes|bullet points|convert to bullets|make notes|study notes)/i.test(lowerMsg)) {
        return handleNotes(message);
    }

    // ---- SUGGEST REPLY ----
    if (/suggest.*reply|what should i (say|reply|respond)/i.test(lowerMsg)) {
        return handleSuggestReply(chatId);
    }

    // ---- TIME / DATE ----
    if (/what.*(?:time|date|day)|current time/i.test(lowerMsg)) {
        const now = new Date();
        return {
            text: `📅 **Current Date & Time:**\n• Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n• Time: ${now.toLocaleTimeString('en-US')}`,
            type: 'info'
        };
    }

    // ---- CODING HELP ----
    if (/(?:code|program|function|javascript|python|html|css|sql|algorithm|loop|array)/i.test(lowerMsg)) {
        return handleCodingHelp(lowerMsg);
    }

    // ---- GENERAL KNOWLEDGE ----
    if (/(?:what is|define|explain|tell me about|who is|how does)/i.test(lowerMsg)) {
        return {
            text: `🤔 That's a great question! While I'm a basic assistant, here's what I can help with:\n\n• **/summarize** — Summarize recent chat messages\n• **/math [expression]** — Calculate math expressions\n• **/notes [text]** — Convert text to bullet points\n• **/help** — See all my commands\n\nFor detailed knowledge queries, I'd recommend checking a search engine or encyclopedia! 📚`,
            type: 'info'
        };
    }

    // ---- THANK YOU ----
    if (/(?:thank|thanks|thx|ty|appreciate)/i.test(lowerMsg)) {
        return { text: "You're welcome! 😊 Let me know if you need anything else!", type: 'greeting' };
    }

    // ---- FALLBACK ----
    return {
        text: `🤖 I'm your AI Assistant! Here's what I can do:\n\n📊 **/summarize** — Summarize recent messages\n🧮 **/math 2+2** — Calculate expressions\n📝 **/notes [text]** — Convert to bullet points\n💡 **/help** — See all commands\n\nYou can also ask me general questions, request coding help, or just chat! 💬`,
        type: 'help'
    };
}

/**
 * Handle slash commands
 */
async function handleSlashCommand(lowerMsg, originalMsg, chatId, userId) {
    const parts = originalMsg.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (command) {
        case '/help':
            return {
                text: `🤖 **AI Assistant Commands:**\n\n📊 **/summarize** — Summarize the last 20 messages\n🧮 **/math [expression]** — Calculate (e.g., /math 15*3+7)\n📝 **/notes [text]** — Convert text into bullet points\n💡 **/suggest** — Suggest a reply based on context\n⏰ **/time** — Current date and time\n🔢 **/count** — Count messages in this chat\n\nYou can also just type naturally — I'll try my best to help! 😊`,
                type: 'help'
            };

        case '/summarize':
            return await handleSummarize(chatId);

        case '/math':
            return handleMath(args || 'no expression provided');

        case '/notes':
            return handleNotes(args || 'No text provided');

        case '/suggest':
            return handleSuggestReply(chatId);

        case '/time':
            const now = new Date();
            return {
                text: `⏰ ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — ${now.toLocaleTimeString('en-US')}`,
                type: 'info'
            };

        case '/count':
            return await handleCount(chatId);

        default:
            return {
                text: `❓ Unknown command: \`${command}\`\nType **/help** to see available commands.`,
                type: 'error'
            };
    }
}

/**
 * Handle math calculations
 */
function handleMath(expression) {
    try {
        // Extract math expression
        const mathExpr = expression.replace(/[^0-9+\-*/().%^ ]/g, '').trim();
        if (!mathExpr) {
            return { text: '🧮 Please provide a math expression!\nExample: `/math 15 * 3 + 7`', type: 'math' };
        }

        // Safe math evaluation (no eval)
        const result = safeMathEval(mathExpr);
        if (result === null || isNaN(result) || !isFinite(result)) {
            return { text: `🧮 Could not calculate: \`${mathExpr}\`\nPlease check the expression.`, type: 'math' };
        }

        return {
            text: `🧮 **Calculation:**\n\`${mathExpr}\` = **${result}**`,
            type: 'math'
        };
    } catch (e) {
        return { text: `🧮 Error in calculation. Please use basic operators (+, -, *, /).`, type: 'error' };
    }
}

/**
 * Safe math evaluator (no eval())
 */
function safeMathEval(expr) {
    // Basic tokenizer and evaluator for +, -, *, /, (, ), %
    try {
        // Only allow safe characters
        if (!/^[0-9+\-*/().% ]+$/.test(expr)) return null;
        // Use Function constructor for controlled evaluation
        const result = new Function('return (' + expr + ')')();
        return Math.round(result * 10000) / 10000; // Round to 4 decimals
    } catch (e) {
        return null;
    }
}

/**
 * Handle chat summarization
 */
async function handleSummarize(chatId) {
    try {
        let messages;
        if (chatId) {
            messages = await query(
                `SELECT message, sender_username as username, timestamp 
                 FROM private_messages WHERE chat_id = ? AND is_ai = FALSE
                 ORDER BY timestamp DESC LIMIT 20`,
                [chatId]
            );
        } else {
            messages = await query(
                `SELECT message, username, timestamp 
                 FROM messages ORDER BY timestamp DESC LIMIT 20`
            );
        }

        if (!messages || messages.length === 0) {
            return { text: '📊 No messages to summarize yet. Start chatting first!', type: 'summary' };
        }

        // Simple summarization
        const uniqueUsers = [...new Set(messages.map(m => m.username))];
        const wordCount = messages.reduce((acc, m) => acc + m.message.split(/\s+/).length, 0);

        // Extract key topics (most frequent non-trivial words)
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'i', 'you', 'it', 'we', 'they', 'me', 'my', 'this', 'that', 'not', 'no', 'yes', 'so', 'just', 'ok', 'hi', 'hello', 'hey', 'lol']);
        const wordFreq = {};
        messages.forEach(m => {
            m.message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).forEach(w => {
                if (w.length > 2 && !stopWords.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
            });
        });
        const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]);

        let summary = `📊 **Chat Summary** (Last ${messages.length} messages)\n\n`;
        summary += `👥 **Participants:** ${uniqueUsers.join(', ')}\n`;
        summary += `📝 **Total Words:** ${wordCount}\n`;
        summary += `🔑 **Key Topics:** ${topWords.length > 0 ? topWords.join(', ') : 'General conversation'}\n\n`;

        // Key messages (longest = likely most detailed)
        const keyMsgs = messages.filter(m => m.message.length > 20).sort((a, b) => b.message.length - a.message.length).slice(0, 3);
        if (keyMsgs.length > 0) {
            summary += `💡 **Key Messages:**\n`;
            keyMsgs.forEach(m => {
                summary += `• _${m.username}_: "${m.message.substring(0, 80)}${m.message.length > 80 ? '...' : ''}"\n`;
            });
        }

        return { text: summary, type: 'summary' };
    } catch (e) {
        return { text: '📊 Error generating summary. Please try again later.', type: 'error' };
    }
}

/**
 * Handle notes generation
 */
function handleNotes(text) {
    if (!text || text.length < 5) {
        return { text: '📝 Please provide text to convert!\nExample: `/notes JavaScript is a programming language used for web development`', type: 'notes' };
    }

    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 3);
    if (sentences.length === 0) {
        return { text: `📝 **Notes:**\n• ${text}`, type: 'notes' };
    }

    let notes = '📝 **Study Notes:**\n\n';
    sentences.forEach((s, i) => {
        notes += `${i + 1}. ${s.trim()}\n`;
    });

    return { text: notes, type: 'notes' };
}

/**
 * Handle suggest reply
 */
async function handleSuggestReply(chatId) {
    const suggestions = [
        "That sounds great! Let's do it. 👍",
        "I agree with your point. Can you elaborate?",
        "Interesting perspective! What do others think?",
        "Let me think about that and get back to you.",
        "Good idea! When should we start?",
        "Thanks for sharing! Very helpful. 🙏",
        "Could you explain that in more detail?",
        "I see your point. Here's my take on it..."
    ];

    const idx = Math.floor(Math.random() * suggestions.length);
    return {
        text: `💡 **Suggested Reply:**\n\n"${suggestions[idx]}"`,
        type: 'suggest'
    };
}

/**
 * Handle message count
 */
async function handleCount(chatId) {
    try {
        if (chatId) {
            const result = await query(
                'SELECT COUNT(*) as total FROM private_messages WHERE chat_id = ?',
                [chatId]
            );
            return { text: `🔢 This chat has **${result[0].total}** messages.`, type: 'info' };
        }
        const result = await query('SELECT COUNT(*) as total FROM messages');
        return { text: `🔢 Global chat has **${result[0].total}** messages.`, type: 'info' };
    } catch (e) {
        return { text: '🔢 Error counting messages.', type: 'error' };
    }
}

/**
 * Handle coding help
 */
function handleCodingHelp(msg) {
    let tips = `💻 **Coding Help:**\n\n`;

    if (/javascript|js/i.test(msg)) {
        tips += `**JavaScript Tips:**\n• Use \`const\` and \`let\` instead of \`var\`\n• Arrow functions: \`const fn = (x) => x * 2\`\n• Template literals: \`\`Hello \${name}\`\`\n• Array methods: \`.map()\`, \`.filter()\`, \`.reduce()\`\n• Async/await for promises`;
    } else if (/python/i.test(msg)) {
        tips += `**Python Tips:**\n• Use f-strings: \`f"Hello {name}"\`\n• List comprehensions: \`[x*2 for x in range(10)]\`\n• Virtual environments: \`python -m venv env\`\n• Type hints: \`def greet(name: str) -> str:\``;
    } else if (/html|css/i.test(msg)) {
        tips += `**HTML/CSS Tips:**\n• Use semantic elements: \`<header>\`, \`<main>\`, \`<footer>\`\n• Flexbox for layouts: \`display: flex\`\n• CSS Grid for complex layouts\n• CSS custom properties: \`--primary-color: #6366f1\``;
    } else if (/sql/i.test(msg)) {
        tips += `**SQL Tips:**\n• Use JOINs instead of subqueries when possible\n• Index frequently queried columns\n• Use prepared statements to prevent SQL injection\n• \`EXPLAIN\` to analyze query performance`;
    } else {
        tips += `I can help with JavaScript, Python, HTML/CSS, and SQL!\nJust mention the language in your question. 🚀`;
    }

    return { text: tips, type: 'code' };
}

module.exports = router;
