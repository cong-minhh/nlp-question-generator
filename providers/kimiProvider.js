const BaseAIProvider = require('./baseProvider');

/**
 * Kimi AI Global (Moonshot) Provider Implementation
 * API: https://platform.moonshot.ai/
 */
class KimiProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'kimi';
        this.description = 'Kimi AI Global (Moonshot) Provider';
        // Models in order of preference (fallback order)
        this.supportedModels = [
            'moonshotai/kimi-k2:free',      // 8K context window
            'moonshotai/kimi-k2-thinking',     // 32K context window
        ];
        this.baseURL = config.baseURL || 'https://api.moonshot.ai/v1';
        this.maxRetries = 3;
        this.baseDelay = 2000;
        this.currentModelIndex = 0;
    }

    /**
     * Validate Kimi configuration
     */
    validateConfig() {
        if (!this.config.apiKey) {
            throw new Error('Kimi API key is required. Set KIMI_API_KEY environment variable or configure in settings.');
        }
        if (this.config.model && !this.supportedModels.includes(this.config.model)) {
            throw new Error(`Unsupported Kimi model: ${this.config.model}. Supported models: ${this.supportedModels.join(', ')}`);
        }
    }

    /**
     * Initialize Kimi client with automatic model fallback
     */
    async initialize(config = {}) {
        await super.initialize(config);
        this.client = this.createClient();
        
        // Set current model
        const preferredModel = this.config.model || this.supportedModels[0];
        this.currentModel = preferredModel;
        console.log(`✓ Initialized Kimi with model: ${this.currentModel}`);
    }

    /**
     * Create Kimi client using fetch
     */
    createClient() {
        return {
            chat: {
                completions: {
                    create: async (options) => {
                        const response = await fetch(`${this.baseURL}/chat/completions`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${this.config.apiKey}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(options)
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            throw new Error(`Kimi API error: ${response.status} ${response.statusText}. ${errorData.message || errorData.error?.message || ''}`);
                        }

                        return await response.json();
                    }
                }
            }
        };
    }

    /**
     * Try next available model in fallback list
     */
    async tryFallbackModel() {
        this.currentModelIndex++;
        
        if (this.currentModelIndex >= this.supportedModels.length) {
            console.error('⚠ All Kimi fallback models exhausted');
            return false;
        }

        const fallbackModel = this.supportedModels[this.currentModelIndex];
        console.log(`Falling back to Kimi model: ${fallbackModel}`);
        
        this.currentModel = fallbackModel;
        return true;
    }

    /**
     * Check if Kimi provider is configured
     */
    isConfigured() {
        return !!(this.config.apiKey);
    }

    /**
     * Sleep utility for retry logic
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Parse Kimi response to extract generated text
     */
    parseResponse(response) {
        if (!response.choices || !response.choices.length) {
            throw new Error('No choices in Kimi response');
        }

        const message = response.choices[0].message;
        if (!message || !message.content) {
            throw new Error('No content in Kimi response');
        }

        return message.content;
    }

    /**
     * Clean AI response to extract JSON
     */
    cleanAIResponse(generatedText) {
        let cleanedText = generatedText.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }
        return cleanedText;
    }

    /**
     * Generate questions using Kimi AI with automatic model fallback
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
                const prompt = this.buildPrompt(text, promptOptions);

                const response = await this.client.chat.completions.create({
                    model: this.currentModel,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert educator creating multiple choice quiz questions. Respond with only valid JSON in the exact format requested.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000
                });

                const generatedText = this.parseResponse(response);
                const cleanedText = this.cleanAIResponse(generatedText);
                const parsedResponse = JSON.parse(cleanedText);
                const standardized = this.standardizeResponse(parsedResponse, numQuestions);
                
                // Trim to requested number of questions
                if (standardized.questions.length > numQuestions) {
                    standardized.questions = standardized.questions.slice(0, numQuestions);
                    standardized.metadata.num_questions = numQuestions;
                }
                
                standardized.metadata.model = this.currentModel;
                return standardized;
                
            } catch (error) {
                const isLastAttempt = attempt === this.maxRetries;
                
                // Check if it's a 404 error (model not found)
                if (error.message && error.message.includes('404')) {
                    console.warn(`⚠ Kimi model ${this.currentModel} not available (404)`);
                    
                    const fallbackSuccess = await this.tryFallbackModel();
                    if (fallbackSuccess) {
                        console.log(`✓ Retrying with fallback model: ${this.currentModel}`);
                        attempt = 0;
                        continue;
                    } else {
                        throw new Error(`All Kimi models unavailable. Please check your API key or subscription.`);
                    }
                }
                
                // Check if it's a rate limit error (429)
                if (error.message && (error.message.includes('429') || error.message.includes('rate limit'))) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1);
                    
                    if (!isLastAttempt) {
                        console.log(`⚠ Kimi API: Attempt ${attempt}/${this.maxRetries} - ${this.currentModel} rate limited. Retrying in ${delay/1000}s...`);
                        await this.sleep(delay);
                        continue;
                    } else {
                        console.warn(`⚠ ${this.currentModel} rate limited after ${this.maxRetries} attempts.`);
                        throw new Error(`Kimi model ${this.currentModel} is rate limited. Please try again later.`);
                    }
                }
                
                // Check if it's a 503 error (service unavailable)
                if (error.message && (error.message.includes('503') || error.message.includes('service unavailable'))) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1);
                    
                    if (!isLastAttempt) {
                        console.log(`⚠ Kimi API: Attempt ${attempt}/${this.maxRetries} - ${this.currentModel} unavailable. Retrying in ${delay/1000}s...`);
                        await this.sleep(delay);
                        continue;
                    } else {
                        console.warn(`⚠ ${this.currentModel} unavailable after ${this.maxRetries} attempts.`);
                        throw new Error(`Kimi model ${this.currentModel} is currently unavailable. Please try again in a few moments.`);
                    }
                }
                
                console.error('Kimi API Error:', error.message);
                
                if (isLastAttempt) {
                    throw new Error(`Kimi generation failed: ${error.message}`);
                }
            }
        }
        
        throw new Error('Failed to generate questions after all retries');
    }

    /**
     * Test Kimi connection with automatic fallback
     */
    async testConnection() {
        try {
            await this.initialize();
            const testText = 'Machine learning is a subset of artificial intelligence.';
            const result = await this.generateQuestions(testText, { numQuestions: 1 });
            
            return {
                success: true,
                message: `Kimi connection successful (using ${this.currentModel})`,
                provider: this.name,
                model: this.currentModel,
                testResult: result.questions?.length === 1 ? 'pass' : 'unexpected response'
            };
        } catch (error) {
            return {
                success: false,
                message: `Kimi connection failed: ${error.message}`,
                provider: this.name,
                error: error.message
            };
        }
    }

    /**
     * Get Kimi-specific configuration options
     */
    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                apiKey: {
                    type: 'string',
                    description: 'Kimi (Moonshot) API Key',
                    required: true,
                    envVar: 'KIMI_API_KEY'
                },
                model: {
                    type: 'string',
                    description: 'Kimi model to use',
                    enum: this.supportedModels,
                    default: 'moonshot-v1-8k'
                },
                baseURL: {
                    type: 'string',
                    description: 'Kimi API base URL',
                    default: 'https://api.moonshot.cn/v1'
                }
            }
        };
    }
}

module.exports = KimiProvider;
