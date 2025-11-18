const ProviderManager = require('../providers/providerManager');

/**
 * Multi-Provider Question Generation Service
 * Supports multiple AI providers through a unified interface
 */
class MultiProviderQuestionGenerator {
    constructor(config = {}) {
        this.providerManager = new ProviderManager(config);
        this.initialized = false;
    }

    /**
     * Initialize the provider manager
     */
    async initialize(config = {}) {
        if (this.initialized) {
            return;
        }

        try {
            await this.providerManager.initialize(config);
            this.initialized = true;
            console.log('✓ Multi-provider question generator initialized');
        } catch (error) {
            throw new Error(`Failed to initialize question generator: ${error.message}`);
        }
    }

    /**
     * Generate questions using current provider
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Generated questions
     */
    async generateQuestions(text, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const result = await this.providerManager.generateQuestions(text, options);
            return result;
        } catch (error) {
            console.error('Question generation failed:', error.message);
            throw error;
        }
    }

    /**
     * Switch to a different AI provider
     * @param {string} providerName - Name of the provider to switch to
     */
    switchProvider(providerName) {
        if (!this.initialized) {
            throw new Error('Provider manager not initialized. Call initialize() first.');
        }

        try {
            this.providerManager.switchProvider(providerName);
            console.log(`✓ Switched to ${providerName} provider`);
        } catch (error) {
            throw new Error(`Failed to switch provider: ${error.message}`);
        }
    }

    /**
     * Get current provider information
     * @returns {Object} - Current provider details
     */
    getCurrentProvider() {
        if (!this.initialized) {
            throw new Error('Provider manager not initialized. Call initialize() first.');
        }

        const provider = this.providerManager.getCurrentProvider();
        return {
            name: provider.name,
            description: provider.description,
            configured: provider.isConfigured(),
            model: provider.config.model
        };
    }

    /**
     * List all available providers
     * @returns {Array} - Array of provider information
     */
    listProviders() {
        if (!this.initialized) {
            throw new Error('Provider manager not initialized. Call initialize() first.');
        }

        return this.providerManager.listProviders();
    }

    /**
     * Test provider connections
     * @returns {Promise<Object>} - Test results
     */
    async testConnections() {
        if (!this.initialized) {
            await this.initialize();
        }

        return await this.providerManager.testAllProviders();
    }

    /**
     * Get service status
     * @returns {Object} - Service status information
     */
    getStatus() {
        if (!this.initialized) {
            return {
                initialized: false,
                currentProvider: null,
                availableProviders: []
            };
        }

        return {
            initialized: true,
            currentProvider: this.providerManager.currentProvider,
            availableProviders: this.providerManager.listProviders()
                .filter(p => p.available && p.configured)
                .map(p => p.name)
        };
    }

    /**
     * Validate text input for question generation
     * @param {string} text - Input text to validate
     * @returns {Object} - Validation result
     */
    validateInput(text) {
        if (!text || typeof text !== 'string') {
            return { valid: false, error: 'Text input is required and must be a string' };
        }

        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: 'Text input cannot be empty' };
        }

        if (trimmed.length < 50) {
            return { valid: false, error: 'Text input must be at least 50 characters long' };
        }

        if (trimmed.length > 50000) {
            return { valid: false, error: 'Text input is too long (max 50,000 characters)' };
        }

        return { valid: true, text: trimmed };
    }

    /**
     * Generate questions from files
     * @param {Array} filePaths - Array of file paths
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Generated questions
     */
    async generateFromFiles(filePaths, options = {}) {
        const TextExtractor = require('./textExtractor');
        const textExtractor = new TextExtractor();

        try {
            console.log('📄 Extracting text from files...');
            const extractedText = await textExtractor.processFiles(filePaths);
            
            if (!extractedText.trim()) {
                throw new Error('No text could be extracted from the provided files');
            }

            console.log(`📝 Extracted ${extractedText.length} characters of text`);
            
            const validation = this.validateInput(extractedText);
            if (!validation.valid) {
                throw new Error(`Invalid extracted text: ${validation.error}`);
            }

            return await this.generateQuestions(validation.text, options);
        } catch (error) {
            console.error('File processing failed:', error.message);
            throw error;
        }
    }

    /**
     * Batch generate questions from multiple texts
     * @param {Array} texts - Array of input texts
     * @param {Object} options - Generation options
     * @returns {Promise<Array>} - Array of generation results
     */
    async batchGenerate(texts, options = {}) {
        if (!Array.isArray(texts)) {
            throw new Error('Texts must be an array');
        }

        const results = [];
        
        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const validation = this.validateInput(text);
            
            if (!validation.valid) {
                results.push({
                    success: false,
                    error: validation.error,
                    index: i
                });
                continue;
            }

            try {
                const result = await this.generateQuestions(validation.text, options);
                results.push({
                    success: true,
                    result: result,
                    index: i
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    index: i
                });
            }

            // Add delay between requests to avoid rate limiting
            if (i < texts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }
}

// Legacy compatibility wrapper for backward compatibility
class GeminiQuestionGenerator {
    constructor() {
        this.multiProvider = new MultiProviderQuestionGenerator();
        this.currentProvider = 'gemini';
    }

    async initialize() {
        await this.multiProvider.initialize();
        
        // Set to Gemini by default for backward compatibility
        if (this.multiProvider.providerManager.hasProvider('gemini')) {
            this.multiProvider.switchProvider('gemini');
        }
    }

    async generateQuestions(text, numQuestions = 10) {
        const options = { numQuestions };
        const result = await this.multiProvider.generateQuestions(text, options);
        return result;
    }

    async validateResponse(parsedResponse) {
        // Simple validation for backward compatibility
        if (!parsedResponse.questions || !Array.isArray(parsedResponse.questions)) {
            throw new Error('Invalid response structure: missing questions array');
        }
        return parsedResponse;
    }

    async cleanAIResponse(generatedText) {
        let cleanedText = generatedText.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }
        return cleanedText;
    }
}

// Export both classes - default is the legacy wrapper for backward compatibility
module.exports = GeminiQuestionGenerator;
module.exports.MultiProviderQuestionGenerator = MultiProviderQuestionGenerator;
module.exports.GeminiQuestionGenerator = GeminiQuestionGenerator;