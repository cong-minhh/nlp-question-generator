// ASCII Art and CLI utilities for NLP Question Generator

/**
 * Color codes for terminal output
 */
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

/**
 * Main ASCII Art Banner
 */
/*
const mainBanner = `
${colors.cyan}╔══════════════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bright}${colors.white}█   █ █▀▀▀█ █▀▀▀█ █▀▀▀█ ▀▀█▀▀ █▀▀█ █▀▀▄ ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bright}${colors.white}█   █ █   █ █   █ █   █   █   █▄▄█ █▀▀▄ ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bright}${colors.white}▀▀▀▀▀ ▀▀▀▀▀ ▀▀▀▀▀ ▀▀▀▀▀   ▀   ▀▀▀▀ ▀▀▀▀ ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.cyan}         ${colors.bright}${colors.white}Multi-Provider AI System${colors.cyan}                  ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════════════╝${colors.reset}`;
*/

/**
 * Secondary banner with version info
 */
const versionBanner = `${colors.gray}│ ${colors.yellow}Version${colors.reset} ${colors.white}v3.0.0${colors.gray}  │ ${colors.yellow}Multi-Provider${colors.reset}  │ ${colors.yellow}CLI Ready${colors.reset}  │${colors.gray}\n`;

/**
 * Small compact banner
 */
const compactBanner = `
${colors.cyan}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
${colors.cyan}▓${colors.reset} ${colors.bright}${colors.white}NLP QUESTION GENERATOR${colors.reset} ${colors.cyan}▓
${colors.cyan}▓${colors.reset}     ${colors.dim}${colors.white}Multi-Provider AI System v3.0${colors.reset}    ${colors.cyan}▓
${colors.cyan}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓${colors.reset}
`;

/**
 * Cozy Garden Banner
 */
const gardenBanner = `
${colors.green}    ╱|、${colors.reset}                 ${colors.cyan}╭───────────────────╮${colors.reset}
${colors.green}   (˚ˎ 。7${colors.reset}               ${colors.cyan}|   NLP Question    |${colors.reset}
${colors.green}   |、˜〵${colors.reset}                ${colors.cyan}|    Generator      |${colors.reset}
${colors.green}   じしˍ,)ノ${colors.reset}             ${colors.cyan}╰───────────────────╯${colors.reset}

${colors.green}  🌱  ${colors.yellow}Multi-Questions-Generator  ${colors.green}🌱${colors.reset}
${colors.gray}  ─────────────────────────────────────${colors.reset}
`;

/**
 * Loading spinner frames
 */
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Progress bar template
 */
function createProgressBar(current, total, width = 30) {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${total}`;
}

/**
 * Display loading spinner
 */
async function showSpinner(message, duration = 2000) {
    let frame = 0;
    const interval = setInterval(() => {
        process.stdout.write(`\r${colors.cyan}${spinnerFrames[frame]}${colors.reset} ${message}`);
        frame = (frame + 1) % spinnerFrames.length;
    }, 100);

    await new Promise(resolve => setTimeout(resolve, duration));
    clearInterval(interval);
    process.stdout.write('\n');
}

/**
 * Display success message
 */
function showSuccess(message) {
    console.log(`${colors.green}✓${colors.reset} ${message}`);
}

/**
 * Display error message
 */
function showError(message) {
    console.log(`${colors.red}✗${colors.reset} ${message}`);
}

/**
 * Display warning message
 */
function showWarning(message) {
    console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

/**
 * Display info message
 */
function showInfo(message) {
    console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

/**
 * Display styled section header
 */
function showSection(title) {
    console.log(`\n${colors.cyan}┌─────────────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset} ${colors.bright}${colors.white}${title} ${colors.reset}${' '.repeat(51 - title.length)}${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}└─────────────────────────────────────────────────────┘${colors.reset}`);
}

/**
 * Display provider status with icons
 */
function showProviderStatus(providerName, status, description) {
    const icon = status === 'configured' ? '✓' : '⚠';
    const color = status === 'configured' ? colors.green : colors.yellow;
    console.log(`${color}${icon}${colors.reset} ${colors.bright}${providerName}${colors.reset}: ${description} (${status})`);
}

/**
 * Display endpoint information
 */
function showEndpoint(method, path, description) {
    const methodColor = {
        'GET': colors.green,
        'POST': colors.blue,
        'PUT': colors.yellow,
        'DELETE': colors.red
    }[method] || colors.gray;

    console.log(`  ${methodColor}${method}${colors.reset} ${colors.white}${path}${colors.reset}`);
    console.log(`    ${colors.gray}${description}${colors.reset}`);
}

/**
 * Clear terminal
 */
function clear() {
    process.stdout.write('\x1Bc');
}

/**
 * Print main banner with version
 */
/*
function printMainBanner() {
    clear();
    console.log(mainBanner);
    console.log(versionBanner);
}
*/

/**
 * Print compact banner
 */
function printCompactBanner() {
    console.log(compactBanner);
}

/**
 * Print garden banner
 */
function printGardenBanner() {
    clear();
    console.log(gardenBanner);
}


/**
 * Animated typing effect for important messages
 */
async function typeWriter(text, delay = 50) {
    for (let i = 0; i < text.length; i++) {
        process.stdout.write(text[i]);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    console.log();
}

/**
 * Display version info
 */
function showVersion() {
    console.log(`${colors.gray}${colors.dim}NLP Question Generator - Multi-Provider AI System${colors.reset}`);
}

/**
 * Create box with content
 */
function createBox(content, title = '') {
    const lines = content.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length), title.length);
    const boxWidth = maxLength + 4;
    
    let box = `${colors.cyan}┌${'─'.repeat(boxWidth - 2)}┐${colors.reset}\n`;
    
    if (title) {
        // Note: String.prototype.padLeft is not a standard function. Using padStart.
        const paddedTitle = title.padStart(title.length + Math.floor((boxWidth - title.length - 2) / 2)).padEnd(boxWidth - 2);
        box += `${colors.cyan}│${colors.reset} ${colors.bright}${paddedTitle}${colors.reset} ${colors.cyan}│${colors.reset}\n`;
        box += `${colors.cyan}├${'─'.repeat(boxWidth - 2)}┤${colors.reset}\n`;
    }
    
    for (const line of lines) {
        const padded = line.padEnd(maxLength);
        box += `${colors.cyan}│${colors.reset} ${padded} ${colors.cyan}│${colors.reset}\n`;
    }
    
    box += `${colors.cyan}└${'─'.repeat(boxWidth - 2)}┘${colors.reset}`;
    return box;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Display system info
 */
function showSystemInfo() {
    const memoryUsage = process.memoryUsage();
    console.log(`\n${colors.gray}System Info:${colors.reset}`);
    console.log(`  Memory: ${formatBytes(memoryUsage.heapUsed)} / ${formatBytes(memoryUsage.heapTotal)}`);
    console.log(`  Platform: ${process.platform}`);
    console.log(`  Node.js: ${process.version}`);
}

module.exports = {
    colors,
    // mainBanner, // <-- Removed
    compactBanner,
    gardenBanner, // <-- Added your new banner
    showSpinner,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showSection,
    showProviderStatus,
    showEndpoint,
    clear,
    // printMainBanner, // <-- Removed
    printCompactBanner,
    printGardenBanner, // <-- Added this new function
    typeWriter,
    showVersion,
    createBox,
    createProgressBar,
    formatBytes,
    showSystemInfo
};