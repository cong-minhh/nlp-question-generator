const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const apiRoutes = require('./routes/api');
const { ensureUploadsDirectory } = require('./utils/fileUtils');
const ProviderManager = require('./providers/providerManager');
const cliUI = require('./cli/ascii');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize provider manager
const providerManager = new ProviderManager();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: '10mb' }));

// Make provider manager available to routes
app.locals.providerManager = providerManager;

// API Routes
app.use('/api', apiRoutes);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
ensureUploadsDirectory(uploadsDir).catch(console.error);

// Initialize provider manager
async function initializeServer() {
    try {
        // Check if first-time setup is needed
        const setupNeeded = await checkSetupNeeded();
        if (setupNeeded.shouldSetup) {
            cliUI.printGardenBanner();
            cliUI.showSection('First-Time Setup Required');
            cliUI.showInfo('Configuration files are missing or incomplete.');
            cliUI.showInfo('Would you like to run the setup wizard?');
            
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const answer = await new Promise((resolve) => {
                rl.question('\nRun setup wizard? (Y/n): ', resolve);
            });
            rl.close();
            
            if (!answer || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                const SetupManager = require('./setup');
                const setup = new SetupManager();
                await setup.run();
                console.log('\nSetup complete! Restart the server to continue.\n');
                process.exit(0);
            }
        }

        // Display startup banner
        cliUI.printGardenBanner();
        cliUI.showSection('Initializing Multi-Provider AI System');
        
        await cliUI.showSpinner('Loading AI providers...', 1500);
        await providerManager.initialize();
        cliUI.showSuccess('Multi-Provider AI System initialized');
        
        // Show available providers
        cliUI.showSection('Available AI Providers');
        const providers = providerManager.listProviders();
        providers.forEach(provider => {
            const status = provider.available && provider.configured ? 'configured' : 'not configured';
            cliUI.showProviderStatus(provider.name, status, provider.description);
        });
        
        // Show API endpoints
        cliUI.showSection('API Endpoints');
        cliUI.showEndpoint('GET', `http://localhost:${PORT}/api`, 'Main API endpoint');
        cliUI.showEndpoint('GET', `http://localhost:${PORT}/api/health`, 'Health check');
        cliUI.showEndpoint('GET', `http://localhost:${PORT}/api/providers`, 'List all providers');
        cliUI.showEndpoint('GET', `http://localhost:${PORT}/api/current-provider`, 'Current provider info');
        cliUI.showEndpoint('POST', `http://localhost:${PORT}/api/generate`, 'Generate questions from text');
        cliUI.showEndpoint('POST', `http://localhost:${PORT}/api/generate-from-files`, 'Generate from uploaded files');
        cliUI.showEndpoint('POST', `http://localhost:${PORT}/api/switch-provider`, 'Switch between AI providers');
        
        // Show supported file formats
        cliUI.showSection('Supported File Formats');
        console.log('   PDF, DOC, DOCX, PPT, PPTX, TXT');
        
        // Start server
        app.listen(PORT, () => {
            console.log(`\n${cliUI.colors.green}Server is ready!${cliUI.colors.reset}`);
            console.log(`${cliUI.colors.cyan}NLP Question Generator running on port ${PORT}${cliUI.colors.reset}`);
            console.log(`${cliUI.colors.gray}Use 'npm run setup' for first-time configuration${cliUI.colors.reset}`);
            console.log(`${cliUI.colors.gray}Use 'npm run config' for API key configuration${cliUI.colors.reset}`);
            cliUI.showSystemInfo();
        });
    } catch (error) {
        cliUI.printGardenBanner();
        cliUI.showSection('Initialization Error');
        cliUI.showError(`Failed to initialize server: ${error.message}`);
        cliUI.showInfo('Make sure all dependencies are installed and configuration is correct');
        process.exit(1);
    }
}

/**
 * Check if setup is needed
 */
async function checkSetupNeeded() {
    const fs = require('fs');
    const envFile = path.join(__dirname, '.env');
    
    // Check if .env exists
    const envExists = fs.existsSync(envFile);
    
    if (!envExists) {
        return {
            shouldSetup: true,
            reason: 'Missing .env file'
        };
    }
    
    // Check if .env has at least one valid API key (not empty)
    let hasApiKeys = false;
    try {
        const envContent = fs.readFileSync(envFile, 'utf8');
        const apiKeys = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY'];
        
        hasApiKeys = apiKeys.some(key => {
            // Match pattern: KEY=value (where value is not empty and not just whitespace)
            const regex = new RegExp(`^${key}=(.+)$`, 'm');
            const match = envContent.match(regex);
            return match && match[1].trim().length > 0;
        });
    } catch (error) {
        console.warn('Could not read .env file:', error.message);
        return {
            shouldSetup: true,
            reason: 'Error reading .env file'
        };
    }
    
    return {
        shouldSetup: !hasApiKeys,
        reason: hasApiKeys ? 'Configuration complete' : 'No API keys configured'
    };
}

// Start initialization
initializeServer();

module.exports = app;