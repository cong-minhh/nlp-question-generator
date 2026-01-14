#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
// Get the package root directory
const packageRoot = path.join(__dirname, '..');
// Import MultiProviderQuestionGenerator instead of direct ProviderManager
const { MultiProviderQuestionGenerator } = require(path.join(packageRoot, 'services', 'questionGenerator'));
const ConfigManager = require(path.join(packageRoot, 'cli', 'config'));
const { ensureUploadsDirectory, cleanupFiles } = require(path.join(packageRoot, 'utils', 'fileUtils'));
const cliUI = require(path.join(packageRoot, 'cli', 'ascii'));

/**
 * Main CLI for NLP Question Generator
 */
class NLPQGCLI {
    constructor() {
        this.questionGenerator = null;
        this.config = null;
        this.commands = {
            'config': this.configCommand,
            'generate': this.generateCommand,
            'generate-file': this.generateFromFilesCommand,
            'test': this.testCommand,
            'providers': this.providersCommand,
            'help': this.helpCommand,
            '--help': this.helpCommand,
            '-h': this.helpCommand
        };
    }

    /**
     * Initialize CLI
     */
    async initialize() {
        cliUI.printBanner();
        cliUI.showSection('Initializing CLI');

        // Load configuration first
        this.config = this.loadCLIConfig();

        // Initialize question generator
        this.questionGenerator = new MultiProviderQuestionGenerator(this.config);
        
        try {
            await this.questionGenerator.initialize(this.config);
            cliUI.showSuccess('CLI initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize:', error.message);
            process.exit(1);
        }

        // Ensure uploads directory exists
        await ensureUploadsDirectory(path.join(packageRoot, 'uploads'));
    }

    /**
     * Load CLI configuration
     */
    loadCLIConfig() {
        const configDir = path.join(packageRoot, '.nlp-qg');
        const configFile = path.join(configDir, 'config.json');

        let config = {
            defaultProvider: 'gemini',
            currentProvider: 'gemini',
            providers: {
                gemini: { model: 'gemini-2.5-flash' },
                openai: { model: 'gpt-3.5-turbo' },
                anthropic: { model: 'claude-3-5-sonnet-20241022' }
            }
        };

        try {
            if (fs.existsSync(configFile)) {
                const configData = fs.readFileSync(configFile, 'utf8');
                const loadedConfig = JSON.parse(configData);
                config = { ...config, ...loadedConfig };
            }
        } catch (error) {
            console.warn('⚠ Failed to load config:', error.message);
        }

        return config;
    }

    /**
     * Main entry point
     */
    async run() {
        await this.initialize();

        const args = process.argv.slice(2);
        const command = args[0];

        if (!command || command === 'help' || command === '--help' || command === '-h') {
            await this.showHelp();
            return;
        }

        const handler = this.commands[command];

        if (handler) {
             try {
                await handler.call(this, args.slice(1));
            } catch (error) {
                console.error('❌ Command failed:', error.message);
                if (error.stack && process.env.DEBUG) {
                    console.error(error.stack);
                }
                process.exit(1);
            }
            return;
        }

        console.error(`❌ Unknown command: ${command}`);
        console.log('Use "nlp-qg help" to see available commands\n');
        process.exit(1);
    }

    /**
     * Show help information
     */
    async showHelp() {
        console.log(`
🤖 NLP Question Generator CLI v2.0

USAGE:
  nlp-qg <command> [options] [arguments]

COMMANDS:
  config                          Open configuration menu
  generate <text>                 Generate questions from text
  generate-file <files...>        Generate questions from files (PDF, DOCX, etc.)
  test                            Test all provider connections
  providers                       List available providers
  help, -h, --help                Show this help message

OPTIONS:
  --provider=<name>               Specify AI provider (gemini, openai, anthropic)
  --numQuestions=<n>              Number of questions (default: 10)
  --difficulty=<level>            Difficulty level (easy, medium, hard, mixed)
  --no-cache                      Disable caching
  --parallel                      Force parallel processing for large text
  --debug                         Enable debug output

EXAMPLES:
  # Generate questions from text
  nlp-qg generate "Machine learning is a subset of artificial intelligence"
  
  # Generate from file
  nlp-qg generate-file ./lecture-notes.pdf
  
  # Open configuration
  nlp-qg config
  
  # Test provider connections
  nlp-qg test
`);
    }

