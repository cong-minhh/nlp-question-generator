/**
 * Base AI Provider Interface
 * All AI providers must implement these methods
 */

class BaseAIProvider {
    constructor(config = {}) {
        this.config = config;
        this.name = 'base';
        this.description = 'Base AI Provider';
        this.supportedModels = [];
    }

    /**
     * Initialize the AI provider
     * @param {Object} config - Provider configuration
     * @returns {Promise<void>}
     */
    async initialize(config = {}) {
        this.config = { ...this.config, ...config };
        if (this.validateConfig) {
            this.validateConfig();
        }
    }

    /**
     * Validate provider configuration
     * Should throw error if configuration is invalid
     */
    validateConfig() {
        throw new Error('validateConfig() must be implemented by provider');
    }

    /**
     * Generate questions using the AI provider
     * @param {string} text - Input text to generate questions from
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Generated questions in standard format
     */
    async generateQuestions(text, options = {}) {
        throw new Error('generateQuestions() must be implemented by provider');
    }

    /**
     * Get available models for this provider
     * @returns {Array} - Array of supported model names
     */
    getSupportedModels() {
        return [...this.supportedModels];
    }

    /**
     * Test the provider connection
     * @returns {Promise<Object>} - Connection test result
     */
    async testConnection() {
        throw new Error('testConnection() must be implemented by provider');
    }

    /**
     * Get provider information
     * @returns {Object} - Provider metadata
     */
    getProviderInfo() {
        return {
            name: this.name,
            description: this.description,
            supportedModels: this.supportedModels,
            configured: this.isConfigured()
        };
    }

    /**
     * Check if provider is properly configured
     * @returns {boolean} - Configuration status
     */
    isConfigured() {
        throw new Error('isConfigured() must be implemented by provider');
    }

    /**
     * Standardize question format across providers
     * @param {Object} response - Raw provider response
     * @param {number} numQuestions - Expected number of questions
     * @returns {Object} - Standardized questions object
     */
    standardizeResponse(response, numQuestions = 10) {
        let questions = [];

        // Handle different response formats
        if (response.questions && Array.isArray(response.questions)) {
            questions = response.questions;
        } else if (Array.isArray(response)) {
            questions = response;
        } else {
            throw new Error('Invalid response format from provider');
        }

        // Validate and standardize each question
        const standardizedQuestions = questions.map((q, index) => {
            const standardized = {
                questiontext: q.questiontext || q.question || q.text || '',
                optiona: q.optiona || q.optionA || q.A || q.options?.A || '',
                optionb: q.optionb || q.optionB || q.B || q.options?.B || '',
                optionc: q.optionc || q.optionC || q.C || q.options?.C || '',
                optiond: q.optiond || q.optionD || q.D || q.options?.D || '',
                correctanswer: (q.correctanswer || q.correct_answer || q.answer || q.A).toString().toUpperCase(),
                difficulty: (q.difficulty || q.level || 'medium').toLowerCase()
            };

            // Validate required fields
            ['questiontext', 'optiona', 'optionb', 'optionc', 'optiond', 'correctanswer', 'difficulty'].forEach(field => {
                if (!standardized[field]) {
                    throw new Error(`Question ${index + 1} missing required field: ${field}`);
                }
            });

            // Validate correct answer
            if (!['A', 'B', 'C', 'D'].includes(standardized.correctanswer)) {
                throw new Error(`Question ${index + 1} has invalid correct answer: ${standardized.correctanswer}`);
            }

            // Validate difficulty
            if (!['easy', 'medium', 'hard'].includes(standardized.difficulty)) {
                standardized.difficulty = 'medium';
            }

            return standardized;
        });

        return {
            questions: standardizedQuestions,
            provider: this.name,
            metadata: {
                generated_at: new Date().toISOString(),
                num_questions: standardizedQuestions.length,
                source: this.name
            }
        };
    }

    /**
     * Build standard prompt for question generation
     * @param {string} text - Input text
     * @param {number} numQuestions - Number of questions
     * @returns {string} - Formatted prompt
     */
    buildPrompt(text, numQuestions = 10) {
        return `You are an expert educator creating multiple choice quiz questions. 

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
    }
}

module.exports = BaseAIProvider;