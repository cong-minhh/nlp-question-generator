const BaseAIProvider = require('./baseProvider');

/**
 * Anthropic Claude Provider Implementation
 */
class AnthropicProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'anthropic';
        this.description = 'Anthropic Claude Provider';
        this.supportedModels = [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ];
        this.maxRetries = 3;
        this.baseDelay = 2000;
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
     * Initialize Anthropic client
     */
    async initialize(config = {}) {
        await super.initialize(config);
        this.client = this.createClient();
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
     * Sleep utility for retry logic
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
     * Build prompt specifically for Claude
     * @param {string} text - Input text
     * @param {number} numQuestions - Number of questions
     * @returns {Array} - Formatted messages for Claude
     */
    buildClaudePrompt(text, numQuestions = 10) {
        const prompt = `You are an expert educator creating multiple choice quiz questions. 

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

        return [
            {
                role: 'user',
                content: prompt
            }
        ];
    }

    /**
     * Generate questions using Anthropic Claude
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Standardized questions
     */
    async generateQuestions(text, options = {}) {
        const numQuestions = options.numQuestions || 10;
        const model = options.model || this.config.model || 'claude-3-5-sonnet-20241022';

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const messages = this.buildClaudePrompt(text, numQuestions);

                const response = await this.client.messages.create({
                    model: model,
                    messages: messages,
                    max_tokens: 2000,
                    temperature: 0.7
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
                    console.log(`Anthropic API: Attempt ${attempt}/${this.maxRetries} failed: Rate limited. ${isLastAttempt ? 'No more retries.' : `Retrying in ${delay/1000}s...`}`);
                    
                    if (!isLastAttempt) {
                        await this.sleep(delay);
                        continue; // Retry
                    }
                }
                
                // For other errors or last attempt, throw
                console.error('Anthropic API Error:', error.message);
                throw new Error(`Anthropic generation failed: ${error.message}`);
            }
        }
        
        throw new Error('Failed to generate questions after all retries');
    }

    /**
     * Test Anthropic connection
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
                message: 'Anthropic connection successful',
                provider: this.name,
                model: this.config.model || 'claude-3-5-sonnet-20241022',
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