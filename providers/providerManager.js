const fs = require('fs');
const path = require('path');
const BaseAIProvider = require('./baseProvider');
const GeminiProvider = require('./geminiProvider');
const OpenAIProvider = require('./openaiProvider');
const AnthropicProvider = require('./anthropicProvider');
const DeepSeekProvider = require('./deepseekProvider');

/**
 * AI Provider Manager - Handles multiple AI providers
 */
class ProviderManager {
    constructor(config = {}) {
        this.providers = new Map();
        // Read default provider from environment variable or config
        this.defaultProvider = process.env.DEFAULT_PROVIDER || config.defaultProvider || 'gemini';
        this.currentProvider = config.currentProvider || this.defaultProvider;
        this.config = config;
        this.initialized = false;
        
        console.log(`Default provider set to: ${this.defaultProvider}`);
    }

    /**
     * Initialize all available providers
     */
    async initialize(config = {}) {
        if (this.initialized) {
            return;
        }

        console.log('Initializing AI Providers...');
        
        // Load all providers
        await this.loadProviders(config);
        
        // Validate current provider
        if (!this.hasProvider(this.currentProvider)) {
            console.warn(`Current provider '${this.currentProvider}' not available, falling back to '${this.defaultProvider}'`);
            this.currentProvider = this.defaultProvider;
        }

        this.initialized = true;
        console.log(`ProviderManager initialized with ${this.providers.size} providers`);
    }

    /**
     * Load all available providers
     */
    async loadProviders(config = {}) {
        // Load Gemini Provider
        try {
            const geminiConfig = {
                apiKey: process.env.GEMINI_API_KEY,
                ...(config.gemini || {})
            };
            const geminiProvider = new GeminiProvider(geminiConfig);
            await geminiProvider.initialize(geminiConfig);
            this.providers.set('gemini', geminiProvider);
            console.log('✓ Gemini provider loaded');
        } catch (error) {
            console.warn('⚠ Gemini provider failed to load:', error.message);
        }

        // Load OpenAI Provider
        try {
            const openaiConfig = {
                apiKey: process.env.OPENAI_API_KEY,
                ...(config.openai || {})
            };
            const openaiProvider = new OpenAIProvider(openaiConfig);
            await openaiProvider.initialize(openaiConfig);
            this.providers.set('openai', openaiProvider);
            console.log('✓ OpenAI provider loaded');
        } catch (error) {
            console.warn('⚠ OpenAI provider failed to load:', error.message);
        }

        // Load Anthropic Provider
        try {
            const anthropicConfig = {
                apiKey: process.env.ANTHROPIC_API_KEY,
                ...(config.anthropic || {})
            };
            const anthropicProvider = new AnthropicProvider(anthropicConfig);
            await anthropicProvider.initialize(anthropicConfig);
            this.providers.set('anthropic', anthropicProvider);
            console.log('✓ Anthropic provider loaded');
        } catch (error) {
            console.warn('⚠ Anthropic provider failed to load:', error.message);
        }

        // Load DeepSeek Provider
        try {
            const deepseekConfig = {
                apiKey: process.env.DEEPSEEK_API_KEY,
                ...(config.deepseek || {})
            };
            const deepseekProvider = new DeepSeekProvider(deepseekConfig);
            await deepseekProvider.initialize(deepseekConfig);
            this.providers.set('deepseek', deepseekProvider);
            console.log('✓ DeepSeek provider loaded');
        } catch (error) {
            console.warn('⚠ DeepSeek provider failed to load:', error.message);
        }
    }

    /**
     * Check if a provider is available and configured
     * @param {string} providerName - Name of the provider
     * @returns {boolean}
     */
    hasProvider(providerName) {
        const provider = this.providers.get(providerName);
        return provider && provider.isConfigured();
    }

    /**
     * Get current provider
     * @returns {BaseAIProvider|null}
     */
    getCurrentProvider() {
        if (!this.initialized) {
            throw new Error('ProviderManager not initialized. Call initialize() first.');
        }

        const provider = this.providers.get(this.currentProvider);
        if (!provider) {
            throw new Error(`Provider '${this.currentProvider}' not found or not configured`);
        }

        return provider;
    }

    /**
     * Get provider by name
     * @param {string} providerName - Name of the provider
     * @returns {BaseAIProvider|null}
     */
    getProvider(providerName) {
        if (!this.initialized) {
            throw new Error('ProviderManager not initialized. Call initialize() first.');
        }

        return this.providers.get(providerName) || null;
    }

    /**
     * List all available providers
     * @returns {Array} - Array of provider info
     */
    listProviders() {
        const providers = [];
        
        for (const [name, provider] of this.providers) {
            providers.push({
                name: name,
                description: provider.description,
                configured: provider.isConfigured(),
                available: true
            });
        }

        // Add unavailable providers
        const allProviderNames = ['gemini', 'openai', 'anthropic', 'deepseek'];
        for (const name of allProviderNames) {
            if (!providers.find(p => p.name === name)) {
                providers.push({
                    name: name,
                    description: `${name.charAt(0).toUpperCase() + name.slice(1)} Provider`,
                    configured: false,
                    available: false
                });
            }
        }

        return providers;
    }

