const fs = require('fs');
let css = fs.readFileSync('public/css/style.css', 'utf8');

const newRoot = `:root {
    --glass-white: 0, 0, 0;
    --glass-black: 0, 0, 0;
    --primary-500: #007aff;
    --primary-600: #005bb5;
    --secondary-500: #ff2d55;
    
    --bg-primary: #f2f2f7;
    --bg-secondary: #ffffff;
    --bg-tertiary: #e5e5ea;
    --bg-card: rgba(0, 0, 0, 0.7);
    --bg-sidebar: #f2f2f7;
    --text-primary: #000000;
    --text-secondary: #3c3c43;
    --text-muted: #8e8e93;
    
    --success: #34c759;
    --error: #ff3b30;
    --warning: #ffcc00;
    --ai-accent: #5e5ce6;
    
    --mood-happy: linear-gradient(135deg, #ff9f0a, #ffd60a);
    --mood-sad: linear-gradient(135deg, #0a84ff, #64d2ff);
    --mood-angry: linear-gradient(135deg, #ff453a, #ff3b30);
    --mood-calm: linear-gradient(135deg, #30d158, #34c759);
    --mood-excited: linear-gradient(135deg, #bf5af2, #5e5ce6);
    
    --gradient-primary: linear-gradient(135deg, #007aff, #bf5af2);
    --gradient-bg: var(--bg-primary);
    --shadow-sm: 0 1px 3px rgba(0,0,0, 0.05), 0 1px 2px rgba(0,0,0, 0.05);
    --shadow-md: 0 4px 6px rgba(0,0,0, 0.08);
    --shadow-lg: 0 10px 20px rgba(0,0,0, 0.08);
    --shadow-glow: 0 0 20px rgba(0, 122, 255, 0.15);
    
    --radius-sm: 8px;
    --radius-md: 14px;
    --radius-lg: 20px;
    --radius-xl: 30px;
    --radius-full: 9999px;
    
    --transition-fast: 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
    --transition-normal: 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
    --sidebar-width: 320px;
    --border-color: rgba(60, 60, 67, 0.15);
}`;

css = css.replace(/:root\s*\{[\s\S]*?\}\s*\[data-theme="light"\]\s*\{[\s\S]*?\}/, newRoot);

