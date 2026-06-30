const fs = require('fs');
const path = require('path');

const srcDir = 'c:\\Users\\HP\\OneDrive\\Pictures\\Documents\\Skills\\LUDO';
const outputFilePath = path.join(srcDir, 'app.min.js');

// Strict order required by dependencies
const files = [
    'sounds.js',
    'board.js',
    'dice.js',
    'ai.js',
    'ui.js',
    'game-logic.js'
];

function minifyJS(code) {
    let inString = null; // '"', "'", '`'
    let inComment = null; // 'inline', 'block'
    let escaped = false;
    let result = '';

    for (let i = 0; i < code.length; i++) {
        const char = code[i];
        const next = code[i + 1] || '';

        // Handle escape sequences in strings
        if (escaped) {
            if (!inComment) result += char;
            escaped = false;
            continue;
        }
        if (char === '\\') {
            if (!inComment) result += char;
            escaped = true;
            continue;
        }

        // Handle comments
        if (inComment === 'inline') {
            if (char === '\n' || char === '\r') {
                inComment = null;
                result += '\n'; // Keep line breaks for safety
            }
            continue;
        }
        if (inComment === 'block') {
            if (char === '*' && next === '/') {
                inComment = null;
                i++; // skip '/'
            }
            continue;
        }

        // Check if entering comment
        if (!inString) {
            if (char === '/' && next === '/') {
                inComment = 'inline';
                i++; // skip '/'
                continue;
            }
            if (char === '/' && next === '*') {
                inComment = 'block';
                i++; // skip '*'
                continue;
            }
        }

        // Handle strings
        if (inString) {
            result += char;
            if (char === inString) {
                inString = null;
            }
            continue;
        }

        if (char === '"' || char === "'" || char === '`') {
            inString = char;
            result += char;
            continue;
        }

        result += char;
    }

    // Now split the code by strings to optimize whitespace in code only
    let parts = [];
    let current = '';
    let isStr = null;
    let esc = false;
    for (let i = 0; i < result.length; i++) {
        const char = result[i];
        if (esc) {
            current += char;
            esc = false;
            continue;
        }
        if (char === '\\') {
            current += char;
            esc = true;
            continue;
        }
        if (isStr) {
            current += char;
            if (char === isStr) {
                parts.push({ text: current, isString: true });
                current = '';
                isStr = null;
            }
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            if (current) {
                parts.push({ text: current, isString: false });
            }
            current = char;
            isStr = char;
            continue;
        }
        current += char;
    }
    if (current) {
        parts.push({ text: current, isString: !!isStr });
    }

    // Compress whitespace outside of strings
    const minifiedParts = parts.map(p => {
        if (p.isString) return p.text;
        let txt = p.text;
        // Replace multiple whitespaces/tabs with a single space
        txt = txt.replace(/[ \t]+/g, ' ');
        // Remove spaces around operator characters
        txt = txt.replace(/\s*([\+\-\*\/=\(\)\{\}\[\]\n\r;,<>:!\?&\|])\s*/g, '$1');
        // Clean up excess newlines
        txt = txt.replace(/[\n\r]+/g, '\n');
        return txt;
    });

    return minifiedParts.join('').trim();
}

console.log('Starting Ludo game JS bundling and minification...');
let combinedCode = '';

for (const file of files) {
    const filePath = path.join(srcDir, file);
    console.log(`Reading: ${file}`);
    const content = fs.readFileSync(filePath, 'utf8');
    combinedCode += `\n/* === BUNDLED: ${file} === */\n` + content + '\n';
}

console.log('Minifying combined JS bundle...');
const minifiedCode = minifyJS(combinedCode);

console.log(`Writing minified output to: ${outputFilePath}`);
fs.writeFileSync(outputFilePath, minifiedCode, 'utf8');

const originalSize = combinedCode.length;
const minifiedSize = minifiedCode.length;
const compressionRatio = ((originalSize - minifiedSize) / originalSize * 100).toFixed(2);

console.log('Bundling & Minification Complete!');
console.log(`Original combined size: ${(originalSize / 1024).toFixed(2)} KB`);
console.log(`Minified bundle size: ${(minifiedSize / 1024).toFixed(2)} KB`);
console.log(`Compressed by: ${compressionRatio}%`);
