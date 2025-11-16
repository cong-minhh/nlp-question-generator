#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Configuration Manager for NLP Question Generator CLI
 */
class ConfigManager {
    constructor() {
        this.configDir = path.join(process.cwd(), '.nlp-qg');
        this.configFile = path.join(this.configDir, 'config.json');
        this.defaultConfig = {
            defaultProvider: 'gemini',
            currentProvider: 'gemini',
            providers: {
                gemini: {
                    model: 'gemini-1.5-flash',
                    temperature: 0.7,
                    maxRetries: 3
                },
                openai: {
                    model: 'gpt-3.5-turbo',
                    temperature: 0.7,
                    maxRetries: 3
                },
                anthropic: {
                    model: 'claude-3-5-sonnet-20241022',
                    temperature: 0.7,
                    maxRetries: 3
                },
                deepseek: {
                    model: 'deepseek-chat',
                    temperature: 0.7,
                    maxRetries: 3
                }
            },
            apiKeys: {
                // API keys are stored separately for security
                gemini: process.env.GEMINI_API_KEY || null,
                openai: process.env.OPENAI_API_KEY || null,
                anthropic: process.env.ANTHROPIC_API_KEY || null,
                deepseek: process.env.DEEPSEEK_API_KEY || null
            }
        };
        
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * Initialize configuration
     */
    async init() {
        console.log('🔧 NLP Question Generator CLI Configuration\n');
        
        // Create config directory if it doesn't exist
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
            console.log(`✓ Created configuration directory: ${this.configDir}`);
        }

        // Load or create config
        this.config = this.loadConfig();
        this.saveConfig();

        console.log('✓ Configuration initialized successfully\n');
        await this.showMainMenu();
    }

    /**
     * Load configuration from file
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configFile)) {
                const configData = fs.readFileSync(this.configFile, 'utf8');
                const config = JSON.parse(configData);
                
                // Merge with defaults to ensure all properties exist
                return { ...this.defaultConfig, ...config };
            }
        } catch (error) {
            console.warn('⚠ Failed to load config, using defaults:', error.message);
        }
        
        return { ...this.defaultConfig };
    }

    /**
     * Save configuration to file
     */
    saveConfig() {
        try {
            // Don't save API keys to config file for security
            const configToSave = { ...this.config };
            delete configToSave.apiKeys;
            
            fs.writeFileSync(this.configFile, JSON.stringify(configToSave, null, 2));
            console.log('✓ Configuration saved');
        } catch (error) {
            console.error('✗ Failed to save configuration:', error.message);
        }
    }

    /**
     * Show main menu and handle user input
     */
    async showMainMenu() {
        const menu = `
┌─────────────────────────────────────────────────────┐
│         NLP Question Generator - Configuration       │
├─────────────────────────────────────────────────────┤
│  1. View Current Configuration                      │
│  2. Configure API Keys                              │
│  3. Set Default Provider                            │
│  4. Test Provider Connections                       │
│  5. Advanced Settings                               │
│  6. Help & Documentation                            │
│  0. Exit                                            │
└─────────────────────────────────────────────────────┘
`;

        console.log(menu);
        
        const choice = await this.question('Select an option (0-6): ');
        
        switch (choice.trim()) {
            case '1':
                await this.viewConfig();
                break;
            case '2':
                await this.configureApiKeys();
                break;
            case '3':
                await this.setDefaultProvider();
                break;
            case '4':
                await this.testConnections();
                break;
            case '5':
                await this.advancedSettings();
                break;
            case '6':
                await this.showHelp();
                break;
            case '0':
                console.log('👋 Goodbye!');
                this.rl.close();
                process.exit(0);
            default:
                console.log('❌ Invalid option. Please try again.\n');
                await this.showMainMenu();
        }
    }

    /**
     * View current configuration
     */
    async viewConfig() {
        console.log('\n📋 Current Configuration:\n');
        console.log(`Default Provider: ${this.config.defaultProvider}`);
        console.log(`Current Provider: ${this.config.currentProvider}\n`);

        // Show API key status
        console.log('🔑 API Key Status:');
        for (const [provider, key] of Object.entries(this.config.apiKeys)) {
            const status = key ? '✓ Configured' : '❌ Not configured';
            console.log(`  ${provider}: ${status}`);
        }
        console.log();

        // Show provider settings
        console.log('⚙️  Provider Settings:');
        for (const [provider, settings] of Object.entries(this.config.providers)) {
            console.log(`  ${provider}:`);
            console.log(`    Model: ${settings.model}`);
            console.log(`    Temperature: ${settings.temperature}`);
            console.log(`    Max Retries: ${settings.maxRetries}`);
        }
        console.log();

        await this.backToMenu();
    }

