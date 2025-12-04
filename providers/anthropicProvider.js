const BaseAIProvider = require('./baseProvider');

/**
 * Anthropic Claude Provider Implementation
 */
class AnthropicProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'anthropic';
        this.description = 'Anthropic Claude Provider';
        // Models in order of preference (fallback order)
        this.supportedModels = [
            'claude-3-5-sonnet-20241022',  // Latest Sonnet (recommended)
            'claude-3-5-haiku-20241022',   // Fast and efficient
            'claude-3-opus-20240229',      // Most capable (may require higher tier)
            'claude-3-sonnet-20240229',    // Balanced (legacy)
            'claude-3-haiku-20240307'      // Fast (legacy)
        ];
        this.maxRetries = 3;
        this.baseDelay = 2000;
        this.currentModelIndex = 0; // Track which model we're using
    }

    /**
     * Validate Anthropic configuration
     */
    validateConfig() {
        if (!this.config.apiKey) {
            throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or configure in settings.');
        }
        if (this.config.model && !this.supportedModels.includes(this.config.model)) {
            throw new Error(`Unsupported Anthropic model: ${this.config.model}. Supported models: ${this.supportedModels.join(', ')}`);
        }
    }

    /**
     * Initialize Anthropic client with automatic model fallback
     */
    async initialize(config = {}) {
        await super.initialize(config);
        this.client = this.createClient();
        
        // Set current model
        const preferredModel = this.config.model || this.supportedModels[0];
        this.currentModel = preferredModel;
        console.log(`✓ Initialized Anthropic with model: ${this.currentModel}`);
    }

    /**
     * Try next available model in fallback list
     * @returns {boolean} - True if fallback successful
     */
    async tryFallbackModel() {
        this.currentModelIndex++;
        
        if (this.currentModelIndex >= this.supportedModels.length) {
            console.error('⚠ All Anthropic fallback models exhausted');
            return false;
        }

        const fallbackModel = this.supportedModels[this.currentModelIndex];
        console.log(`Falling back to Anthropic model: ${fallbackModel}`);
        
        this.currentModel = fallbackModel;
        return true;
    }

    /**
     * Create Anthropic client
     */
    createClient() {
        return {
            messages: {
                create: async (options) => {
                    const response = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'x-api-key': this.config.apiKey,
                            'Content-Type': 'application/json',
                            'anthropic-version': '2023-06-01'
                        },
                        body: JSON.stringify(options)
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
                    }

                    return await response.json();
                }
            }
        };
    }

    /**
     * Check if Anthropic provider is configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(this.config.apiKey);
    }

    /**
     * Parse Anthropic response to extract generated text
     * @param {Object} response - Anthropic API response
     * @returns {string} - Extracted text
     */
    parseResponse(response) {
        if (!response.content || !Array.isArray(response.content) || !response.content.length) {
            throw new Error('No content in Anthropic response');
        }

        const content = response.content[0];
        if (!content.text) {
            throw new Error('No text in Anthropic response');
        }

        return content.text;
    }

    /**
     * Build prompt specifically for Claude using base class method
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Array} - Formatted messages for Claude
     */
    buildClaudePrompt(text, options = {}) {
        // Use the base class buildPrompt with CoT and Bloom's taxonomy
        const prompt = this.buildPrompt(text, options);

        return [
            {
                role: 'user',
                content: prompt
            }
        ];
    }

    /**
     * Generate questions using Anthropic Claude with automatic model fallback
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
                const messages = this.buildClaudePrompt(text, promptOptions);

                const response = await this.client.messages.create({
                    model: this.currentModel,
                    messages: messages,
                    max_tokens: 2000,
                    temperature: 0.7
                });

                const generatedText = this.parseResponse(response);

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
                    console.warn(`⚠ Anthropic model ${this.currentModel} not available (404)`);
                    
                    const fallbackSuccess = await this.tryFallbackModel();
                    if (fallbackSuccess) {
                        console.log(`✓ Retrying with fallback model: ${this.currentModel}`);
                        attempt = 0; // Reset attempts for new model
                        continue;
                    } else {
                        throw new Error(`All Anthropic models unavailable. Please check your API key or subscription tier.`);
                    }
                }
                
                // Check if it's a rate limit error (429) - retry with backoff
                if (error.message && (error.message.includes('429') || error.message.includes('rate limit'))) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1);
                    
                    if (!isLastAttempt) {
                        console.log(`⚠ Anthropic API: Attempt ${attempt}/${this.maxRetries} - ${this.currentModel} rate limited. Retrying in ${delay/1000}s...`);
                        await this.sleep(delay);
                        continue;
                    } else {
                        console.warn(`⚠ ${this.currentModel} rate limited after ${this.maxRetries} attempts.`);
                        throw new Error(`Anthropic model ${this.currentModel} is rate limited. Please try again later or upgrade your plan.`);
                    }
                }
                
                // Check if it's a 529 error (overloaded) - retry with backoff
                if (error.message && (error.message.includes('529') || error.message.includes('overloaded'))) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1);
                    
                    if (!isLastAttempt) {
                        console.log(`⚠ Anthropic API: Attempt ${attempt}/${this.maxRetries} - ${this.currentModel} overloaded. Retrying in ${delay/1000}s...`);
                        await this.sleep(delay);
                        continue;
                    } else {
                        console.warn(`⚠ ${this.currentModel} overloaded after ${this.maxRetries} attempts.`);
                        throw new Error(`Anthropic model ${this.currentModel} is currently overloaded. Please try again in a few moments.`);
                    }
                }
                
                // For other errors or last attempt
                console.error('Anthropic API Error:', error.message);
                
                if (isLastAttempt) {
                    throw new Error(`Anthropic generation failed: ${error.message}`);
                }
            }
        }
        
        throw new Error('Failed to generate questions after all retries');
    }

    /**
     * Test Anthropic connection with automatic fallback
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
                message: `Anthropic connection successful (using ${this.currentModel})`,
                provider: this.name,
                model: this.currentModel,
                testResult: result.questions?.length === 1 ? 'pass' : 'unexpected response'
            };
        } catch (error) {
            return {
                success: false,
                message: `Anthropic connection failed: ${error.message}`,
                provider: this.name,
                error: error.message
            };
        }
    }

    /**
     * Get Anthropic-specific configuration options
     * @returns {Object} - Configuration schema
     */
    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                apiKey: {
                    type: 'string',
                    description: 'Anthropic API Key',
                    required: true,
                    envVar: 'ANTHROPIC_API_KEY'
                },
                model: {
                    type: 'string',
                    description: 'Claude model to use',
                    enum: this.supportedModels,
                    default: 'claude-3-5-sonnet-20241022'
                }
            }
        };
    }
}

module.exports = AnthropicProvider;