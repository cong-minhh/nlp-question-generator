const BaseAIProvider = require('./baseProvider');

/**
 * DeepSeek Provider Implementation
 * DeepSeek API: https://api.deepseek.com/
 */
class DeepSeekProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'deepseek';
        this.description = 'DeepSeek AI Provider';
        this.supportedModels = [
            'deepseek-chat',
            'deepseek-coder'
        ];
        this.baseURL = config.baseURL || 'https://api.deepseek.com/v1';
        this.maxRetries = 3;
        this.baseDelay = 2000;
    }

    /**
     * Validate DeepSeek configuration
     */
    validateConfig() {
        if (!this.config.apiKey) {
            throw new Error('DeepSeek API key is required. Set DEEPSEEK_API_KEY environment variable or configure in settings.');
        }
        if (this.config.model && !this.supportedModels.includes(this.config.model)) {
            throw new Error(`Unsupported DeepSeek model: ${this.config.model}. Supported models: ${this.supportedModels.join(', ')}`);
        }
    }

    /**
     * Initialize DeepSeek client
     */
    async initialize(config = {}) {
        await super.initialize(config);
        this.client = this.createClient();
    }

    /**
     * Create DeepSeek client using fetch
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
                            throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}. ${errorData.message || errorData.error?.message || ''}`);
                        }

                        return await response.json();
                    }
                }
            }
        };
    }

    /**
     * Check if DeepSeek provider is configured
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
     * Parse DeepSeek response to extract generated text
     * @param {Object} response - DeepSeek API response
     * @returns {string} - Extracted text
     */
    parseResponse(response) {
        if (!response.choices || !response.choices.length) {
            throw new Error('No choices in DeepSeek response');
        }

        const message = response.choices[0].message;
        if (!message || !message.content) {
            throw new Error('No content in DeepSeek response');
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
     * Build DeepSeek-specific prompt
     * @param {string} text - Input text
     * @param {number} numQuestions - Number of questions
     * @returns {string} - Formatted prompt
     */
    buildPrompt(text, numQuestions = 10) {
        return `You are an expert educator creating multiple choice quiz questions using DeepSeek AI.

Based on the following text, generate exactly ${numQuestions} multiple choice questions.

TEXT:
${text}

REQUIREMENTS:
- Generate exactly ${numQuestions} questions
- Each question must have 4 options (A, B, C, D)
- Mark the correct answer as A, B, C, or D
- Assign difficulty level as "easy", "medium", or "hard"
- Questions should test understanding, not just recall
- Options should be plausible and well-distributed
- Ensure questions are educational and accurate

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks, just raw JSON):
{
  "questions": [
    {
      "questiontext": "What is...?",
      "optiona": "First option",
      "optionb": "Second option",
      "optionc": "Third option",
      "optiond": "Fourth option",
      "correctanswer": "A",
      "difficulty": "medium"
    }
  ]
}`;
    }

    /**
     * Generate questions using DeepSeek
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Standardized questions
     */
    async generateQuestions(text, options = {}) {
        const numQuestions = options.numQuestions || 10;
        const model = options.model || this.config.model || 'deepseek-chat';

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const prompt = this.buildPrompt(text, numQuestions);

                const response = await this.client.chat.completions.create({
                    model: model,
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
                    max_tokens: 2000,
                    top_p: 0.9
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
                
                // Check if it's a rate limit or service error
                if (error.message && (
                    error.message.includes('429') || 
                    error.message.includes('rate limit') ||
                    error.message.includes('503') ||
                    error.message.includes('service unavailable')
                )) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    console.log(`DeepSeek API: Attempt ${attempt}/${this.maxRetries} failed: ${error.message.includes('503') ? 'Service overloaded' : 'Rate limited'}. ${isLastAttempt ? 'No more retries.' : `Retrying in ${delay/1000}s...`}`);
                    
                    if (!isLastAttempt) {
                        await this.sleep(delay);
                        continue; // Retry
                    }
                }
                
                // For other errors or last attempt, throw
                console.error('DeepSeek API Error:', error.message);
                throw new Error(`DeepSeek generation failed: ${error.message}`);
            }
        }
        
        throw new Error('Failed to generate questions after all retries');
    }

    /**
     * Test DeepSeek connection
     * @returns {Promise<Object>} - Test result
     */
    async testConnection() {
        try {
            await this.initialize();
            // Test with a simple prompt
            const testText = 'DeepSeek is an advanced AI model developed for various natural language processing tasks.';
            const result = await this.generateQuestions(testText, { numQuestions: 1 });
            
            return {
                success: true,
                message: 'DeepSeek connection successful',
                provider: this.name,
                model: this.config.model || 'deepseek-chat',
                testResult: result.questions?.length === 1 ? 'pass' : 'unexpected response',
                responseTime: Date.now()
            };
        } catch (error) {
            return {
                success: false,
                message: `DeepSeek connection failed: ${error.message}`,
                provider: this.name,
                error: error.message
            };
        }
    }

    /**
     * Get DeepSeek-specific configuration options
     * @returns {Object} - Configuration schema
     */
    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                apiKey: {
                    type: 'string',
                    description: 'DeepSeek API Key',
                    required: true,
                    envVar: 'DEEPSEEK_API_KEY'
                },
                model: {
                    type: 'string',
                    description: 'DeepSeek model to use',
                    enum: this.supportedModels,
                    default: 'deepseek-chat'
                },
                baseURL: {
                    type: 'string',
                    description: 'Custom DeepSeek-compatible API base URL',
                    default: 'https://api.deepseek.com/v1'
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature',
                    minimum: 0,
                    maximum: 2,
                    default: 0.7
                },
                maxTokens: {
                    type: 'number',
                    description: 'Maximum tokens to generate',
                    minimum: 1,
                    maximum: 4000,
                    default: 2000
                }
            }
        };
    }

    /**
     * Get provider information with DeepSeek-specific details
     * @returns {Object} - Provider metadata
     */
    getProviderInfo() {
        const info = super.getProviderInfo();
        info.baseURL = this.baseURL;
        info.supportedModels = [...this.supportedModels];
        info.apiVersion = 'v1';
        return info;
    }

    /**
     * DeepSeek-specific model information
     * @returns {Object} - Model details
     */
    getModelInfo() {
        return {
            'deepseek-chat': {
                name: 'DeepSeek Chat',
                description: 'Optimized for conversational tasks and general question generation',
                contextWindow: '32K tokens',
                strengths: ['conversation', 'general knowledge', 'education']
            },
            'deepseek-coder': {
                name: 'DeepSeek Coder',
                description: 'Specialized for code-related tasks and technical content',
                contextWindow: '16K tokens',
                strengths: ['coding', 'technical content', 'programming education']
            }
        };
    }
}

module.exports = DeepSeekProvider;