const newAuthCSS = `/* ============================================
   AUTH PAGE (Login/Register)
   ============================================ */
.auth-page {
    margin: 0;
    padding: 0;
    overflow: hidden;
    position: relative;
    background: #007aff;
    height: 100vh;
    width: 100vw;
}

/* Animated Mesh Gradient Background */
.auth-page::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle at 10% 20%, #4facfe 0%, transparent 45%),
                radial-gradient(circle at 90% 10%, #00f2fe 0%, transparent 45%),
                radial-gradient(circle at 80% 80%, #bf5af2 0%, transparent 45%),
                radial-gradient(circle at 20% 90%, #ff2d55 0%, transparent 45%),
                #5ac8fa;
    filter: blur(80px);
    z-index: -1;
    animation: meshRotate 30s linear infinite;
    opacity: 0.9;
}

@keyframes meshRotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.auth-split-layout {
    display: flex;
    width: 100%;
    height: 100%;
    position: relative;
    z-index: 2;
}

/* Left Hero Side */
.auth-hero {
    flex: 1.2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 80px;
    color: white;
}

.hero-logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 60px;
}

.hero-logo .logo-icon {
    font-size: 2.5rem;
}

.hero-logo h1 {
    font-size: 1.8rem;
    font-weight: 600;
}

.auth-hero h2 {
    font-size: 5rem;
    font-weight: 800;
    line-height: 1.05;
    margin-bottom: 30px;
    letter-spacing: -0.03em;
}

.auth-hero p {
    font-size: 1.2rem;
    max-width: 440px;
    line-height: 1.5;
    opacity: 0.9;
}

/* Right Form Side */
.auth-panel {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
}

.auth-container {
    width: 100%;
    max-width: 440px;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: blur(30px) saturate(150%);
    -webkit-backdrop-filter: blur(30px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: var(--radius-xl);
    padding: 40px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.08);
    animation: fadeIn 0.8s ease;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Pill Toggle (Segmented Control) */
.auth-tabs-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 30px;
}

.auth-tabs {
    display: flex;
    background: rgba(255, 255, 255, 0.6);
    padding: 6px;
    border-radius: 40px;
    position: relative;
    width: 100%;
    max-width: 280px;
}

.tab-btn {
    flex: 1;
    padding: 12px;
    border: none;
    background: transparent;
    font-size: 0.95rem;
    font-weight: 600;
    color: #3c3c43;
    cursor: pointer;
    z-index: 2;
    transition: color 0.3s ease;
}

.tab-btn.active {
    color: white;
}

.tab-indicator {
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 6px;
    width: calc(50% - 6px);
    background: var(--primary-500);
    border-radius: 30px;
    z-index: 1;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
}

.auth-tabs [data-tab="register"].active ~ .tab-indicator {
    transform: translateX(100%);
}

.message-container {
    padding: 16px;
    border-radius: var(--radius-sm);
    margin-bottom: 16px;
    animation: fadeIn 0.3s ease;
    font-size: 0.9rem;
    text-align: center;
}

.message-container.hidden {
    display: none;
}

.message-container.success {
    background: rgba(52, 199, 89, 0.15);
    border: 1px solid var(--success);
    color: #1a8f35;
}

.message-container.error {
    background: rgba(255, 59, 48, 0.15);
    border: 1px solid var(--error);
    color: #d11e14;
}

/* Forms */
.auth-form {
    display: none;
}

.auth-form.active {
    display: block;
    animation: fadeIn 0.4s ease;
}

.form-group {
    margin-bottom: 16px;
}

.input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.input-icon {
    position: absolute;
    left: 18px;
    font-size: 1rem;
    color: #8e8e93;
    transition: color 0.3s ease;
}

.input-wrapper input {
    width: 100%;
    padding: 16px 16px 16px 46px;
    border: 1px solid rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.6);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-weight: 400;
    color: #000;
    outline: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.input-wrapper input:focus {
    border-color: var(--primary-500);
    background: #ffffff;
    box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.15);
}

.input-wrapper input:focus + .input-icon,
.input-wrapper input:not(:placeholder-shown) + .input-icon {
    color: var(--primary-500);
}

.input-wrapper input::placeholder {
    color: #8e8e93;
}

.input-hint {
    display: block;
    margin-top: 6px;
    font-size: 0.75rem;
    color: #666;
    margin-left: 4px;
}

.submit-btn {
    width: 100%;
    padding: 16px;
    background: var(--primary-500);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
    margin-top: 10px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 14px rgba(0, 122, 255, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}

.submit-btn:hover {
    transform: translateY(-2px);
    background: var(--primary-600);
    box-shadow: 0 6px 20px rgba(0, 122, 255, 0.4);
}

.submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
}

.btn-loader {
    display: inline-block;
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

.btn-loader.hidden {
    display: none;
}

.auth-footer {
    text-align: center;
    margin-top: 30px;
    color: #3c3c43;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.auth-footer i {
    font-size: 0.8rem;
}

/* Responsive */
@media (max-width: 1024px) {
    .auth-hero h2 {
        font-size: 4rem;
    }
}

@media (max-width: 768px) {
    .auth-split-layout {
        flex-direction: column;
        justify-content: flex-start;
        padding-top: 40px;
    }

    .auth-hero {
        flex: none;
        padding: 40px 24px 20px;
        text-align: center;
        align-items: center;
        display: flex;
    }

    .hero-logo {
        margin-bottom: 20px;
        justify-content: center;
    }

    .auth-hero h2 {
        font-size: 3rem;
        margin-bottom: 12px;
    }

    .auth-hero p {
        display: none;
    }

    .auth-panel {
        padding: 24px;
        align-items: flex-start;
        flex: 1;
    }

    .auth-container {
        padding: 30px 24px;
        max-width: 100%;
    }
}
`;

const authStart = css.indexOf('/* ============================================');
const authEnd = css.indexOf('/* ============================================', authStart + 10);
if (authStart !== -1 && authEnd !== -1) {
    css = css.substring(0, authStart) + newAuthCSS + '\n\n' + css.substring(authEnd);
} else {
    console.error('Could not find auth boundaries.');
}

fs.writeFileSync('public/css/style.css', css, 'utf8');
console.log('done');