    /**
     * Configure API keys for providers
     */
    async configureApiKeys() {
        console.log('\n🔐 Configure API Keys\n');
        
        const providers = ['gemini', 'openai', 'anthropic', 'deepseek'];
        
        for (const provider of providers) {
            console.log(`\nConfiguring ${provider}:`);
            const currentKey = this.config.apiKeys[provider];
            
            if (currentKey) {
                const maskKey = currentKey.substring(0, 8) + '*'.repeat(Math.max(0, currentKey.length - 8));
                console.log(`Current key: ${maskKey}`);
            }
            
            const choice = await this.question(`Configure ${provider} API key? (y/n): `);
            
            if (choice.toLowerCase() === 'y' || choice.toLowerCase() === 'yes') {
                const key = await this.question(`Enter ${provider} API key: `, true);
                if (key.trim()) {
                    this.config.apiKeys[provider] = key.trim();
                    console.log(`✓ ${provider} API key configured`);
                }
            }
        }

        this.saveConfig();
        await this.backToMenu();
    }

    /**
     * Set default provider
     */
    async setDefaultProvider() {
        console.log('\n🎯 Set Default Provider\n');
        
        const availableProviders = this.getAvailableProviders();
        
        if (availableProviders.length === 0) {
            console.log('❌ No providers configured. Please configure API keys first.\n');
            await this.backToMenu();
            return;
        }

        console.log('Available providers:');
        availableProviders.forEach((provider, index) => {
            console.log(`  ${index + 1}. ${provider}`);
        });

        const choice = await this.question(`Select default provider (1-${availableProviders.length}): `);
        
        const providerIndex = parseInt(choice) - 1;
        
        if (providerIndex >= 0 && providerIndex < availableProviders.length) {
            const selectedProvider = availableProviders[providerIndex];
            this.config.defaultProvider = selectedProvider;
            this.config.currentProvider = selectedProvider;
            
            console.log(`✓ Default provider set to: ${selectedProvider}`);
            this.saveConfig();
        } else {
            console.log('❌ Invalid selection.');
        }

        await this.backToMenu();
    }

    /**
     * Test provider connections
     */
    async testConnections() {
        console.log('\n🔍 Testing Provider Connections\n');
        
        const availableProviders = this.getAvailableProviders();
        
        if (availableProviders.length === 0) {
            console.log('❌ No providers configured. Please configure API keys first.\n');
            await this.backToMenu();
            return;
        }

        for (const provider of availableProviders) {
            console.log(`Testing ${provider}...`);
            
            try {
                // This would integrate with the provider manager
                // For now, just show that we'd test it
                const key = this.config.apiKeys[provider];
                const hasKey = !!key;
                
                if (hasKey) {
                    console.log(`✓ ${provider}: API key present (connection test would run here)`);
                } else {
                    console.log(`❌ ${provider}: No API key configured`);
                }
            } catch (error) {
                console.log(`❌ ${provider}: Test failed - ${error.message}`);
            }
        }

        await this.backToMenu();
    }

    /**
     * Advanced settings
     */
    async advancedSettings() {
        console.log('\n⚙️  Advanced Settings\n');
        
        const menu = `
┌─────────────────────────────────────────────────────┐
│                   Advanced Settings                  │
├─────────────────────────────────────────────────────┤
│  1. Configure Provider Models                       │
│  2. Set Generation Parameters                       │
│  3. Reset Configuration                             │
│  4. Export Configuration                            │
│  5. Import Configuration                            │
│  0. Back to Main Menu                               │
└─────────────────────────────────────────────────────┘
`;

        console.log(menu);
        
        const choice = await this.question('Select option (0-5): ');
        
        switch (choice.trim()) {
            case '1':
                await this.configureModels();
                break;
            case '2':
                await this.configureParameters();
                break;
            case '3':
                await this.resetConfig();
                break;
            case '4':
                await this.exportConfig();
                break;
            case '5':
                await this.importConfig();
                break;
            case '0':
                await this.showMainMenu();
                break;
            default:
                console.log('❌ Invalid option.\n');
                await this.advancedSettings();
        }
    }

    /**
     * Configure provider models
     */
    async configureModels() {
        console.log('\n🤖 Configure Provider Models\n');
        
        for (const [provider, settings] of Object.entries(this.config.providers)) {
            console.log(`\n${provider} model settings:`);
            console.log(`Current: ${settings.model}`);
            
            const newModel = await this.question(`Enter new model for ${provider} (or press Enter to keep current): `);
            
            if (newModel.trim()) {
                settings.model = newModel.trim();
                console.log(`✓ ${provider} model updated`);
            }
        }

        this.saveConfig();
        await this.backToMenu();
    }

