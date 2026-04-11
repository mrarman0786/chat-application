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
    // DOM ELEMENTS
    // ============================================
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const messageContainer = document.getElementById('message-container');
    const messageText = document.getElementById('message-text');

    // ============================================
    // TAB SWITCHING
    // ============================================
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            // Update active tab button
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show/hide forms
            if (tab === 'login') {
                loginForm.classList.add('active');
                registerForm.classList.remove('active');
            } else {
                loginForm.classList.remove('active');
                registerForm.classList.add('active');
            }

            // Hide any messages
            hideMessage();
        });
    });

    // ============================================
    // LOGIN FORM SUBMISSION
    // ============================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        // Client-side validation
        if (!username || !password) {
            showMessage('Please fill in all fields', 'error');
            return;
        }

        // Disable button and show loader
        const loginBtn = document.getElementById('login-btn');
        setButtonLoading(loginBtn, true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Login successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = '/chat.html';
                }, 500);
            } else {
                showMessage(data.message || 'Login failed', 'error');
            }

        } catch (error) {
            console.error('Login error:', error);
            showMessage('Network error. Please try again.', 'error');
        } finally {
            setButtonLoading(loginBtn, false);
        }
    });

    // ============================================
    // REGISTER FORM SUBMISSION
    // ============================================
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;

        // Client-side validation
        if (!username || !email || !password) {
            showMessage('Please fill in all fields', 'error');
            return;
        }

        if (username.length < 3) {
            showMessage('Username must be at least 3 characters', 'error');
            return;
        }

        if (password.length < 6) {
            showMessage('Password must be at least 6 characters', 'error');
            return;
        }

        // Disable button and show loader
        const registerBtn = document.getElementById('register-btn');
        setButtonLoading(registerBtn, true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (data.success) {
                showMessage(data.message || 'Registration successful! Please log in.', 'success');
                // Switch to login tab
                setTimeout(() => {
                    tabButtons[0].click();
                }, 1500);
            } else {
                showMessage(data.message || 'Registration failed', 'error');
            }

        } catch (error) {
            console.error('Registration error:', error);
            showMessage('Network error. Please try again.', 'error');
        } finally {
            setButtonLoading(registerBtn, false);
        }
    });

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