    /**
     * Configuration command
     */
    async configCommand(args) {
        console.log('Opening configuration...\n');
        const configManager = new ConfigManager();
        await configManager.init();
    }

    /**
     * Generate questions from text
     */
    async generateCommand(args) {
        if (args.length === 0) {
            console.error('❌ Text argument is required');
            console.log('Usage: nlp-qg generate "your text here"');
            process.exit(1);
        }

        // Separate options from text
        const { options, cleanArgs } = this.parseOptions(args);
        const text = cleanArgs.join(' ');

        if (!text.trim()) {
            console.error('❌ Text argument is required');
             process.exit(1);
        }

        console.log('Generating questions...\n');

        try {
            const result = await this.questionGenerator.generateQuestions(text, options);
            this.displayResults(result);
        } catch (error) {
            console.error('❌ Generation failed:', error.message);
            process.exit(1);
        }
    }
    
    /**
     * Generate questions from files
     */
    async generateFromFilesCommand(args) {
        const { options, cleanArgs: filePaths } = this.parseOptions(args);

        if (filePaths.length === 0) {
            console.error('❌ No files specified');
            console.log('Usage: nlp-qg generate-file document.pdf');
            process.exit(1);
        }

        console.log('Processing files...\n');

        // Validate files existence
        const validFiles = [];
        for (const filePath of filePaths) {
            const fullPath = path.resolve(filePath);
            if (!fs.existsSync(fullPath)) {
                console.error(`❌ File not found: ${filePath}`);
                continue;
            }
            validFiles.push(fullPath);
        }

        if (validFiles.length === 0) {
            console.error('❌ No valid files found');
            process.exit(1);
        }

        try {
            // Use the generator's built-in file handling
            const result = await this.questionGenerator.generateFromFiles(validFiles, options);
            this.displayResults(result);

        } catch (error) {
            console.error('❌ File processing failed:', error.message);
            process.exit(1);
        }
    }

    /**
     * Test provider connections
     */
    async testCommand(args) {
        const providerName = args[0];

        console.log('Testing provider connections...\n');

        if (providerName) {
            // Test specific provider
            if (!this.questionGenerator.providerManager.hasProvider(providerName)) {
                console.error(`❌ Provider '${providerName}' is not available or not configured`);
                process.exit(1);
            }

            console.log(`Testing ${providerName} provider...`);
            try {
                const provider = this.questionGenerator.providerManager.getProvider(providerName);
                const result = await provider.testConnection();
                this.displayTestResult(result);
            } catch (error) {
                console.error(`❌ ${providerName} test failed:`, error.message);
                process.exit(1);
            }
        } else {
            // Test all providers
            const results = await this.questionGenerator.testConnections();
            this.displayAllTestResults(results);
        }
    }

    /**
     * List providers command
     */
    async providersCommand(args) {
        console.log('Available AI Providers:\n');

        const providers = this.questionGenerator.listProviders();
        const status = this.questionGenerator.getStatus();

        for (const provider of providers) {
            const config = provider.available ? '✓' : '❌';
            const configured = provider.configured ? '✓ Configured' : '❌ Not configured';
            const current = status.currentProvider === provider.name ? ' (current)' : '';

            console.log(`${config} ${provider.name}${current}`);
            console.log(`   ${provider.description}`);
            console.log(`   Status: ${configured}`);
            if (provider.available && provider.configured) {
                 // Accessing model config via providerManager
                 const providerInstance = this.questionGenerator.providerManager.getProvider(provider.name);
                 const model = providerInstance?.config?.model || 'unknown';
                console.log(`   Model: ${model}`);
            }
            console.log();
        }

        // Show current status
        console.log(`Current Provider: ${status.currentProvider}`);
    }

