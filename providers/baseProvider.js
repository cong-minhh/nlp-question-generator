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
                difficulty: (q.difficulty || q.level || 'medium').toLowerCase(),
                rationale: q.rationale || q.explanation || ''
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
        return `You are an Expert Instructional Designer creating high-quality multiple choice questions.

Your goal is to test "Deep Understanding" and application of concepts, NOT just simple recall of facts.

Based on the following text, generate exactly ${numQuestions} multiple choice questions.

TEXT:
${text}

REQUIREMENTS:
1. **Deep Understanding**: Questions must require analysis, synthesis, or application of the content. Avoid "What is X?" style questions if possible. Use scenarios or "Which of the following best demonstrates..."
2. **Distractor Engineering**: Wrong answers (distractors) must be PLAUSIBLE misconceptions or common errors. Do NOT use random unrelated facts. A student with partial knowledge should be tempted by the distractors.
3. **Rationale**: You must provide a "rationale" explaining why the correct answer is correct and why the others are wrong.

FEW-SHOT EXAMPLES:

[BAD - RECALL ONLY]
Question: What is the capital of France?
A) London
B) Berlin
C) Paris
D) Madrid
Correct: C
Rationale: Paris is the capital. (Too simple, just fact retrieval)

[GOOD - SCENARIO & APPLICATION]
Question: A user is complaining that their laptop battery drains too quickly even when in "Sleep" mode. Based on the power management principles described in the text, which setting is most likely misconfigured?
A) The screen brightness is set to maximum. (Unlikely to affect Sleep mode)
B) "Hybrid Sleep" is disabled, causing the RAM to stay fully powered. (Plausible mechanism for power drain)
C) The hard drive is full. (Irrelevant to power consumption)
D) The keyboard backlight is off. (Would save power, not drain it)
Correct: B
Rationale: Sleep mode keeps RAM powered to maintain state. Hybrid sleep saves state to disk allowing lower power states. If disabled, standard sleep might consume more power or wake events might be mishandled. Option A is irrelevant in sleep. Option C is unrelated.

OUTPUT FORMAT:
Return ONLY a valid JSON object with this exact structure:
{
  "questions": [
    {
      "questiontext": "Scenario or deep question text...",
      "optiona": "Plausible distractor A",
      "optionb": "Plausible distractor B",
      "optionc": "Correct answer C",
      "optiond": "Plausible distractor D",
      "correctanswer": "C",
      "difficulty": "hard",
      "rationale": "Explanation of the logic..."
    }
  ]
}`;
    }
}

module.exports = BaseAIProvider;