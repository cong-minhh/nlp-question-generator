const { GoogleGenerativeAI } = require('@google/generative-ai');
const BaseAIProvider = require('./baseProvider');

/**
 * Gemini AI Provider Implementation
 */
class GeminiProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'gemini';
        this.description = 'Google Gemini AI Provider';
        // Models in order of preference (fallback order)
        // Note: Free tier API keys typically only have access to gemini-2.5-flash
        this.supportedModels = [
            'gemini-2.5-flash',      // Latest, free tier compatible
            'models/gemini-2.5-flash', // Alternative path
            'gemini-1.5-flash',      // Older version (may require paid tier)
            'gemini-1.5-pro',        // Pro version (may require paid tier)
            'gemini-pro'             // Legacy (may require paid tier)
        ];
        this.maxRetries = 3;
        this.baseDelay = 2000;
        this.currentModelIndex = 0; // Track which model we're using
    }

    /**
     * Validate Gemini configuration
     */
    validateConfig() {
        if (!this.config.apiKey) {
            throw new Error('Gemini API key is required. Set GEMINI_API_KEY environment variable or configure in settings.');
        }
        if (this.config.model && !this.supportedModels.includes(this.config.model)) {
            throw new Error(`Unsupported Gemini model: ${this.config.model}. Supported models: ${this.supportedModels.join(', ')}`);
        }
    }

    /**
     * Initialize Gemini client with automatic model fallback
     */
    async initialize(config = {}) {
        await super.initialize(config);
        this.genAI = new GoogleGenerativeAI(this.config.apiKey);
        
        // Try to initialize with the preferred model
        const preferredModel = this.config.model || this.supportedModels[0];
        await this.initializeModel(preferredModel);
    }

    /**
     * Initialize a specific model with fallback support
     * @param {string} modelName - Model to initialize
     */
    async initializeModel(modelName) {
        try {
            this.model = this.genAI.getGenerativeModel({ model: modelName });
            this.currentModel = modelName;
            console.log(`✓ Initialized Gemini with model: ${modelName}`);
        } catch (error) {
            console.warn(`⚠ Failed to initialize model ${modelName}: ${error.message}`);
            // Will fallback during generation if needed
            this.model = this.genAI.getGenerativeModel({ model: modelName });
            this.currentModel = modelName;
        }
    }

    /**
     * Try next available model in fallback list
     * @returns {boolean} - True if fallback successful
     */
    async tryFallbackModel() {
        this.currentModelIndex++;
        
        if (this.currentModelIndex >= this.supportedModels.length) {
            console.error('⚠ All fallback models exhausted');
            return false;
        }

        const fallbackModel = this.supportedModels[this.currentModelIndex];
        console.log(`Falling back to model: ${fallbackModel}`);
        
        try {
            await this.initializeModel(fallbackModel);
            return true;
        } catch (error) {
            console.warn(`⚠ Fallback to ${fallbackModel} failed: ${error.message}`);
            return await this.tryFallbackModel(); // Try next model
        }
    }

    /**
     * Check if Gemini provider is configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(this.config.apiKey);
    }

    /**
     * Generate questions using Gemini AI with automatic model fallback
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Standardized questions
     */
    async generateQuestions(text, options = {}) {
        const numQuestions = options.numQuestions || 10;
        
        // Ensure difficulty is always set to 'mixed' by default
        const promptOptions = {
            numQuestions,
            bloomLevel: options.bloomLevel || 'apply',
            difficulty: options.difficulty || 'mixed'
        };

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Handle multimodal input
                let promptParts = [];
                let inputText = text;

                // Check if input is multimodal object { text, images }
                if (typeof text === 'object' && text.text) {
                    inputText = text.text;
                    
                    // Add text first
                    const systemPrompt = this.buildPrompt(inputText, promptOptions);
                    promptParts.push(systemPrompt);
                    
                    // Add images if present
                    if (text.images && Array.isArray(text.images)) {
                        text.images.forEach(img => {
                            promptParts.push({
                                inlineData: {
                                    data: img.data,
                                    mimeType: img.mediaType
                                }
                            });
                        });
                        console.log(`Adding ${text.images.length} images to Gemini prompt`);
                    }
                } else {
                    // Legacy string input
                    const systemPrompt = this.buildPrompt(inputText, promptOptions);
                    promptParts.push(systemPrompt);
                }

                const result = await this.model.generateContent(promptParts);
                const response = await result.response;
                const generatedText = response.text();

                // Use robust JSON parser from base class
                const parsedResponse = this.safeJSONParse(generatedText);

                // Standardize and return response
                const standardized = this.standardizeResponse(parsedResponse, numQuestions);
                
                // Trim to requested number of questions (AI sometimes generates more)
                if (standardized.questions.length > numQuestions) {
                    standardized.questions = standardized.questions.slice(0, numQuestions);
                    standardized.metadata.num_questions = numQuestions;
                }
                
                // Add model info to metadata
                standardized.metadata.model = this.currentModel;
                
                return standardized;
                
            } catch (error) {
                const isLastAttempt = attempt === this.maxRetries;
                
                // Check if it's a 404 error (model not found) - try fallback immediately
                if (error.message && error.message.includes('404')) {
                    console.warn(`⚠ Model ${this.currentModel} not available (404)`);
                    
                    const fallbackSuccess = await this.tryFallbackModel();
                    if (fallbackSuccess) {
                        console.log(`✓ Retrying with fallback model: ${this.currentModel}`);
                        attempt = 0; // Reset attempts for new model
                        continue; // Retry with new model
                    } else {
                        throw new Error(`All Gemini models unavailable. Please check your API key or try again later.`);
                    }
                }
                
                // Check if it's a 503 error (service overloaded) - retry with backoff, don't fallback
                if (error.message && error.message.includes('503')) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    
                    if (!isLastAttempt) {
                        console.log(`⚠ Gemini API: Attempt ${attempt}/${this.maxRetries} - ${this.currentModel} overloaded. Retrying in ${delay/1000}s...`);
                        await this.sleep(delay);
                        continue; // Retry with same model
                    } else {
                        // On last attempt, just throw - don't fallback for 503 as the model works
                        console.warn(`⚠ ${this.currentModel} is overloaded after ${this.maxRetries} attempts. Please try again later.`);
                        throw new Error(`Gemini model ${this.currentModel} is currently overloaded. Please try again in a few moments.`);
                    }
                }
                
                // For other errors or exhausted all options
                console.error('Gemini API Error:', error.message);
                
                if (isLastAttempt) {
                    throw new Error(`Gemini generation failed: ${error.message}`);
                }
            }
        }
        
        throw new Error('Failed to generate questions after all retries');
    }

    /**
     * Test Gemini connection with automatic fallback
     * @returns {Promise<Object>} - Test result
     */
    async testConnection() {
        try {
            await this.initialize();
            // Test with a simple prompt
            const testText = 'Machine learning is a subset of artificial intelligence.';
            const result = await this.generateQuestions(testText, { numQuestions: 1 });
            
            return {
                success: true,
                message: `Gemini connection successful (using ${this.currentModel})`,
                provider: this.name,
                model: this.currentModel,
                testResult: result.questions?.length === 1 ? 'pass' : 'unexpected response'
            };
        } catch (error) {
            return {
                success: false,
                message: `Gemini connection failed: ${error.message}`,
                provider: this.name,
                error: error.message
            };
        }
    }

    /**
     * Get Gemini-specific configuration options
     * @returns {Object} - Configuration schema
     */
    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                apiKey: {
                    type: 'string',
                    description: 'Google Gemini API Key',
                    required: true,
                    envVar: 'GEMINI_API_KEY'
                },
                model: {
                    type: 'string',
                    description: 'Gemini model to use',
                    enum: this.supportedModels,
                    default: 'gemini-2.5-flash'
                }
            }
        };
    }
}

module.exports = GeminiProvider;