/**
 * ============================================
 * CHAT.JS — Full Feature Client
 * ============================================
 * 
 * Features:
 * 1. Mood-Based Dynamic UI
 * 2. Topic-Based Chat Filtering
 * 3. AI Chat Summary
 * 4. Secret Identity Mode
 * 5. Private 1-to-1 Chat
 * 6. AI Chatbot (Smart Assistant)
 * 
 * ============================================
 */

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // ============================================
    // DOM ELEMENTS
    // ============================================
    const sidebar = document.getElementById('sidebar');
    const chatPanel = document.getElementById('chat-panel');
    const messagesContainer = document.getElementById('messages-container');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const logoutBtn = document.getElementById('logout-btn');
    const currentUsernameEl = document.getElementById('current-username');
    const typingIndicator = document.getElementById('typing-indicator');
    const typingText = typingIndicator.querySelector('.typing-text');
    const welcomeMessage = document.getElementById('welcome-message');
    const adminBadge = document.getElementById('admin-badge');

    // Sidebar elements
    const userSearch = document.getElementById('user-search');
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const privateChatList = document.getElementById('private-chat-list');
    const usersList = document.getElementById('users-list');
    const noChatsMsg = document.getElementById('no-chats-msg');
    const noUsersMsg = document.getElementById('no-users-msg');
    const backBtn = document.getElementById('back-btn');

    // Chat header
    const chatHeaderAvatar = document.getElementById('chat-header-avatar');
    const chatHeaderName = document.getElementById('chat-header-name');
    const chatHeaderStatus = document.getElementById('chat-header-status');

    // Feature elements
    const moodButtons = document.querySelectorAll('.mood-btn');
    const topicInput = document.getElementById('topic-input');
    const anonymousToggle = document.getElementById('anonymous-toggle');
    const featureControls = document.getElementById('feature-controls');
    const topicFilterBar = document.getElementById('topic-filter-bar');
    const filterPills = document.getElementById('filter-pills');
    const summarizeBtn = document.getElementById('summarize-btn');
    const summaryModal = document.getElementById('summary-modal');
    const summaryClose = document.getElementById('summary-close');
    const summaryLoading = document.getElementById('summary-loading');
    const summaryResults = document.getElementById('summary-results');
    const revealModal = document.getElementById('reveal-modal');
    const revealClose = document.getElementById('reveal-close');
    const revealUsername = document.getElementById('reveal-username');

    // ============================================
    // STATE
    // ============================================
    let socket = null;
    let currentUser = null;
    let selectedMood = 'happy';
    let isAnonymous = false;
    let typingTimeout = null;

    // Chat state
    let activeChat = { type: 'global', chatId: null, userId: null, username: null };
    let aiChatId = null; // Will be created on first AI interaction
    let onlineUserIds = new Set();
    let unreadCounts = {}; // chatId -> count

    const moodConfig = {
        happy: { emoji: '😊', label: 'Happy' },
        sad: { emoji: '😢', label: 'Sad' },
        angry: { emoji: '😡', label: 'Angry' },
        calm: { emoji: '😌', label: 'Calm' },
        excited: { emoji: '🤩', label: 'Excited' }
    };

    // ============================================
    // AUTH CHECK
    // ============================================
    async function checkAuth() {
        try {
            const response = await fetch('/api/auth/check', { credentials: 'include' });
            const data = await response.json();
            if (!data.authenticated) { window.location.href = '/'; return; }

            currentUser = data.user;
            currentUsernameEl.textContent = currentUser.username;

            // Display avatar
            const avatarImg = document.getElementById('current-user-avatar');
            const avatarFallback = document.getElementById('current-user-avatar-fallback');
            if (currentUser.avatar) {
                avatarImg.src = currentUser.avatar;
                avatarImg.style.display = 'inline';
                avatarFallback.style.display = 'none';
            } else {
                avatarImg.style.display = 'none';
                avatarFallback.style.display = 'inline';
            }

            const userResp = await fetch('/api/chat/user', { credentials: 'include' });
            const userData = await userResp.json();
            if (userData.success && userData.user.isAdmin) {
                currentUser.isAdmin = true;
                adminBadge.classList.remove('hidden');
            }

            initSocket();
            loadUsers();
            loadMyChats();
            switchToGlobalChat();
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = '/';
        }
    }

    // ============================================
    // SOCKET INITIALIZATION
    // ============================================
    function initSocket() {
        socket = io({ withCredentials: true });

        socket.on('connect', () => {
            updateHeaderStatus('Connected', 'connected');
        });

        socket.on('disconnect', () => {
            updateHeaderStatus('Disconnected', 'disconnected');
        });

        socket.on('welcome', (data) => {
            if (activeChat.type === 'global' && welcomeMessage) {
                welcomeMessage.innerHTML = `<p>👋 ${data.message}</p>`;
            }
        });

        // Global chat messages
        socket.on('chat message', (data) => {
            if (activeChat.type === 'global') {
                addMessage(data);
            }
        });

        // Private chat messages
        socket.on('receive-private-message', (data) => {
            if (activeChat.type === 'private' && activeChat.chatId === data.chat_id) {
                addMessage(data);
                // Mark as seen
                socket.emit('message-seen', { chatId: data.chat_id });
            } else {
                // Increment unread
                unreadCounts[data.chat_id] = (unreadCounts[data.chat_id] || 0) + 1;
                updateChatItemBadge(data.chat_id, unreadCounts[data.chat_id]);
            }
        });

        // AI messages
        socket.on('receive-ai-message', (data) => {
            if (activeChat.type === 'ai') {
                addMessage(data);
            }
        });

        socket.on('ai-thinking', (data) => {
            if (activeChat.type === 'ai' && data.isThinking) {
                showTyping('AI Assistant');
            } else {
                hideTyping();
            }
        });

        // New message notification (for unread badge)
        socket.on('new-message-notification', (data) => {
            if (activeChat.chatId !== data.chatId) {
                unreadCounts[data.chatId] = (unreadCounts[data.chatId] || 0) + 1;
                updateChatItemBadge(data.chatId, unreadCounts[data.chatId]);
            }
        });

        // Messages seen
        socket.on('messages-seen', (data) => {
            if (activeChat.chatId === data.chatId) {
                document.querySelectorAll('.message.own .seen-status').forEach(el => {
                    el.textContent = '✓✓';
                    el.classList.add('seen');
                });
            }
        });

        // Online users
        socket.on('online-users', (data) => {
            onlineUserIds = new Set(data.users.map(u => u.userId));
            updateOnlineIndicators();
        });

        // User join/leave
        socket.on('user joined', (data) => {
            if (activeChat.type === 'global') addNotification(`${data.username} joined`, 'join');
        });

        socket.on('user left', (data) => {
            if (activeChat.type === 'global') addNotification(`${data.username} left`, 'leave');
        });

        // Typing — global
        socket.on('user typing', (data) => {
            if (activeChat.type === 'global') showTyping(data.username);
        });
        socket.on('user stop typing', () => {
            if (activeChat.type === 'global') hideTyping();
        });

        // Typing — private
        socket.on('private-typing-status', (data) => {
            if (activeChat.type === 'private' && activeChat.chatId === data.chatId) {
                if (data.isTyping) showTyping(data.username); else hideTyping();
            }
        });

        // Chat summary
        socket.on('chat-summary-response', (data) => displaySummary(data));

        socket.on('error', (data) => console.error('Socket error:', data));
    }

    // ============================================
    // SIDEBAR — TABS
    // ============================================
    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            sidebarTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`content-${tab.dataset.tab}`).classList.add('active');

            if (tab.dataset.tab === 'global') {
                switchToGlobalChat();
            }
        });
    });

    // ============================================
    // SIDEBAR — SEARCH
    // ============================================
    userSearch.addEventListener('input', () => {
        const q = userSearch.value.toLowerCase();
        document.querySelectorAll('.user-item, .chat-item').forEach(item => {
            const name = item.querySelector('.chat-item-name, .user-item-name');
            if (name) {
                item.style.display = name.textContent.toLowerCase().includes(q) ? '' : 'none';
            }
        });
    });

    // ============================================
    // SIDEBAR — BACK BUTTON (mobile)
    // ============================================
    backBtn.addEventListener('click', () => {
        sidebar.classList.add('show');
        chatPanel.classList.remove('show');
    });

    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    // ============================================
    // LOAD USERS
    // ============================================
    async function loadUsers() {
        try {
            const resp = await fetch('/api/chats/users', { credentials: 'include' });
            const data = await resp.json();
            if (!data.success) return;

            usersList.innerHTML = '';
            if (data.users.length === 0) {
                noUsersMsg.style.display = '';
                return;
            }
            noUsersMsg.style.display = 'none';

            data.users.forEach(user => {
                const el = document.createElement('div');
                el.className = 'chat-item user-item';
                el.dataset.userId = user.id;
                const isOnline = onlineUserIds.has(user.id);
                el.innerHTML = `
                    <div class="chat-avatar">👤</div>
                    <div class="chat-item-info">
                        <div class="chat-item-name user-item-name">${escapeHtml(user.username)}</div>
                        <div class="chat-item-preview">${isOnline ? '<span class="online-text">Online</span>' : 'Offline'}</div>
                    </div>
                    <div class="chat-item-meta">
                        <span class="online-dot ${isOnline ? 'online' : ''}"></span>
                    </div>
                `;
                el.addEventListener('click', () => startPrivateChat(user.id, user.username));
                usersList.appendChild(el);
            });
        } catch (e) { console.error('Error loading users:', e); }
    }

    // ============================================
    // LOAD MY CHATS
    // ============================================
    async function loadMyChats() {
        try {
            const resp = await fetch('/api/chats/my-chats', { credentials: 'include' });
            const data = await resp.json();
            if (!data.success) return;

            privateChatList.innerHTML = '';
            if (data.chats.length === 0) {
                noChatsMsg.style.display = '';
                return;
            }
            noChatsMsg.style.display = 'none';

            data.chats.forEach(chat => {
                addChatListItem(chat);
            });
        } catch (e) { console.error('Error loading chats:', e); }
    }

    function addChatListItem(chat) {
        // Check if already exists
        let existing = privateChatList.querySelector(`[data-chat-id="${chat.chatId}"]`);
        if (existing) {
            // Update last message
            const preview = existing.querySelector('.chat-item-preview');
            if (preview && chat.lastMessage) {
                preview.textContent = chat.lastMessage.message.substring(0, 40);
            }
            return;
        }

        const el = document.createElement('div');
        el.className = 'chat-item';
        el.dataset.chatId = chat.chatId;
        el.dataset.userId = chat.otherUserId;
        el.dataset.username = chat.otherUsername;
        const isOnline = onlineUserIds.has(chat.otherUserId);
        const preview = chat.lastMessage ? chat.lastMessage.message.substring(0, 40) : 'Start chatting';
        const unread = chat.unreadCount || 0;

        el.innerHTML = `
            <div class="chat-avatar">👤<span class="online-dot-small ${isOnline ? 'online' : ''}"></span></div>
            <div class="chat-item-info">
                <div class="chat-item-name">${escapeHtml(chat.otherUsername)}</div>
                <div class="chat-item-preview">${escapeHtml(preview)}</div>
            </div>
            <div class="chat-item-meta">
                ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
            </div>
        `;

        el.addEventListener('click', () => {
            openPrivateChat(chat.chatId, chat.otherUserId, chat.otherUsername);
        });

        privateChatList.appendChild(el);
        noChatsMsg.style.display = 'none';
    }

    function updateChatItemBadge(chatId, count) {
        const item = privateChatList.querySelector(`[data-chat-id="${chatId}"]`);
        if (!item) {
            loadMyChats(); // Chat not in list yet, reload
            return;
        }
        let badge = item.querySelector('.unread-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'unread-badge';
                item.querySelector('.chat-item-meta').appendChild(badge);
            }
            badge.textContent = count;
        } else if (badge) {
            badge.remove();
        }
    }

    // ============================================
    // START PRIVATE CHAT
    // ============================================
    async function startPrivateChat(userId, username) {
        try {
            const resp = await fetch('/api/chats/create-private', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ targetUserId: userId })
            });
            const data = await resp.json();
            if (data.success) {
                openPrivateChat(data.chatId, userId, username);
                loadMyChats();
            }
        } catch (e) { console.error('Error creating chat:', e); }
    }

    // ============================================
    // OPEN PRIVATE CHAT
    // ============================================
    function openPrivateChat(chatId, userId, username) {
        // Leave previous private chat room
        if (activeChat.type === 'private' && activeChat.chatId) {
            socket.emit('leave-private-chat', { chatId: activeChat.chatId });
        }

        activeChat = { type: 'private', chatId, userId, username };
        clearMessages();
        hideTyping();

        // Update header
        chatHeaderAvatar.textContent = '👤';
        chatHeaderAvatar.className = 'chat-header-avatar';
        chatHeaderName.textContent = username;
        const isOnline = onlineUserIds.has(userId);
        chatHeaderStatus.innerHTML = `<span class="online-dot ${isOnline ? 'online' : ''}"></span> ${isOnline ? 'Online' : 'Offline'}`;

        // Show features, hide topic filter for private
        featureControls.style.display = '';
        topicFilterBar.style.display = 'none';
        summarizeBtn.style.display = 'none';

        // Highlight active chat in sidebar
        highlightActiveChat(chatId);

        // Join socket room
        socket.emit('join-private-chat', { chatId });

        // Clear unread
        unreadCounts[chatId] = 0;
        updateChatItemBadge(chatId, 0);

        // Load messages
        loadPrivateMessages(chatId);

        // Mobile: show chat panel
        sidebar.classList.remove('show');
        chatPanel.classList.add('show');

        messageInput.focus();
    }

    // ============================================
    // SWITCH TO GLOBAL CHAT
    // ============================================
    function switchToGlobalChat() {
        if (activeChat.type === 'private' && activeChat.chatId) {
            socket.emit('leave-private-chat', { chatId: activeChat.chatId });
        }

        activeChat = { type: 'global', chatId: null, userId: null, username: null };
        clearMessages();
        hideTyping();

        chatHeaderAvatar.textContent = '🌐';
        chatHeaderAvatar.className = 'chat-header-avatar global-avatar';
        chatHeaderName.textContent = 'Global Chat';
        chatHeaderStatus.innerHTML = `<span class="status-dot connected"></span> Connected`;

        featureControls.style.display = '';
        topicFilterBar.style.display = '';
        summarizeBtn.style.display = '';

        highlightActiveChat('global');
        loadGlobalMessages();

        sidebar.classList.remove('show');
        chatPanel.classList.add('show');

        messageInput.focus();
    }

    // ============================================
    // OPEN AI CHAT
    // ============================================
    document.getElementById('ai-chat-item').addEventListener('click', () => {
        openAIChat();
    });

    async function openAIChat() {
        if (activeChat.type === 'private' && activeChat.chatId) {
            socket.emit('leave-private-chat', { chatId: activeChat.chatId });
        }

        // Create AI chat room if needed
        if (!aiChatId) {
            try {
                const resp = await fetch('/api/chats/create-private', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ targetUserId: currentUser.id }) // Self-chat for AI
                });
                const data = await resp.json();
                if (data.success) aiChatId = data.chatId;
                else aiChatId = -1; // Use -1 as fallback
            } catch (e) {
                aiChatId = -1;
            }
        }

        activeChat = { type: 'ai', chatId: aiChatId, userId: null, username: 'AI Assistant' };
        clearMessages();
        hideTyping();

        chatHeaderAvatar.textContent = '🤖';
        chatHeaderAvatar.className = 'chat-header-avatar ai-avatar';
        chatHeaderName.textContent = 'AI Assistant';
        chatHeaderStatus.innerHTML = `<span class="status-dot connected"></span> Online`;

        // Hide mood/topic for AI, show input area
        featureControls.style.display = 'none';
        topicFilterBar.style.display = 'none';
        summarizeBtn.style.display = 'none';

        highlightActiveChat('ai');

        messageInput.placeholder = 'Ask AI anything... Try /help';

        // Show welcome
        addAIWelcome();

        // Load previous AI messages if any
        if (aiChatId && aiChatId > 0) {
            loadPrivateMessages(aiChatId);
        }

        sidebar.classList.remove('show');
        chatPanel.classList.add('show');
        messageInput.focus();
    }

    function addAIWelcome() {
        addMessage({
            sender_username: 'AI Assistant',
            message: "🤖 Hello! I'm your AI Assistant. Here's what I can do:\n\n📊 /summarize — Summarize chat\n🧮 /math 2+2 — Calculate\n📝 /notes [text] — Bullet points\n💡 /help — All commands\n\nJust type naturally or use commands!",
            isAI: true,
            timestamp: new Date()
        });
    }

    // ============================================
    // LOAD MESSAGES
    // ============================================
    async function loadGlobalMessages() {
        try {
            const resp = await fetch('/api/chat/messages?limit=50', { credentials: 'include' });
            const data = await resp.json();
            if (data.success && data.messages.length > 0) {
                if (welcomeMessage) welcomeMessage.style.display = 'none';
                data.messages.forEach(msg => addMessage(msg, false));
                scrollToBottom();
            }
            loadTopics();
        } catch (e) { console.error('Error loading messages:', e); }
    }

    async function loadPrivateMessages(chatId) {
        try {
            const resp = await fetch(`/api/chats/${chatId}/messages?limit=50`, { credentials: 'include' });
            const data = await resp.json();
            if (data.success && data.messages.length > 0) {
                if (welcomeMessage) welcomeMessage.style.display = 'none';
                data.messages.forEach(msg => addMessage(msg, false));
                scrollToBottom();
            }
        } catch (e) { console.error('Error loading private messages:', e); }
    }

    async function loadTopics() {
        try {
            const resp = await fetch('/api/chat/topics', { credentials: 'include' });
            const data = await resp.json();
            if (data.success) {
                filterPills.querySelectorAll('.filter-pill:not([data-topic="all"])').forEach(p => p.remove());
                data.topics.forEach(t => addTopicPill(t));
            }
        } catch (e) { }
    }

    // ============================================
    // SEND MESSAGE
    // ============================================
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = messageInput.value.trim();
        if (!msg) return;
        if (!socket || !socket.connected) { alert('Not connected'); return; }

        const topicsRaw = topicInput ? topicInput.value.trim() : '';
        const topics = topicsRaw.split(',').map(t => t.trim().replace(/^#/, '')).filter(t => t);

        if (activeChat.type === 'global') {
            socket.emit('chat message', {
                message: msg, mood: selectedMood, topics, isAnonymous
            });
        } else if (activeChat.type === 'private') {
            socket.emit('send-private-message', {
                chatId: activeChat.chatId, message: msg, mood: selectedMood, topics, isAnonymous
            });
        } else if (activeChat.type === 'ai') {
            // Show user message immediately
            addMessage({
                sender_id: currentUser.id,
                sender_username: currentUser.username,
                message: msg, isAI: false, timestamp: new Date()
            });
            // Send to AI
            socket.emit('send-ai-message', {
                chatId: activeChat.chatId, message: msg
            });
        }

        messageInput.value = '';
        if (topicInput) topicInput.value = '';
        socket.emit('stop typing');
        messageInput.focus();
    });

    // ============================================
    // TYPING
    // ============================================
    messageInput.addEventListener('input', () => {
        if (!socket || !socket.connected) return;
        if (activeChat.type === 'global') {
            socket.emit('typing');
        } else if (activeChat.type === 'private') {
            socket.emit('typing-private', { chatId: activeChat.chatId });
        }
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            if (activeChat.type === 'global') socket.emit('stop typing');
            else if (activeChat.type === 'private') socket.emit('stop-typing-private', { chatId: activeChat.chatId });
        }, 2000);
    });

    // ============================================
    // MOOD SELECTOR
    // ============================================
    moodButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            moodButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedMood = btn.dataset.mood;
        });
    });

    // ============================================
    // ANONYMOUS TOGGLE
    // ============================================
    anonymousToggle.addEventListener('change', () => {
        isAnonymous = anonymousToggle.checked;
        document.getElementById('anonymous-toggle-wrapper').classList.toggle('active', isAnonymous);
    });

    // ============================================
    // TOPIC FILTER
    // ============================================
    filterPills.querySelector('[data-topic="all"]').addEventListener('click', () => filterByTopic('all'));

    function filterByTopic(topic) {
        filterPills.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        const pill = filterPills.querySelector(`[data-topic="${topic}"]`);
        if (pill) pill.classList.add('active');
        clearMessages();
        if (topic === 'all') {
            loadGlobalMessages();
        } else {
            fetch(`/api/chat/messages?limit=50&topic=${encodeURIComponent(topic)}`, { credentials: 'include' })
                .then(r => r.json()).then(d => {
                    if (d.success) d.messages.forEach(msg => addMessage(msg, false));
                });
        }
    }

    function addTopicPill(topic) {
        if (filterPills.querySelector(`[data-topic="${topic}"]`)) return;
        const pill = document.createElement('button');
        pill.className = 'filter-pill';
        pill.dataset.topic = topic;
        pill.textContent = `#${topic}`;
        pill.addEventListener('click', () => filterByTopic(topic));
        filterPills.appendChild(pill);
    }

    // ============================================
    // SUMMARY
    // ============================================
    summarizeBtn.addEventListener('click', async () => {
        summaryModal.classList.remove('hidden');
        summaryLoading.classList.remove('hidden');
        summaryResults.classList.add('hidden');
        try {
            const resp = await fetch('/api/chat/summarize', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'include', body: JSON.stringify({ limit: 50 })
            });
            displaySummary(await resp.json());
        } catch (e) { displaySummary({ success: false, message: 'Failed' }); }
    });

    summaryClose.addEventListener('click', () => summaryModal.classList.add('hidden'));
    summaryModal.addEventListener('click', (e) => { if (e.target === summaryModal) summaryModal.classList.add('hidden'); });

    function displaySummary(data) {
        summaryLoading.classList.add('hidden');
        summaryResults.classList.remove('hidden');
        if (!data.success) { summaryResults.innerHTML = `<p class="summary-empty">${data.message || 'No summary'}</p>`; return; }
        let html = `<div class="summary-section"><div class="summary-overview"><span class="summary-stat">📝 ${data.messageCount || 0} msgs</span><span class="summary-stat">👥 ${data.participantCount || 0} users</span></div><p class="summary-text">${escapeHtml(data.summary)}</p></div>`;
        if (data.discussionTopics?.length) html += `<div class="summary-section"><h3>🗂️ Topics</h3><div class="summary-topics">${data.discussionTopics.map(t => `<span class="summary-topic-pill">${escapeHtml(t)}</span>`).join('')}</div></div>`;
        if (data.keyPoints?.length) html += `<div class="summary-section"><h3>💡 Key Points</h3><ul class="summary-list">${data.keyPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`;
        if (data.keywords?.length) html += `<div class="summary-section"><h3>🔑 Keywords</h3><div class="summary-keywords">${data.keywords.slice(0, 10).map(k => `<span class="keyword-pill">${escapeHtml(k.word)} <small>(${k.count})</small></span>`).join('')}</div></div>`;
        summaryResults.innerHTML = html;
    }

    // ============================================
    // REVEAL SENDER
    // ============================================
    revealClose.addEventListener('click', () => revealModal.classList.add('hidden'));
    revealModal.addEventListener('click', (e) => { if (e.target === revealModal) revealModal.classList.add('hidden'); });

    async function revealSender(msgId) {
        try {
            const resp = await fetch('/api/chat/reveal-sender', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'include', body: JSON.stringify({ messageId: msgId })
            });
            const data = await resp.json();
            if (data.success) { revealUsername.textContent = data.realSender; revealModal.classList.remove('hidden'); }
            else alert(data.message || 'Cannot reveal');
        } catch (e) { console.error('Reveal error:', e); }
    }

    // ============================================
    // LOGOUT
    // ============================================
    logoutBtn.addEventListener('click', async () => {
        if (socket) socket.disconnect();
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/';
    });

    // ============================================
    // MESSAGE RENDERING
    // ============================================
    function addMessage(data, animate = true) {
        if (welcomeMessage) welcomeMessage.style.display = 'none';

        const el = document.createElement('div');
        const isOwn = data.sender_id === currentUser?.id || data.user_id === currentUser?.id ||
            (data.username === currentUser?.username && !data.isAI) ||
            (data.sender_username === currentUser?.username && !data.isAI);
        const isAI = data.isAI || data.is_ai;
        const mood = data.mood || 'happy';

        el.className = `message ${isAI ? 'ai-msg' : (isOwn ? 'own' : 'other')} mood-${mood}`;
        if (data.isAnonymous || data.is_anonymous) el.classList.add('anonymous');
        if (!animate) el.style.animation = 'none';

        const time = formatTime(data.timestamp);
        const moodInfo = moodConfig[mood] || moodConfig.happy;
        const topics = Array.isArray(data.topics) ? data.topics :
            (data.topics && typeof data.topics === 'string' ? data.topics.split(',').filter(t => t) : []);

        const username = data.sender_username || data.username || 'Unknown';

        let topicsHtml = '';
        if (topics.length > 0) {
            topicsHtml = `<div class="message-topics">${topics.map(t => `<span class="topic-tag">#${escapeHtml(t)}</span>`).join('')}</div>`;
        }

        let anonBadge = (data.isAnonymous || data.is_anonymous) ? '<span class="anon-badge">🕵️</span>' : '';
        let revealBtnHtml = (data.isAnonymous || data.is_anonymous) && currentUser?.isAdmin ? `<button class="reveal-btn" data-msg-id="${data.id}">🔍</button>` : '';
        let seenHtml = isOwn && activeChat.type === 'private' ? `<span class="seen-status ${data.isSeen || data.is_seen ? 'seen' : ''}">${data.isSeen || data.is_seen ? '✓✓' : '✓'}</span>` : '';

        const avatarEmoji = isAI ? '🤖' : '👤';
        const moodEmoji = !isAI ? `<span class="mood-emoji">${moodInfo.emoji}</span>` : '';

        // Determine message content type
        const msgType = data.message_type || data.messageType || 'text';
        const fileUrl = data.file_url || data.fileUrl;
        const fileName = data.file_name || data.fileName;
        const fileSize = data.file_size || data.fileSize;

        let msgContent = '';

        if (msgType === 'image' && fileUrl) {
            msgContent = `<div class="media-content image-content"><img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(fileName || 'Image')}" class="chat-image" onclick="document.getElementById('image-viewer-img').src=this.src;document.getElementById('image-viewer-modal').classList.remove('hidden')" loading="lazy"></div>`;
        } else if (msgType === 'video' && fileUrl) {
            msgContent = `<div class="media-content video-content"><video src="${escapeHtml(fileUrl)}" controls class="chat-video" preload="metadata"></video></div>`;
        } else if (msgType === 'file' && fileUrl) {
            const sizeStr = fileSize ? formatFileSize(fileSize) : '';
            msgContent = `<div class="media-content file-content"><div class="file-card"><span class="file-icon">📁</span><div class="file-info"><span class="file-card-name">${escapeHtml(fileName || 'File')}</span><span class="file-card-size">${sizeStr}</span></div><a href="${escapeHtml(fileUrl)}" target="_blank" class="file-download-btn" download>⬇️</a></div></div>`;
        } else {
            // Text message
            let msgText = escapeHtml(data.message);
            if (isAI) {
                msgText = msgText
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`(.*?)`/g, '<code>$1</code>')
                    .replace(/\n/g, '<br>');
            }
            msgContent = `<div class="message-content">${msgText}</div>`;
        }

        el.innerHTML = `
            <div class="message-avatar">${avatarEmoji}</div>
            <div class="message-body">
                <div class="message-header">
                    <span class="message-username">${escapeHtml(username)}</span>
                    ${anonBadge} ${moodEmoji}
                    <span class="message-time">${time}</span>
                    ${seenHtml} ${revealBtnHtml}
                </div>
                ${msgContent}
                ${topicsHtml}
            </div>
        `;

        const revealBtn = el.querySelector('.reveal-btn');
        if (revealBtn) revealBtn.addEventListener('click', () => revealSender(parseInt(revealBtn.dataset.msgId)));

        messagesContainer.appendChild(el);
        scrollToBottom();
    }

    function addNotification(msg, type) {
        const el = document.createElement('div');
        el.className = `notification ${type}`;
        el.innerHTML = `<span>${{ join: '→', leave: '←', info: 'ℹ️' }[type] || '•'}</span> <span>${escapeHtml(msg)}</span>`;
        messagesContainer.appendChild(el);
        scrollToBottom();
    }

    // ============================================
    // HELPERS
    // ============================================
    function clearMessages() {
        messagesContainer.querySelectorAll('.message, .notification').forEach(m => m.remove());
        if (welcomeMessage) welcomeMessage.style.display = '';
        messageInput.placeholder = activeChat.type === 'ai' ? 'Ask AI anything... Try /help' : 'Type a message...';
    }

    function highlightActiveChat(id) {
        document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('active-chat'));
        if (id === 'global') {
            document.getElementById('global-chat-item')?.classList.add('active-chat');
        } else if (id === 'ai') {
            document.getElementById('ai-chat-item')?.classList.add('active-chat');
        } else {
            const item = privateChatList.querySelector(`[data-chat-id="${id}"]`);
            if (item) item.classList.add('active-chat');
        }
    }

    function updateOnlineIndicators() {
        document.querySelectorAll('.user-item').forEach(item => {
            const uid = parseInt(item.dataset.userId);
            const dot = item.querySelector('.online-dot');
            const preview = item.querySelector('.chat-item-preview');
            const isOn = onlineUserIds.has(uid);
            if (dot) dot.className = `online-dot ${isOn ? 'online' : ''}`;
            if (preview) preview.innerHTML = isOn ? '<span class="online-text">Online</span>' : 'Offline';
        });
        document.querySelectorAll('#private-chat-list .chat-item').forEach(item => {
            const uid = parseInt(item.dataset.userId);
            const dot = item.querySelector('.online-dot-small');
            if (dot) dot.className = `online-dot-small ${onlineUserIds.has(uid) ? 'online' : ''}`;
        });
        // Update header if in private chat
        if (activeChat.type === 'private' && activeChat.userId) {
            const isOn = onlineUserIds.has(activeChat.userId);
            chatHeaderStatus.innerHTML = `<span class="online-dot ${isOn ? 'online' : ''}"></span> ${isOn ? 'Online' : 'Offline'}`;
        }
    }

    function updateHeaderStatus(text, cls) {
        if (activeChat.type === 'global') {
            chatHeaderStatus.innerHTML = `<span class="status-dot ${cls}"></span> ${text}`;
        }
    }

    function showTyping(username) {
        typingText.textContent = `${username} is typing`;
        typingIndicator.classList.remove('hidden');
    }

    function hideTyping() { typingIndicator.classList.add('hidden'); }
    function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }
    function formatTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    function escapeHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            summaryModal.classList.add('hidden');
            revealModal.classList.add('hidden');
            const imgViewer = document.getElementById('image-viewer-modal');
            if (imgViewer) imgViewer.classList.add('hidden');
        }
    });

    // ============================================
    // IMAGE VIEWER MODAL
    // ============================================
    const imageViewerModal = document.getElementById('image-viewer-modal');
    const imageViewerClose = document.getElementById('image-viewer-close');
    if (imageViewerClose) imageViewerClose.addEventListener('click', () => imageViewerModal.classList.add('hidden'));
    if (imageViewerModal) imageViewerModal.addEventListener('click', (e) => { if (e.target === imageViewerModal) imageViewerModal.classList.add('hidden'); });

    // ============================================
    // FILE UPLOAD — ATTACH BUTTON
    // ============================================
    const attachBtn = document.getElementById('attach-btn');
    const chatFileInput = document.getElementById('chat-file-input');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const uploadProgressFill = document.getElementById('upload-progress-fill');
    const uploadProgressText = document.getElementById('upload-progress-text');
    const filePreviewBar = document.getElementById('file-preview-bar');
    const filePreviewContent = document.getElementById('file-preview-content');
    const filePreviewCancel = document.getElementById('file-preview-cancel');

    let pendingFile = null;

    if (attachBtn) attachBtn.addEventListener('click', () => chatFileInput.click());

    if (chatFileInput) chatFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            alert('File too large. Max 10MB.');
            chatFileInput.value = '';
            return;
        }
        pendingFile = file;
        showFilePreview(file);
    });

    function showFilePreview(file) {
        filePreviewBar.classList.remove('hidden');
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                filePreviewContent.innerHTML = `<img src="${e.target.result}" class="file-preview-thumb" alt="preview"> <span>${escapeHtml(file.name)}</span>`;
            };
            reader.readAsDataURL(file);
        } else {
            const icon = file.type.startsWith('video/') ? '🎥' : '📁';
            filePreviewContent.innerHTML = `<span>${icon} ${escapeHtml(file.name)} (${formatFileSize(file.size)})</span>`;
        }
    }

    if (filePreviewCancel) filePreviewCancel.addEventListener('click', () => {
        pendingFile = null;
        filePreviewBar.classList.add('hidden');
        chatFileInput.value = '';
    });

    // Override send to check for pending file
    const origSubmitHandler = messageForm.onsubmit;
    messageForm.addEventListener('submit', async (e) => {
        if (pendingFile) {
            e.preventDefault();
            e.stopImmediatePropagation();
            await uploadAndSendFile(pendingFile);
            pendingFile = null;
            filePreviewBar.classList.add('hidden');
            chatFileInput.value = '';
            return false;
        }
    }, true); // use capture phase

    async function uploadAndSendFile(file) {
        uploadProgressBar.classList.remove('hidden');
        uploadProgressFill.style.width = '30%';
        uploadProgressText.textContent = 'Uploading...';

        try {
            const formData = new FormData();
            formData.append('file', file);

            uploadProgressFill.style.width = '60%';

            const resp = await fetch('/api/upload/file', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            const data = await resp.json();
            if (!data.success) {
                alert('Upload failed: ' + data.message);
                uploadProgressBar.classList.add('hidden');
                return;
            }

            uploadProgressFill.style.width = '90%';
            uploadProgressText.textContent = 'Sending...';

            const fileData = data.file;

            if (activeChat.type === 'global') {
                socket.emit('send-media-message', {
                    fileUrl: fileData.url,
                    fileName: fileData.name,
                    fileSize: fileData.size,
                    messageType: fileData.type,
                    mood: selectedMood,
                    topics: topicInput.value ? topicInput.value.split(',').map(t => t.trim().replace(/^#/, '')) : [],
                    isAnonymous
                });
            } else if (activeChat.type === 'private') {
                socket.emit('send-private-media', {
                    chatId: activeChat.chatId,
                    fileUrl: fileData.url,
                    fileName: fileData.name,
                    fileSize: fileData.size,
                    messageType: fileData.type,
                    mood: selectedMood
                });
            }

            uploadProgressFill.style.width = '100%';
            uploadProgressText.textContent = 'Sent!';
            setTimeout(() => uploadProgressBar.classList.add('hidden'), 1500);

        } catch (error) {
            console.error('Upload error:', error);
            alert('Upload failed. Please try again.');
            uploadProgressBar.classList.add('hidden');
        }
    }

    // ============================================
    // AVATAR UPLOAD
    // ============================================
    const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
    const avatarFileInput = document.getElementById('avatar-file-input');

    if (uploadAvatarBtn) uploadAvatarBtn.addEventListener('click', () => avatarFileInput.click());

    if (avatarFileInput) avatarFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Please select an image'); return; }
        if (file.size > 5 * 1024 * 1024) { alert('Image too large. Max 5MB.'); return; }

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const resp = await fetch('/api/upload/avatar', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const data = await resp.json();
            if (data.success) {
                const avatarImg = document.getElementById('current-user-avatar');
                const avatarFallback = document.getElementById('current-user-avatar-fallback');
                avatarImg.src = data.avatar;
                avatarImg.style.display = 'inline';
                avatarFallback.style.display = 'none';
                currentUser.avatar = data.avatar;
            } else {
                alert('Upload failed: ' + data.message);
            }
        } catch (error) {
            alert('Upload failed. Please try again.');
        }
        avatarFileInput.value = '';
    });

    // ============================================
    // HELPER: Format file size
    // ============================================
    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    window.addEventListener('beforeunload', () => { if (socket) socket.disconnect(); });
});

console.log('✅ Chat.js loaded (Private Chat + AI Chatbot)');
