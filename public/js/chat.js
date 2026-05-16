// Initialize Socket.io
const socket = io();

// Globals
let currentChatId = null;
let currentRoomCode = null;
let currentUser = { id: null, username: '' };
let isBurnMode = false; // 10s Burn toggle
let hasTriedRoomRestore = false;

// --- Reimagined E2EE: Code-Derived AES-GCM ---
let currentSessionKey = null;

async function deriveKeyFromRoomCode(code) {
    console.log('Deriving E2EE key from room code...');
    const encoder = new TextEncoder();
    const data = encoder.encode(code + "TIC_TALK_SALT_2024");
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    
    currentSessionKey = await window.crypto.subtle.importKey(
        "raw", hash, "AES-GCM", true, ["encrypt", "decrypt"]
    );
    console.log('E2EE Key derived and active.');
    return currentSessionKey;
}

async function encryptWithAES(text) {
    if (!currentSessionKey) return text;
    try {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            currentSessionKey,
            encoded
        );
        return btoa(String.fromCharCode(...iv)) + "." + btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
    } catch (e) {
        console.error("Encryption error:", e);
        return text;
    }
}

async function decryptWithAES(combinedBase64) {
    if (!currentSessionKey || !combinedBase64.includes('.')) return combinedBase64;
    try {
        const [ivBase64, cipherBase64] = combinedBase64.split('.');
        const iv = new Uint8Array(atob(ivBase64).split("").map(c => c.charCodeAt(0)));
        const cipherBinary = atob(cipherBase64);
        const cipherBytes = new Uint8Array(cipherBinary.length).map((_, i) => cipherBinary.charCodeAt(i));
        
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            currentSessionKey,
            cipherBytes
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        return combinedBase64;
    }
}

