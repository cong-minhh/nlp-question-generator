const BaseAIProvider = require('./baseProvider');

/**
 * OpenAI Provider Implementation
 */
class OpenAIProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'openai';
        this.description = 'OpenAI GPT Provider';
        this.supportedModels = [
            'gpt-3.5-turbo',
            'gpt-4',
            'gpt-4-turbo',
            'gpt-4o'
        ];
        this.baseURL = config.baseURL || 'https://api.openai.com/v1';
        this.maxRetries = 3;
        this.baseDelay = 2000;
    }

    /**
     * Validate OpenAI configuration
     */
    validateConfig() {
        if (!this.config.apiKey) {
            throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or configure in settings.');
        }
        if (this.config.model && !this.supportedModels.includes(this.config.model)) {
            throw new Error(`Unsupported OpenAI model: ${this.config.model}. Supported models: ${this.supportedModels.join(', ')}`);
        }
    }

    /**
     * Initialize OpenAI client
     */
    async initialize(config = {}) {
        await super.initialize(config);
        this.client = this.createClient();
    }

    /**
     * Create OpenAI client
     */
    createClient() {
        // Simple fetch-based client to avoid additional dependencies
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
                            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
                        }

                        return await response.json();
                    }
                }
            }
        };
    }

    /**
     * Check if OpenAI provider is configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(this.config.apiKey);
    }

    /**
     * Sleep utility for retry logic
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Parse OpenAI response to extract generated text
     * @param {Object} response - OpenAI API response
     * @returns {string} - Extracted text
     */
    parseResponse(response) {
        if (!response.choices || !response.choices.length) {
            throw new Error('No choices in OpenAI response');
        }

        const message = response.choices[0].message;
        if (!message || !message.content) {
            throw new Error('No content in OpenAI response');
        }

        return message.content;
    }

    /**
     * Clean AI response to extract JSON
     * @param {string} generatedText - Raw text from AI response
     * @returns {string} - Cleaned JSON text
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
     * Generate questions using OpenAI
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Standardized questions
     */
    async generateQuestions(text, options = {}) {
        const numQuestions = options.numQuestions || 10;
        const model = options.model || this.config.model || 'gpt-3.5-turbo';

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const prompt = this.buildPrompt(text, numQuestions);

                const response = await this.client.chat.completions.create({
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert educator creating multiple choice quiz questions. Respond with only valid JSON.'
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

                // Clean the response - remove markdown code blocks if present
                const cleanedText = this.cleanAIResponse(generatedText);

                // Parse JSON response
                const parsedResponse = JSON.parse(cleanedText);

                // Standardize and return response
                return this.standardizeResponse(parsedResponse, numQuestions);
                
            } catch (error) {
                const isLastAttempt = attempt === this.maxRetries;
                
                // Check if it's a rate limit error
                if (error.message && (error.message.includes('429') || error.message.includes('rate limit'))) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    console.log(`OpenAI API: Attempt ${attempt}/${this.maxRetries} failed: Rate limited. ${isLastAttempt ? 'No more retries.' : `Retrying in ${delay/1000}s...`}`);
                    
                    if (!isLastAttempt) {
                        await this.sleep(delay);
                        continue; // Retry
                    }
                }
                
                // For other errors or last attempt, throw
                console.error('OpenAI API Error:', error.message);
                throw new Error(`OpenAI generation failed: ${error.message}`);
            }
        }
        
        throw new Error('Failed to generate questions after all retries');
    }

    /**
     * Test OpenAI connection
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
                message: 'OpenAI connection successful',
                provider: this.name,
                model: this.config.model || 'gpt-3.5-turbo',
                testResult: result.questions?.length === 1 ? 'pass' : 'unexpected response'
            };
        } catch (error) {
            return {
                success: false,
                message: `OpenAI connection failed: ${error.message}`,
                provider: this.name,
                error: error.message
            };
        }
    }

    /**
     * Get OpenAI-specific configuration options
     * @returns {Object} - Configuration schema
     */
    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                apiKey: {
                    type: 'string',
                    description: 'OpenAI API Key',
                    required: true,
                    envVar: 'OPENAI_API_KEY'
                },
                model: {
                    type: 'string',
                    description: 'OpenAI model to use',
                    enum: this.supportedModels,
                    default: 'gpt-3.5-turbo'
                },
                baseURL: {
                    type: 'string',
                    description: 'Custom OpenAI-compatible API base URL',
                    default: 'https://api.openai.com/v1'
                }
            }
        };
    }
}

module.exports = OpenAIProvider;