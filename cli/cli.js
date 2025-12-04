#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
// Get the package root directory
const packageRoot = path.join(__dirname, '..');
const ProviderManager = require(path.join(packageRoot, 'providers', 'providerManager'));
const TextExtractor = require(path.join(packageRoot, 'services', 'textExtractor'));
const ConfigManager = require(path.join(packageRoot, 'cli', 'config'));
const { ensureUploadsDirectory, cleanupFiles } = require(path.join(packageRoot, 'utils', 'fileUtils'));
const cliUI = require(path.join(packageRoot, 'cli', 'ascii'));

/**
 * Main CLI for NLP Question Generator
 */
class NLPQGCLI {
    constructor() {
        this.providerManager = null;
        this.textExtractor = null;
        this.config = null;
        this.commands = {
            'config': this.configCommand,
            'generate': this.generateCommand,
            'generate-from-files': this.generateFromFilesCommand,
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

        // Initialize provider manager
        this.providerManager = new ProviderManager();
        await this.providerManager.initialize();

        // Initialize text extractor functions (it's a module, not a class)
        this.textExtractor = TextExtractor;

        // Load configuration
        this.config = this.loadCLIConfig();

        // Ensure uploads directory exists
        await ensureUploadsDirectory(path.join(packageRoot, 'uploads'));

        cliUI.showSuccess('CLI initialized successfully');
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
                gemini: { model: 'gemini-1.5-flash' },
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

        if (!handler) {
            console.error(`❌ Unknown command: ${command}`);
            console.log('Use "nlp-qg help" to see available commands\n');
            process.exit(1);
        }

        try {
            await handler.call(this, args.slice(1));
        } catch (error) {
            console.error('❌ Command failed:', error.message);
            if (error.stack && process.env.DEBUG) {
                console.error(error.stack);
            }
            process.exit(1);
        }
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
  generate-from-files <files...>  Generate questions from files
  test                            Test all provider connections
  providers                       List available providers
  help, -h, --help               Show this help message

EXAMPLES:
  # Generate questions from text
  nlp-qg "Machine learning is a subset of artificial intelligence"
  
  # Generate questions from files
  nlp-qg generate-from-files document.pdf text.txt
  
  # Open configuration
  nlp-qg config
  
  # Test provider connections
  nlp-qg test
  
  # List providers
  nlp-qg providers

ENVIRONMENT VARIABLES:
  GEMINI_API_KEY                  Google Gemini API key
  OPENAI_API_KEY                  OpenAI API key
  ANTHROPIC_API_KEY               Anthropic API key

CONFIGURATION:
  Configuration is stored in .nlp-qg/config.json
  Run "nlp-qg config" to configure the CLI

For more information: https://github.com/your-repo/nlp-question-generator
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

        const text = args.join(' ');
        const options = this.parseOptions(args);

        console.log('Generating questions...\n');

        try {
            const result = await this.providerManager.generateQuestions(text, options);
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
        if (args.length === 0) {
            console.error('❌ File arguments are required');
            console.log('Usage: nlp-qg generate-from-files <file1> [file2] ...');
            process.exit(1);
        }

        const filePaths = args.filter(arg => !arg.startsWith('--'));
        const options = this.parseOptions(args);

        console.log('Processing files...\n');

        // Validate files
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
            // Extract text from files
            const extractedText = await this.textExtractor.processFiles(validFiles);

            if (!extractedText.trim()) {
                console.error('❌ No text could be extracted from the files');
                process.exit(1);
            }

            console.log(`Extracted text length: ${extractedText.length} characters`);
            console.log('Generating questions...\n');

            // Generate questions
            const result = await this.providerManager.generateQuestions(extractedText, options);
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
            if (!this.providerManager.hasProvider(providerName)) {
                console.error(`❌ Provider '${providerName}' is not available or not configured`);
                process.exit(1);
            }

            console.log(`Testing ${providerName} provider...`);
            try {
                const provider = this.providerManager.getProvider(providerName);
                const result = await provider.testConnection();
                this.displayTestResult(result);
            } catch (error) {
                console.error(`❌ ${providerName} test failed:`, error.message);
                process.exit(1);
            }
        } else {
            // Test all providers
            const results = await this.providerManager.testAllProviders();
            this.displayAllTestResults(results);
        }
    }

    /**
     * List providers command
     */
    async providersCommand(args) {
        console.log('Available AI Providers:\n');

        const providers = this.providerManager.listProviders();
        const status = this.providerManager.getStatus();

        for (const provider of providers) {
            const config = provider.available ? '✓' : '❌';
            const configured = provider.configured ? '✓ Configured' : '❌ Not configured';
            const current = status.currentProvider === provider.name ? ' (current)' : '';

            console.log(`${config} ${provider.name}${current}`);
            console.log(`   ${provider.description}`);
            console.log(`   Status: ${configured}`);
            if (provider.available && provider.configured) {
                const providerInstance = this.providerManager.getProvider(provider.name);
                const model = providerInstance?.config?.model || 'unknown';
                console.log(`   Model: ${model}`);
            }
            console.log();
        }

        // Show current status
        console.log(`Current Provider: ${status.currentProvider}`);
        console.log(`Default Provider: ${status.defaultProvider}\n`);
    }

    /**
     * Parse command line options
     */
    parseOptions(args) {
        const options = {};

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            if (arg.startsWith('--')) {
                const [key, value] = arg.substring(2).split('=');

                switch (key) {
                    case 'provider':
                        options.provider = value;
                        break;
                    case 'num-questions':
                    case 'numQuestions':
                        options.numQuestions = parseInt(value) || 10;
                        break;
                    case 'model':
                        options.model = value;
                        break;
                    case 'temperature':
                        options.temperature = parseFloat(value);
                        break;
                    case 'output':
                    case 'format':
                        options.format = value;
                        break;
                }
            }
        }

        return options;
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
            console.log(`Timestamp: ${result.metadata.timestamp}`);
        }
    }

    /**
     * Display single test result
     */
    displayTestResult(result) {
        if (result.success) {
            console.log(`✓${result.provider} test successful`);
            console.log(`Message: ${result.message}`);
            console.log(`Model: ${result.model}`);
            console.log(`Test: ${result.testResult}`);
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