    /**
     * Parse command line options
     */
    parseOptions(args) {
        const options = {};
        const cleanArgs = [];

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            if (arg.startsWith('--')) {
                const [key, value] = arg.substring(2).split('=');

                switch (key) {
                    case 'provider':
                        options.provider = value;
                        break;
                    case 'numQuestions':
                        options.numQuestions = parseInt(value) || 10;
                        break;
                    case 'model':
                        options.model = value;
                        break;
                    case 'temperature':
                        options.temperature = parseFloat(value);
                        break;
                    case 'difficulty':
                        options.difficulty = value;
                        break;
                    case 'output':
                    case 'format':
                        options.format = value;
                        break;
                    case 'no-cache':
                        options.noCache = true;
                        break;
                    case 'parallel':
                        options.parallel = true;
                        break;
                }
            } else {
                cleanArgs.push(arg);
            }
        }

        return { options, cleanArgs };
    }

    /**
     * Display generation results
     */
    displayResults(result) {
        if (result.questions && result.questions.length > 0) {
            console.log(`Generated ${result.questions.length} questions using ${result.metadata?.provider || 'unknown'} provider\n`);

            // Group questions by difficulty
            const grouped = {
                easy: result.questions.filter(q => q.difficulty === 'easy'),
                medium: result.questions.filter(q => q.difficulty === 'medium'),
                hard: result.questions.filter(q => q.difficulty === 'hard')
            };

            for (const [difficulty, questions] of Object.entries(grouped)) {
                if (questions.length > 0) {
                    console.log(`${difficulty.toUpperCase()} (${questions.length} questions):`);
                    console.log('─'.repeat(50));

                    questions.forEach((question, index) => {
                        console.log(`${index + 1}. ${question.questiontext}`);
                        console.log(`   A) ${question.optiona}`);
                        console.log(`   B) ${question.optionb}`);
                        console.log(`   C) ${question.optionc}`);
                        console.log(`   D) ${question.optiond}`);
                        console.log(`   ✓ Correct: ${question.correctanswer}`);
                        console.log();
                    });
                }
            }
        } else {
            console.log('❌ No questions generated');
        }

        // Show metadata
        if (result.metadata) {
            console.log('─'.repeat(50));
            console.log(`Generated with: ${result.metadata.provider}`);
             if (result.metadata.model) {
                 console.log(`Model: ${result.metadata.model}`);
             }
             if (result.metadata.cacheHit) {
                 console.log(`Source: Cache (Save: ${result.metadata.timeSaved || '0ms'})`);
             }
             if (result.metadata.files) {
                 console.log(`Files Processed: ${result.metadata.files.length}`);
             }
        }
    }

    /**
     * Display single test result
     */
    displayTestResult(result) {
        if (result.success) {
            console.log(`✓ ${result.provider} test successful`);
            console.log(`Message: ${result.message}`);
            console.log(`Model: ${result.model}`);
            if (result.testResult) {
                 console.log(`Test: ${result.testResult}`);
            }
        } else {
            console.log(`❌ ${result.provider} test failed`);
            console.log(`Message: ${result.message}`);
            if (result.error) {
                console.log(`Error: ${result.error}`);
            }
        }
    }

    /**
     * Display all test results
     */
    displayAllTestResults(results) {
        console.log('Provider Test Results:\n');

        for (const [providerName, result] of Object.entries(results)) {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${providerName}: ${result.message}`);

            if (result.success && result.testResult) {
                console.log(`Test: ${result.testResult}`);
            }
        }

        const successful = Object.values(results).filter(r => r.success).length;
        const total = Object.keys(results).length;

        console.log(`\nSummary: ${successful}/${total} providers working`);

        if (successful === 0) {
            console.log('\nTips:');
            console.log('   • Configure API keys with: nlp-qg config');
            console.log('   • Set environment variables: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY');
        }
    }
}

// Run CLI if called directly
if (require.main === module) {
    const cli = new NLPQGCLI();
    cli.run().catch(error => {
        console.error('CLI failed:', error);
        process.exit(1);
    });
}

module.exports = NLPQGCLI;