    /**
     * Switch to a different provider
     * @param {string} providerName - Name of the provider to switch to
     */
    switchProvider(providerName) {
        if (!this.hasProvider(providerName)) {
            throw new Error(`Provider '${providerName}' is not available or not configured`);
        }

        this.currentProvider = providerName;
        console.log(`Switched to ${providerName} provider`);
    }

    /**
     * Generate questions using current provider
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Generated questions
     */
    async generateQuestions(text, options = {}) {
        try {
            const provider = this.getCurrentProvider();
            
            // Add provider information to options
            const enrichedOptions = {
                ...options,
                provider: this.currentProvider
            };

            console.log(`Generating questions using ${this.currentProvider} provider...`);
            const result = await provider.generateQuestions(text, enrichedOptions);
            
            // Add provider metadata to response
            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    provider: this.currentProvider,
                    providerName: provider.name,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error(`Error generating questions with ${this.currentProvider}:`, error.message);
            throw error;
        }
    }

    /**
     * Test all available providers
     * @returns {Promise<Object>} - Test results for all providers
     */
    async testAllProviders() {
        const results = {};
        const availableProviders = this.listProviders().filter(p => p.available);

        console.log('Testing all available providers...');

        for (const providerInfo of availableProviders) {
            try {
                const provider = this.getProvider(providerInfo.name);
                console.log(`Testing ${providerInfo.name}...`);
                
                const result = await provider.testConnection();
                results[providerInfo.name] = result;
                
                if (result.success) {
                    console.log(`✓ ${providerInfo.name} test successful`);
                } else {
                    console.warn(`⚠ ${providerInfo.name} test failed: ${result.message}`);
                }
            } catch (error) {
                console.error(`✗ ${providerInfo.name} test failed:`, error.message);
                results[providerInfo.name] = {
                    success: false,
                    message: `Test failed: ${error.message}`,
                    provider: providerInfo.name,
                    error: error.message
                };
            }
        }

        return results;
    }

    /**
     * Get configuration schema for all providers
     * @returns {Object} - Combined configuration schema
     */
    getConfigSchema() {
        const schema = {
            type: 'object',
            properties: {
                defaultProvider: {
                    type: 'string',
                    description: 'Default AI provider to use',
                    enum: Array.from(this.providers.keys()),
                    default: this.defaultProvider
                },
                currentProvider: {
                    type: 'string',
                    description: 'Current active provider',
                    enum: Array.from(this.providers.keys()),
                    default: this.currentProvider
                }
            }
        };

        // Add provider-specific configurations
        for (const [name, provider] of this.providers) {
            if (provider.getConfigSchema) {
                schema.properties[name] = provider.getConfigSchema();
            }
        }

        return schema;
    }

    /**
     * Validate provider configuration
     * @param {string} providerName - Provider name to validate
     * @returns {Object} - Validation result
     */
    validateProviderConfig(providerName) {
        const provider = this.getProvider(providerName);
        if (!provider) {
            return {
                valid: false,
                message: `Provider '${providerName}' not found`
            };
        }

        try {
            provider.validateConfig();
            return {
                valid: true,
                message: `Provider '${providerName}' configuration is valid`
            };
        } catch (error) {
            return {
                valid: false,
                message: `Provider '${providerName}' configuration error: ${error.message}`
            };
        }
    }

    /**
     * Get provider status
     * @returns {Object} - Status information for all providers
     */
    getStatus() {
        const status = {
            initialized: this.initialized,
            currentProvider: this.currentProvider,
            defaultProvider: this.defaultProvider,
            providers: {}
        };

        for (const [name, provider] of this.providers) {
            status.providers[name] = {
                name: provider.name,
                description: provider.description,
                configured: provider.isConfigured(),
                available: true
            };
        }

        return status;
    }

    /**
     * Save configuration to file
     * @param {string} configPath - Path to save configuration
     */
    saveConfig(configPath) {
        const config = {
            defaultProvider: this.defaultProvider,
            currentProvider: this.currentProvider,
            providers: {}
        };

        // Save provider configurations (without sensitive data)
        for (const [name, provider] of this.providers) {
            config.providers[name] = {
                model: provider.config.model,
                // Don't save API keys to file for security
                temperature: provider.config.temperature,
                maxRetries: provider.config.maxRetries
            };
        }

        try {
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log(`Configuration saved to ${configPath}`);
        } catch (error) {
            console.error('Failed to save configuration:', error.message);
        }
    }

    /**
     * Load configuration from file
     * @param {string} configPath - Path to load configuration from
     */
    loadConfig(configPath) {
        try {
            if (!fs.existsSync(configPath)) {
                console.warn(`Configuration file not found: ${configPath}`);
                return;
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            if (config.defaultProvider) {
                this.defaultProvider = config.defaultProvider;
            }

            if (config.currentProvider) {
                this.currentProvider = config.currentProvider;
            }

            console.log(`Configuration loaded from ${configPath}`);
        } catch (error) {
            console.error('Failed to load configuration:', error.message);
        }
    }
}

module.exports = ProviderManager;