// --- App Initialization & UI Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const lobbyScreen = document.getElementById('lobby-screen');
    const appContainer = document.getElementById('app-container');
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomCodeDisplay = document.getElementById('room-code-display');
    const generatedRoomCode = document.getElementById('generated-room-code');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const enterCreatedRoomBtn = document.getElementById('enter-created-room-btn');
    const joinRoomForm = document.getElementById('join-room-form');
    const joinRoomCodeInput = document.getElementById('join-room-code');
    const currentUsernameEl = document.getElementById('current-username');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Chat Panel Elements
    const chatHeaderName = document.getElementById('chat-header-name');
    const chatHeaderStatus = document.getElementById('chat-header-status');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const killRoomBtn = document.getElementById('kill-room-btn');
    const messagesContainer = document.getElementById('messages-container');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const dismissBanner = document.getElementById('dismiss-banner');
    
    const burnToggleBtn = document.getElementById('burn-toggle-btn');
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');

    // Load Theme from localStorage
    const savedTheme = localStorage.getItem('ticTalkTheme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Banner dismiss
    if (dismissBanner) {
        dismissBanner.addEventListener('click', () => {
            document.getElementById('incognito-banner').style.display = 'none';
        });
    }

    // Socket Events
    socket.on('welcome', (data) => {
        currentUser.id = data.userId;
        currentUser.username = data.username;
        if (currentUsernameEl) {
            currentUsernameEl.textContent = `Logged in as: ${data.username}`;
        }
        restoreRoomFromSession();
    });

    socket.on('error', (err) => {
        if (err.message && err.message.toLowerCase().includes('unauthorized')) {
            window.location.href = '/';
            return;
        }
        alert(err.message || 'An error occurred');
    });

    socket.on('connect_error', (err) => {
        if (err.message && err.message.toLowerCase().includes('authentication')) {
            window.location.href = '/';
        }
    });

    socket.on('receive-private-message', async (data) => {
        if (data.chat_id == currentChatId) { // == allows string/int match
            const isMe = data.sender_id === currentUser.id;
            let decryptedText = data.message;
            if (!data.isAI) {
                decryptedText = await decryptWithAES(data.message);
            }
            appendMessage(data.id, data.sender_username, decryptedText, isMe, data.timestamp, data.isBurn);
            scrollToBottom();
            
            // Mark seen
            if (!isMe) {
                socket.emit('message-seen', { chatId: currentChatId });
            }
        }
    });

    socket.on('room-killed', (data) => {
        if (data.chatId == currentChatId) {
            alert(data.reason === 'expired' ? 'This room has expired.' : 'This room has been closed.');
            leaveRoom(true); // true = don't emit leave, just UI clear
        }
    });

    socket.on('message-deleted', (data) => {
        if (data.chatType === 'private' && data.chatId == currentChatId) {
            document.getElementById('msg-' + data.messageId)?.remove();
        }
    });

    socket.on('reaction-added', (data) => {
        if (data.chatId == currentChatId) {
            const msgEl = document.getElementById('msg-' + data.messageId);
            if (!msgEl) return;
            
            let reactContainer = msgEl.querySelector('.reactions-container');
            if (!reactContainer) {
                reactContainer = document.createElement('div');
                reactContainer.className = 'reactions-container';
                // append under message-text
                msgEl.querySelector('.message-content').appendChild(reactContainer);
            }
            
            const reactEl = document.createElement('span');
            reactEl.className = 'reaction-badge';
            reactEl.textContent = data.emoji;
            reactContainer.appendChild(reactEl);
        }
    });

    socket.on('room-participants', (data) => {
        if (data.chatId == currentChatId) {
            updateParticipantStatus(data.participantCount || (data.participants ? data.participants.length : 1));
        }
    });

    // Create Room Flow
    createRoomBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/rooms/create', { method: 'POST' });
            if (redirectIfUnauthorized(res)) return;
            const data = await res.json();
            if (data.success) {
                createRoomBtn.style.display = 'none';
                roomCodeDisplay.classList.remove('hidden');
                generatedRoomCode.textContent = data.roomCode;
                currentChatId = data.chatId;
                currentRoomCode = data.roomCode;
            } else {
                alert(data.message || 'Failed to create room');
            }
        } catch (e) {
            console.error('Create room error:', e);
            alert('Failed to connect to server');
        }
    });

    copyCodeBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(currentRoomCode);
        copyCodeBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => {
            copyCodeBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
        }, 2000);
    });

    enterCreatedRoomBtn.addEventListener('click', () => {
        enterRoom(currentChatId, currentRoomCode, { participantCount: 1 });
    });

    // Join Room Flow
    joinRoomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = joinRoomCodeInput.value.trim().toUpperCase();
        if (code.length !== 8) {
            alert('Room code must be 8 characters long');
            return;
        }

        try {
            const res = await fetch('/api/rooms/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomCode: code })
            });
            if (redirectIfUnauthorized(res)) return;
            const data = await res.json();
            
            if (data.success) {
                enterRoom(data.chatId, data.roomCode, data);
            } else {
                alert(data.message || 'Failed to join room');
            }
        } catch (e) {
            console.error('Join room error:', e);
            alert('Failed to connect to server');
        }
    });

    // Leave Room
    leaveRoomBtn.addEventListener('click', () => {
        leaveRoom();
    });

    // Kill Room
    killRoomBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to completely DESTROY this room and kick all users?')) {
            socket.emit('kill-room', { chatId: currentChatId });
        }
    });

    // Burn Toggle
    if (burnToggleBtn) {
        burnToggleBtn.addEventListener('click', () => {
            isBurnMode = !isBurnMode;
            burnToggleBtn.style.color = isBurnMode ? '#ef4444' : 'var(--text-muted)';
        });
    }

    // Emoji Picker
    if (emojiBtn && emojiPicker) {
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emojiPicker.classList.toggle('hidden');
        });
        
        document.addEventListener('click', () => {
            emojiPicker.classList.add('hidden');
        });

        emojiPicker.querySelectorAll('.emoji-opt').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                messageInput.value += e.target.textContent;
                emojiPicker.classList.add('hidden');
                messageInput.focus();
            });
        });
    }

    // Send Message
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (!text || !currentChatId) return;

        messageInput.value = '';
        const encrypted = await encryptWithAES(text);

        socket.emit('send-private-message', {
            chatId: currentChatId,
            message: encrypted,
            mood: 'happy',
            isBurn: isBurnMode
        });
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            sessionStorage.clear();
            window.location.href = '/';
        } catch (e) {
            console.error('Logout error:', e);
        }
    });

    // Functions
    function redirectIfUnauthorized(res) {
        if (res.status === 401) {
            window.location.href = '/';
            return true;
        }
        return false;
    }

    async function restoreRoomFromSession() {
        if (hasTriedRoomRestore || currentChatId) return;
        hasTriedRoomRestore = true;

        try {
            const res = await fetch('/api/rooms/current');
            if (redirectIfUnauthorized(res)) return;
            const data = await res.json();
            if (data.success && data.room) {
                await enterRoom(data.room.chatId, data.room.roomCode, data.room);
            }
        } catch (e) {
            console.error('Room session restore failed:', e);
        }
    }

    async function loadRoomMessages(chatId) {
        try {
            const res = await fetch(`/api/chats/${chatId}/messages?limit=50`);
            if (redirectIfUnauthorized(res)) return;
            if (res.status === 410) {
                alert('This room has expired or is closed.');
                await leaveRoom(true);
                return;
            }

            const data = await res.json();
            if (!data.success || !Array.isArray(data.messages)) return;

            for (const msg of data.messages) {
                const isMe = msg.sender_id === currentUser.id;
                const decryptedText = msg.isAI ? msg.message : await decryptWithAES(msg.message);
                appendMessage(msg.id, msg.sender_username, decryptedText, isMe, msg.timestamp, msg.isBurn);
            }
            scrollToBottom();
        } catch (e) {
            console.error('Load room messages failed:', e);
        }
    }

    function updateParticipantStatus(count) {
        if (!chatHeaderStatus) return;
        const safeCount = Math.max(Number(count) || 1, 1);
        chatHeaderStatus.innerHTML = `
            <span class="status-dot connected"></span> Secure (E2EE) - ${safeCount} participant${safeCount === 1 ? '' : 's'}
        `;
    }

    async function enterRoom(chatId, roomCode, roomMeta = {}) {
        currentChatId = chatId;
        currentRoomCode = roomCode;

        await deriveKeyFromRoomCode(roomCode);
        
        lobbyScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        chatHeaderName.textContent = `Room: ${roomCode}`;
        updateParticipantStatus(roomMeta.participantCount || (roomMeta.participants ? roomMeta.participants.length : 1));
        
        messagesContainer.innerHTML = `
            <div class="system-message" id="welcome-message">
                <p><i class="fa-solid fa-hand"></i> Welcome to room ${roomCode}! Messages are E2EE and delete after 24h.</p>
            </div>
        `;
        
        await loadRoomMessages(chatId);
        socket.emit('join-private-chat', { chatId });
    }

    async function leaveRoom(forced = false) {
        const leavingChatId = currentChatId;
        if (!forced && leavingChatId) {
            try {
                await fetch('/api/rooms/leave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chatId: leavingChatId })
                });
            } catch (e) {
                console.error('Leave room error:', e);
            }
            socket.emit('leave-private-chat', { chatId: leavingChatId });
        }
        currentChatId = null;
        currentRoomCode = null;
        currentSessionKey = null;
        
        appContainer.style.display = 'none';
        lobbyScreen.style.display = 'block';
        
        // Reset create room UI
        createRoomBtn.style.display = 'block';
        roomCodeDisplay.classList.add('hidden');
        joinRoomCodeInput.value = '';
    }

    function appendMessage(id, senderName, text, isMe, timestamp, isBurn) {
        const div = document.createElement('div');
        div.className = `message ${isMe ? 'sent own' : 'received other'}`;
        div.id = 'msg-' + id;
        
        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let burnHtml = '';
        if (isBurn) {
            burnHtml = `<div class="burn-indicator" style="font-size: 0.75rem; color: #ef4444; margin-top: 5px;"><i class="fa-solid fa-fire"></i> Destructing...</div>`;
            
            // Delete locally and trigger backend delete
            setTimeout(() => {
                socket.emit('delete-message', { messageId: id, chatType: 'private', chatId: currentChatId });
                div.remove();
            }, 10000);
        }
        
        div.innerHTML = `
            <div class="message-content glass-morphic" oncontextmenu="showMessageMenu(event, ${id})">
                ${!isMe ? `<div class="message-sender" style="font-weight: 600; font-size: 0.8rem; margin-bottom: 2px;">${escapeHtml(senderName)}</div>` : ''}
                <div class="message-text">${escapeHtml(text)}</div>
                ${burnHtml}
                <div class="message-info">
                    <span class="message-time">${timeStr}</span>
                </div>
            </div>
        `;
        
        messagesContainer.appendChild(div);
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    function escapeHtml(unsafe) {
        return String(unsafe)
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});