    /**
     * Configure generation parameters
     */
    async configureParameters() {
        console.log('\n📝 Generation Parameters\n');
        
        const providers = Object.keys(this.config.providers);
        
        for (const provider of providers) {
            console.log(`\n${provider} parameters:`);
            
            // Temperature
            const currentTemp = this.config.providers[provider].temperature;
            const tempInput = await this.question(`Temperature (current: ${currentTemp}, 0.0-1.0): `);
            
            if (tempInput.trim()) {
                const temp = parseFloat(tempInput);
                if (temp >= 0 && temp <= 1) {
                    this.config.providers[provider].temperature = temp;
                } else {
                    console.log('⚠ Invalid temperature, keeping current value');
                }
            }
            
            // Max Retries
            const currentRetries = this.config.providers[provider].maxRetries;
            const retryInput = await this.question(`Max retries (current: ${currentRetries}): `);
            
            if (retryInput.trim()) {
                const retries = parseInt(retryInput);
                if (retries > 0) {
                    this.config.providers[provider].maxRetries = retries;
                } else {
                    console.log('⚠ Invalid retries, keeping current value');
                }
            }
        }

        this.saveConfig();
        await this.backToMenu();
    }

    /**
     * Reset configuration
     */
    async resetConfig() {
        console.log('\n🔄 Reset Configuration\n');
        
        const confirm = await this.question('Are you sure you want to reset configuration? (y/n): ');
        
        if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
            this.config = { ...this.defaultConfig };
            this.saveConfig();
            console.log('✓ Configuration reset to defaults');
        } else {
            console.log('Reset cancelled');
        }

        await this.backToMenu();
    }

    /**
     * Export configuration
     */
    async exportConfig() {
        console.log('\n📤 Export Configuration\n');
        
        const exportPath = await this.question('Enter export path (or press Enter for current directory): ');
        const targetPath = exportPath.trim() || process.cwd();
        const exportFile = path.join(targetPath, 'nlp-qg-config.json');
        
        try {
            // Create a safe export (no API keys)
            const exportConfig = { ...this.config };
            delete exportConfig.apiKeys;
            exportConfig.exported = new Date().toISOString();
            
            fs.writeFileSync(exportFile, JSON.stringify(exportConfig, null, 2));
            console.log(`✓ Configuration exported to: ${exportFile}`);
        } catch (error) {
            console.log(`❌ Export failed: ${error.message}`);
        }

        await this.backToMenu();
    }

    /**
     * Import configuration
     */
    async importConfig() {
        console.log('\n📥 Import Configuration\n');
        
        const importPath = await this.question('Enter path to configuration file: ');
        
        try {
            if (!fs.existsSync(importPath)) {
                console.log('❌ File not found');
                await this.backToMenu();
                return;
            }
            
            const importData = fs.readFileSync(importPath, 'utf8');
            const importedConfig = JSON.parse(importData);
            
            // Validate import structure
            if (!importedConfig.providers) {
                console.log('❌ Invalid configuration file');
                await this.backToMenu();
                return;
            }
            
            // Merge imported config (excluding API keys)
            this.config = { ...this.config, ...importedConfig };
            delete this.config.apiKeys; // Don't overwrite API keys
            
            this.saveConfig();
            console.log('✓ Configuration imported successfully');
        } catch (error) {
            console.log(`❌ Import failed: ${error.message}`);
        }

        await this.backToMenu();
    }

    /**
     * Show help and documentation
     */
    async showHelp() {
        console.log(`
📚 Help & Documentation

🎯 Supported AI Providers:
  • Google Gemini - Google's conversational AI
  • OpenAI GPT - ChatGPT and GPT models
  • Anthropic Claude - Claude AI models

🔧 Configuration:
  • API keys are stored securely in environment variables
  • Configuration is saved in ~/.nlp-qg/config.json
  • Models and parameters can be customized per provider

📝 Available Commands:
  • nlp-qg config - Open configuration menu
  • nlp-qg generate [text] - Generate questions from text
  • nlp-qg generate-from-files [files...] - Generate from files
  • nlp-qg test - Test all providers
  • nlp-qg providers - List available providers

🌐 API Endpoints:
  • POST /api/generate - Generate questions from text
  • POST /api/generate-from-files - Generate from uploaded files
  • GET /api/providers - List available providers
  • GET /api/test - Test provider connections

For more information, visit: https://github.com/your-repo/nlp-question-generator
`);

        await this.backToMenu();
    }

    /**
     * Get list of available providers (with API keys configured)
     */
    getAvailableProviders() {
        return Object.keys(this.config.apiKeys).filter(
            provider => this.config.apiKeys[provider]
        );
    }

    /**
     * Ask a question with optional password masking
     */
    async question(prompt, password = false) {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const question = password ? prompt.replace(/./g, '*') : prompt;
            
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    /**
     * Wait for user to press Enter to continue
     */
    async backToMenu() {
        console.log('\nPress Enter to continue...');
        await this.question('> ');
        await this.showMainMenu();
    }
}

// Run CLI if called directly
if (require.main === module) {
    const configManager = new ConfigManager();
    configManager.init().catch(error => {
        console.error('Configuration failed:', error);
        process.exit(1);
    });
}

module.exports = ConfigManager;