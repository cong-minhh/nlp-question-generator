const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const { apiReference } = require('@scalar/express-api-reference');
const apiRoutes = require('./routes/api');
const { ensureUploadsDirectory } = require('./utils/fileUtils');
const ProviderManager = require('./providers/providerManager');
const ErrorHandler = require('./utils/errorHandler');
const cliUI = require('./cli/ascii');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: '10mb' }));

// API Routes
app.use('/api', apiRoutes);

// Serve static files for streaming test page
app.use('/public', express.static(path.join(__dirname, 'public')));

// Scalar API Documentation
app.use(
    '/docs',
    apiReference({
        spec: {
            url: '/openapi.json',
        },
        theme: 'purple',
        layout: 'modern',
        darkMode: true,
    })
);

// Serve OpenAPI spec
app.get('/openapi.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'openapi.json'));
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
ensureUploadsDirectory(uploadsDir).catch(console.error);

// Initialize provider manager
async function initializeServer() {
    try {
        // Check if first-time setup is needed
        const setupNeeded = await checkSetupNeeded();
        if (setupNeeded.shouldSetup) {
            cliUI.printBanner();
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
        cliUI.printBanner();
        // cliUI.showSection('Initializing Multi-Provider AI System');

        // Initialize provider manager
        const providerManager = new ProviderManager();
        app.locals.providerManager = providerManager;

        await cliUI.showSpinner('Loading AI providers...', 1500);
        await providerManager.initialize();
        cliUI.showSuccess('Multi-Provider AI System initialized');

        // Initialize question generator with caching (reuse existing providerManager)
        const { MultiProviderQuestionGenerator } = require('./services/questionGenerator');
        // Create question generator WITHOUT passing providerManager - we'll set it manually
        const questionGenerator = new MultiProviderQuestionGenerator({});
        // Manually override the providerManager BEFORE initializing
        questionGenerator.providerManager = app.locals.providerManager;
        await questionGenerator.initialize();
        app.locals.questionGenerator = questionGenerator;
        cliUI.showSuccess('Question generator with caching initialized');

        // Initialize job store
        const JobStore = require('./storage/jobStore');
        const jobStore = new JobStore({
            enabled: process.env.QUEUE_ENABLED !== 'false'
        });
        await jobStore.initialize();

        // Initialize job queue with store
        const JobQueue = require('./utils/jobQueue');
        const jobQueue = new JobQueue({
            enabled: process.env.QUEUE_ENABLED !== 'false',
            maxConcurrent: parseInt(process.env.QUEUE_WORKERS) || 3,
            jobStore: jobStore
        });

        // Restore pending jobs from database
        await jobQueue.restore();

        // Initialize job processor
        const JobProcessor = require('./utils/jobProcessor');
        const jobProcessor = new JobProcessor(jobQueue, questionGenerator);
        jobProcessor.start();

        app.locals.jobQueue = jobQueue;
        app.locals.jobStore = jobStore;
        app.locals.jobProcessor = jobProcessor;

        if (jobQueue.enabled) {
            cliUI.showSuccess(`Job queue initialized (${jobQueue.maxConcurrent} workers)`);
        }

        // Add job routes after initialization
        // Streaming routes are disabled (commented out in routes/streamRoutes.js)
        // const streamRoutes = require('./routes/streamRoutes');
        // app.use('/api/stream', streamRoutes);

        const jobRoutes = require('./routes/jobRoutes');
        app.use('/api/jobs', jobRoutes);

        // Show available providers
        cliUI.showSection('Available AI Providers');
        const providers = providerManager.listProviders();
        providers.forEach(provider => {
            const status = provider.available && provider.configured ? 'configured' : 'not configured';
            cliUI.showProviderStatus(provider.name, status, provider.description);
        });

        // Show API endpoints
        // cliUI.showSection('API Endpoints');
        // cliUI.showEndpoint('GET', `http://localhost:${PORT}/api`, 'Main API endpoint');
        // cliUI.showEndpoint('GET', `http://localhost:${PORT}/api/health`, 'Health check');
        // cliUI.showEndpoint('GET', `http://localhost:${PORT}/api/providers`, 'List all providers');
        // cliUI.showEndpoint('GET', `http://localhost:${PORT}/api/current-provider`, 'Current provider info');
        // cliUI.showEndpoint('POST', `http://localhost:${PORT}/api/generate`, 'Generate questions from text');
        // cliUI.showEndpoint('POST', `http://localhost:${PORT}/api/generate-from-files`, 'Generate from uploaded files');
        // cliUI.showEndpoint('POST', `http://localhost:${PORT}/api/switch-provider`, 'Switch between AI providers');

        // Show supported file formats
        // cliUI.showSection('Supported File Formats');
        // console.log('   PDF, DOC, DOCX, PPT, PPTX, TXT');

        // Global error handler (must be last middleware)
        app.use(ErrorHandler.expressErrorHandler);

        // Start server
        app.listen(PORT, () => {
            console.log(`\n${cliUI.colors.green}Server is ready!${cliUI.colors.reset}`);
            console.log(`${cliUI.colors.cyan}NLP Question Generator running on port ${PORT}${cliUI.colors.reset}`);

            // Show security status
            const apiMode = process.env.API_MODE || 'public';
            const hasApiKey = process.env.SERVER_API_KEY && process.env.SERVER_API_KEY.trim() !== '';

            if (apiMode === 'private' && hasApiKey) {
                console.log(`\n${cliUI.colors.green}Security: PRIVATE MODE (API key required)${cliUI.colors.reset}`);
            } else if (apiMode === 'private' && !hasApiKey) {
                console.log(`\n${cliUI.colors.yellow}Security: PRIVATE MODE but no API key set!${cliUI.colors.reset}`);
                console.log(`${cliUI.colors.gray}   Run 'npm run generate-key' to create an API key${cliUI.colors.reset}`);
            } else {
                console.log(`\n${cliUI.colors.yellow}Security: PUBLIC MODE (no authentication)${cliUI.colors.reset}`);
                console.log(`${cliUI.colors.gray}Set API_MODE=private in .env for production${cliUI.colors.reset}`);
            }

            console.log(`\n${cliUI.colors.yellow}API Documentation: ${cliUI.colors.cyan}http://localhost:${PORT}/docs${cliUI.colors.reset}`);
            console.log(`${cliUI.colors.gray}Use 'npm run setup' for first-time configuration${cliUI.colors.reset}`);
            console.log(`${cliUI.colors.gray}Use 'npm run config' for API key configuration${cliUI.colors.reset}`);
            cliUI.showSystemInfo();
        });
    } catch (error) {
        cliUI.printBanner();
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
        const apiKeys = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'KIMI_API_KEY', 'KIMICN_API_KEY'];

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

// Only start server if this file is run directly (not required as a module)
if (require.main === module) {
    initializeServer();
}

module.exports = app;