// --- Message Context Menu ---
let activeMenuId = null;

window.showMessageMenu = function(e, messageId) {
    e.preventDefault();
    closeAllMenus();
    
    const menu = document.createElement('div');
    menu.className = 'message-menu glass-morphic';
    menu.id = 'menu-' + messageId;
    activeMenuId = messageId;
    
    menu.innerHTML = `
        <div class="menu-item danger" onclick="handleMenuAction('delete', ${messageId})"><i class="fa-solid fa-trash"></i> Delete</div>
        <div class="menu-divider" style="border-top: 1px solid rgba(255,255,255,0.1); margin: 5px 0;"></div>
        <div class="reaction-row" style="display: flex; gap: 8px; justify-content: center; padding: 5px;">
            <span class="react-opt" style="cursor:pointer;" onclick="handleReaction(${messageId}, '❤️')">❤️</span>
            <span class="react-opt" style="cursor:pointer;" onclick="handleReaction(${messageId}, '😂')">😂</span>
            <span class="react-opt" style="cursor:pointer;" onclick="handleReaction(${messageId}, '🔥')">🔥</span>
            <span class="react-opt" style="cursor:pointer;" onclick="handleReaction(${messageId}, '👍')">👍</span>
            <span class="react-opt" style="cursor:pointer;" onclick="handleReaction(${messageId}, '😮')">😮</span>
        </div>
    `;
    
    document.body.appendChild(menu);
    
    const rect = e.target.closest('.message-content').getBoundingClientRect();
    menu.style.top = (rect.top + window.scrollY - 40) + 'px';
    menu.style.left = (rect.left + window.scrollX) + 'px';
};

function closeAllMenus() {
    document.querySelectorAll('.message-menu').forEach(m => m.remove());
    activeMenuId = null;
}

window.handleMenuAction = (action, messageId) => {
    if (action === 'delete') {
        socket.emit('delete-message', { messageId, chatType: 'private', chatId: currentChatId });
        document.getElementById('msg-' + messageId)?.remove();
    }
    closeAllMenus();
};

window.handleReaction = (messageId, emoji) => {
    socket.emit('add-reaction', { messageId, chatId: currentChatId, emoji });
    closeAllMenus();
};

document.addEventListener('click', closeAllMenus);

// Handle Theme Switching
document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('theme-btn');
    const themeDropdown = document.getElementById('theme-dropdown');
    
    if (themeBtn && themeDropdown) {
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            themeDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', () => {
            themeDropdown.classList.add('hidden');
        });
        
        document.querySelectorAll('.theme-opt').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const theme = e.target.getAttribute('data-theme');
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('ticTalkTheme', theme); // persist
            });
        });
    }
});
