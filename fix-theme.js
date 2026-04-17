const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'css', 'style.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

// 1. Add the CSS variables to :root and [data-theme="light"]
if (!cssContent.includes('--glass-white')) {
    cssContent = cssContent.replace(
        ':root {',
        ':root {\n    --glass-white: 255, 255, 255;\n    --glass-black: 0, 0, 0;'
    );
    cssContent = cssContent.replace(
        '[data-theme="light"] {',
        '[data-theme="light"] {\n    --glass-white: 0, 0, 0;\n    --glass-black: 0, 0, 0;'
    );
}

// 2. Replace rgba(255, 255, 255, 0.x) with rgba(var(--glass-white), 0.x)
// Handling spaces: rgba(255, 255, 255, X) or rgba(255,255,255,X)
cssContent = cssContent.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g, 'rgba(var(--glass-white),');

// 3. Replace rgba(0, 0, 0, 0.x) with rgba(var(--glass-black), 0.x)
cssContent = cssContent.replace(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/g, 'rgba(var(--glass-black),');

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log('CSS updated successfully!');
