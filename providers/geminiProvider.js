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
        this.supportedModels = [
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-2.5-flash'
        ];
        this.maxRetries = 3;
        this.baseDelay = 2000;
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
     * Initialize Gemini client
     */
    async initialize(config = {}) {
        await super.initialize(config);
        this.genAI = new GoogleGenerativeAI(this.config.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: this.config.model || 'gemini-2.5-flash' });
    }

    /**
     * Check if Gemini provider is configured
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
     * Generate questions using Gemini AI
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Standardized questions
     */
    async generateQuestions(text, options = {}) {
        const numQuestions = options.numQuestions || 10;
        const model = options.model || this.config.model || 'gemini-2.5-flash';

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const prompt = this.buildPrompt(text, numQuestions);

                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const generatedText = response.text();

                // Clean the response - remove markdown code blocks if present
                const cleanedText = this.cleanAIResponse(generatedText);

                // Parse JSON response
                const parsedResponse = JSON.parse(cleanedText);

                // Standardize and return response
                return this.standardizeResponse(parsedResponse, numQuestions);
                
            } catch (error) {
                const isLastAttempt = attempt === this.maxRetries;
                
                // Check if it's a 503 error (service overloaded)
                if (error.message && error.message.includes('503')) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    console.log(`Gemini API: Attempt ${attempt}/${this.maxRetries} failed: Service overloaded. ${isLastAttempt ? 'No more retries.' : `Retrying in ${delay/1000}s...`}`);
                    
                    if (!isLastAttempt) {
                        await this.sleep(delay);
                        continue; // Retry
                    }
                }
                
                // For other errors or last attempt, throw
                console.error('Gemini API Error:', error.message);
                throw new Error(`Gemini generation failed: ${error.message}`);
            }
        }
        
        throw new Error('Failed to generate questions after all retries');
    }

    /**
     * Test Gemini connection
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
                message: 'Gemini connection successful',
                provider: this.name,
                model: this.config.model || 'gemini-2.5-flash',
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