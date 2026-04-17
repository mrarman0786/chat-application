/**
 * ============================================
 * AUTHENTICATION JAVASCRIPT
 * ============================================
 * 
 * Handles login and registration forms:
 * - Tab switching between Login and Register
 * - Form submission with validation
 * - Error/success message display
 * - Redirect to chat on successful login
 * 
 * VIVA EXPLANATION:
 * Uses Fetch API for AJAX requests to the server.
 * Form data is validated client-side before sending
 * to reduce unnecessary server requests.
 * 
 * ============================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // E2EE KEY GENERATION
    // ============================================
    async function generateE2EEKeys() {
        try {
            const keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
                },
                true,
                ["encrypt", "decrypt"]
            );

            const publicKeyJWK = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
            const privateKeyJWK = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
            
            sessionStorage.setItem('chat_private_key', JSON.stringify(privateKeyJWK));
            return JSON.stringify(publicKeyJWK);
        } catch (e) {
            console.error('Key generation error:', e);
            return null;
        }
    }

    // ============================================
    // DOM ELEMENTS
    // ============================================
    const guestForm = document.getElementById('guest-form');
    const messageContainer = document.getElementById('message-container');
    const messageText = document.getElementById('message-text');

    // ============================================
    // GUEST FORM SUBMISSION
    // ============================================
    if (guestForm) {
        guestForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('guest-username').value.trim();
            if (!username) return;

            const btn = document.getElementById('guest-btn');
            const btnText = btn.querySelector('.btn-text');
            const originalText = btnText.textContent;
            
            btn.disabled = true;
            btnText.textContent = 'Generating keys...';

            const publicKey = await generateE2EEKeys();
            if (!publicKey) {
                showMessage('Security error: Could not generate keys', 'error');
                btn.disabled = false;
                btnText.textContent = originalText;
                return;
            }

            btnText.textContent = 'Joining chat...';

            const guestBtn = document.getElementById('guest-btn');
            setButtonLoading(guestBtn, true);

            try {
                // Generate E2EE Keys
                showMessage('Securing your connection...', 'success');
                const publicKey = await generateE2EEKeys();

                const response = await fetch('/api/auth/guest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username, publicKey })
                });

                const data = await response.json();

                if (data.success) {
                    showMessage('Welcome! Redirecting to secure chat...', 'success');
                    setTimeout(() => {
                        window.location.href = '/chat.html';
                    }, 800);
                } else {
                    showMessage(data.message || 'Login failed', 'error');
                }

            } catch (error) {
                console.error('Guest login error:', error);
                showMessage('Network error. Please try again.', 'error');
            } finally {
                setButtonLoading(guestBtn, false);
            }
        });
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Show a message to the user
     * @param {string} message - Message to display
     * @param {string} type - 'success' or 'error'
     */
    function showMessage(message, type) {
        messageText.textContent = message;
        messageContainer.className = `message-container ${type}`;
        messageContainer.classList.remove('hidden');
    }

    /**
     * Hide the message container
     */
    function hideMessage() {
        messageContainer.classList.add('hidden');
    }

    /**
     * Toggle button loading state
     * @param {HTMLElement} button - Button element
     * @param {boolean} loading - Loading state
     */
    function setButtonLoading(button, loading) {
        const btnText = button.querySelector('.btn-text');
        const btnLoader = button.querySelector('.btn-loader');

        if (loading) {
            button.disabled = true;
            if (btnText) btnText.classList.add('hidden');
            if (btnLoader) btnLoader.classList.remove('hidden');
        } else {
            button.disabled = false;
            if (btnText) btnText.classList.remove('hidden');
            if (btnLoader) btnLoader.classList.add('hidden');
        }
    }

    // ============================================
    // CHECK IF ALREADY LOGGED IN
    // ============================================
    async function checkExistingAuth() {
        try {
            const response = await fetch('/api/auth/check', { credentials: 'include' });
            const data = await response.json();
            if (data.authenticated) {
                window.location.href = '/chat.html';
            }
        } catch (error) {
            // Not logged in, stay on login page
        }
    }

    checkExistingAuth();
});

console.log('✅ Auth.js loaded successfully');
