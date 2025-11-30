/**
 * Base AI Provider Interface with Advanced NLP Patterns
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
     * Robust JSON Parser - Handles markdown blocks and malformed responses
     * @param {string} rawResponse - Raw string response from AI
     * @returns {Object} - Parsed JSON object
     * @throws {Error} - Clear error message if parsing fails
     */
    safeJSONParse(rawResponse) {
        if (!rawResponse || typeof rawResponse !== 'string') {
            throw new Error('Invalid response: Expected non-empty string');
        }

        let cleaned = rawResponse.trim();

        // Step 1: Remove markdown code blocks (```json, ```, etc.)
        cleaned = cleaned.replace(/```json\s*/gi, '');
        cleaned = cleaned.replace(/```javascript\s*/gi, '');
        cleaned = cleaned.replace(/```\s*/g, '');

        // Step 2: Extract content between first { and last }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
            throw new Error('Invalid JSON structure: No valid JSON object found in response');
        }

        const jsonString = cleaned.substring(firstBrace, lastBrace + 1);

        // Step 3: Attempt to parse
        try {
            const parsed = JSON.parse(jsonString);
            return parsed;
        } catch (parseError) {
            // Provide detailed error for debugging
            throw new Error(
                `JSON Parse Error: ${parseError.message}\n` +
                `First 200 chars of extracted JSON: ${jsonString.substring(0, 200)}...`
            );
        }
    }

    /**
     * Get Bloom's Taxonomy instructions for different cognitive levels
     * @param {string} level - Bloom's level: 'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'
     * @returns {string} - Specific instructions for that cognitive level
     */
    getBloomInstructions(level = 'apply') {
        const bloomLevels = {
            remember: {
                description: 'Recall facts and basic concepts',
                verbs: 'define, duplicate, list, memorize, recall, repeat, state',
                guidance: 'Focus on retrieving knowledge from memory. Questions should test recognition and recall of specific information.'
            },
            understand: {
                description: 'Explain ideas or concepts',
                verbs: 'classify, describe, discuss, explain, identify, locate, recognize, report, select, translate',
                guidance: 'Questions should require explaining concepts in their own words, interpreting information, and summarizing main ideas.'
            },
            apply: {
                description: 'Use information in new situations',
                verbs: 'execute, implement, solve, use, demonstrate, interpret, operate, schedule, sketch',
                guidance: 'Present scenarios where learners must apply knowledge to new contexts. Questions should require using procedures or methods in given situations.'
            },
            analyze: {
                description: 'Draw connections among ideas',
                verbs: 'differentiate, organize, relate, compare, contrast, distinguish, examine, experiment, question, test',
                guidance: 'Questions should require breaking down information, finding patterns, identifying relationships, and distinguishing between components.'
            },
            evaluate: {
                description: 'Justify a decision or course of action',
                verbs: 'appraise, argue, defend, judge, select, support, value, critique, weigh',
                guidance: 'Questions should require making judgments based on criteria, defending positions, and evaluating the quality or validity of ideas.'
            },
            create: {
                description: 'Produce new or original work',
                verbs: 'design, assemble, construct, conjecture, develop, formulate, author, investigate',
                guidance: 'Questions should require generating new ideas, designing solutions, or proposing alternative approaches based on the content.'
            }
        };

        const normalizedLevel = level.toLowerCase();
        const bloomLevel = bloomLevels[normalizedLevel] || bloomLevels.apply;

        return `
**BLOOM'S TAXONOMY LEVEL: ${normalizedLevel.toUpperCase()}**
- Description: ${bloomLevel.description}
- Key Verbs: ${bloomLevel.verbs}
- Guidance: ${bloomLevel.guidance}

Ensure all questions target this cognitive level specifically.`;
    }

    /**
     * Split long text into manageable chunks by sentence boundaries
     * @param {string} text - Input text to split
     * @param {number} maxChars - Maximum characters per chunk (default: 4000)
     * @returns {Array<string>} - Array of text chunks
     */
    splitTextIntoChunks(text, maxChars = 4000) {
        if (!text || text.length <= maxChars) {
            return [text];
        }

        const chunks = [];
        // Split by sentence boundaries (., !, ?) followed by space or newline
        const sentences = text.match(/[^.!?]+[.!?]+[\s\n]*/g) || [text];
        
        let currentChunk = '';

        for (const sentence of sentences) {
            // If single sentence exceeds maxChars, split by words
            if (sentence.length > maxChars) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }

                // Split long sentence by words
                const words = sentence.split(/\s+/);
                let wordChunk = '';
                
                for (const word of words) {
                    if ((wordChunk + word).length > maxChars) {
                        chunks.push(wordChunk.trim());
                        wordChunk = word + ' ';
                    } else {
                        wordChunk += word + ' ';
                    }
                }
                
                if (wordChunk.trim()) {
                    currentChunk = wordChunk;
                }
                continue;
            }

            // Check if adding this sentence exceeds limit
            if ((currentChunk + sentence).length > maxChars) {
                chunks.push(currentChunk.trim());
                currentChunk = sentence;
            } else {
                currentChunk += sentence;
            }
        }

        // Add remaining chunk
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks.filter(chunk => chunk.length > 0);
    }

    /**
     * Standardize question format across providers with enhanced validation
     * @param {Object} response - Raw provider response (can be string or object)
     * @param {number} numQuestions - Expected number of questions
     * @returns {Object} - Standardized questions object
     */
    standardizeResponse(response, numQuestions = 10) {
        // If response is a string, parse it first
        let parsedResponse = response;
        if (typeof response === 'string') {
            parsedResponse = this.safeJSONParse(response);
        }

        let questions = [];
        let analysis = '';

        // Extract analysis if present (from CoT prompt)
        if (parsedResponse.analysis) {
            analysis = parsedResponse.analysis;
        }

        // Handle different response formats
        if (parsedResponse.questions && Array.isArray(parsedResponse.questions)) {
            questions = parsedResponse.questions;
        } else if (Array.isArray(parsedResponse)) {
            questions = parsedResponse;
        } else {
            throw new Error('Invalid response format from provider: Expected questions array');
        }

        // Validate minimum questions
        if (questions.length === 0) {
            throw new Error('No questions found in provider response');
        }

        // Validate and standardize each question
        const standardizedQuestions = questions.map((q, index) => {
            const standardized = {
                questiontext: q.questiontext || q.question || q.text || '',
                optiona: q.optiona || q.optionA || q.A || q.options?.A || '',
                optionb: q.optionb || q.optionB || q.B || q.options?.B || '',
                optionc: q.optionc || q.optionC || q.C || q.options?.C || '',
                optiond: q.optiond || q.optionD || q.D || q.options?.D || '',
                correctanswer: (q.correctanswer || q.correct_answer || q.answer || 'A').toString().toUpperCase(),
                difficulty: (q.difficulty || q.level || 'medium').toLowerCase(),
                rationale: q.rationale || q.explanation || ''
            };

            // Validate required fields
            const requiredFields = ['questiontext', 'optiona', 'optionb', 'optionc', 'optiond', 'correctanswer'];
            requiredFields.forEach(field => {
                if (!standardized[field] || standardized[field].toString().trim() === '') {
                    throw new Error(`Question ${index + 1} missing required field: ${field}`);
                }
            });

            // Validate correct answer
            if (!['A', 'B', 'C', 'D'].includes(standardized.correctanswer)) {
                throw new Error(
                    `Question ${index + 1} has invalid correct answer: "${standardized.correctanswer}". Must be A, B, C, or D.`
                );
            }

            // Validate difficulty
            if (!['easy', 'medium', 'hard'].includes(standardized.difficulty)) {
                console.warn(`Question ${index + 1} has invalid difficulty "${standardized.difficulty}", defaulting to "medium"`);
                standardized.difficulty = 'medium';
            }

            // Warn if rationale is missing (not required but recommended)
            if (!standardized.rationale || standardized.rationale.trim() === '') {
                console.warn(`Question ${index + 1} is missing a rationale`);
            }

            return standardized;
        });

        return {
            questions: standardizedQuestions,
            provider: this.name,
            analysis: analysis || 'No analysis provided',
            metadata: {
                generated_at: new Date().toISOString(),
                num_questions: standardizedQuestions.length,
                expected_questions: numQuestions,
                source: this.name
            }
        };
    }

    /**
     * Build advanced prompt with Chain of Thought (CoT) reasoning
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @param {number} options.numQuestions - Number of questions (default: 10)
     * @param {string} options.bloomLevel - Bloom's taxonomy level (default: 'apply')
     * @param {string} options.difficulty - Question difficulty: 'easy', 'medium', 'hard', 'mixed' (default: 'mixed')
     * @returns {string} - Formatted prompt with CoT instructions
     */
    buildPrompt(text, options = {}) {
        const {
            numQuestions = 10,
            bloomLevel = 'apply',
            difficulty = 'mixed'
        } = options;

        const bloomInstructions = this.getBloomInstructions(bloomLevel);

        return `You are an Expert Instructional Designer and Assessment Specialist with expertise in cognitive science and learning theory.

Your task is to create ${numQuestions} high-quality multiple choice questions that test deep understanding, NOT simple recall.

${bloomInstructions}

**SOURCE TEXT:**
${text}

---

**CHAIN OF THOUGHT PROCESS - FOLLOW THESE STEPS:**

**STEP 1: ANALYZE THE TEXT**
Before creating questions, identify:
- Key concepts, principles, and relationships in the text
- Important processes, mechanisms, or procedures described
- Potential misconceptions or common errors learners might have
- Real-world applications or scenarios where this knowledge applies

**STEP 2: DRAFT QUESTIONS**
For each question:
- Create a scenario or context that requires applying the concept
- Ensure the question stem is clear and unambiguous
- Target the specified Bloom's taxonomy level
- Avoid "What is..." questions unless at 'remember' level

**STEP 3: ENGINEER PLAUSIBLE DISTRACTORS**
For each wrong answer (distractor):
- Base it on common misconceptions or partial understanding
- Make it tempting to someone with incomplete knowledge
- Ensure it's clearly wrong to someone who fully understands
- Avoid obviously absurd or unrelated options

**STEP 4: VALIDATE QUALITY**
Ensure each question:
- Has exactly one clearly correct answer
- Has three plausible but incorrect distractors
- Includes a detailed rationale explaining the reasoning
- Aligns with the difficulty level: ${difficulty}

---

**QUALITY STANDARDS:**

✓ **GOOD QUESTION EXAMPLE:**
{
  "questiontext": "A development team notices their Node.js application's memory usage grows continuously until the process crashes. They've confirmed no memory leaks in their code. Based on garbage collection principles, which scenario most likely explains this behavior?",
  "optiona": "The V8 engine's garbage collector is disabled by default in production",
  "optionb": "Large objects are being held in closures, preventing garbage collection",
  "optionc": "JavaScript automatically clears memory every 60 seconds",
  "optiond": "The heap size is too large, causing collection delays",
  "correctanswer": "B",
  "difficulty": "hard",
  "rationale": "Option B is correct: closures maintain references to variables in their scope, preventing garbage collection even when objects are no longer needed elsewhere. Option A is false (GC is always active). Option C is false (no automatic 60s cycle). Option D is backwards (larger heap would delay crashes, not cause them)."
}

✗ **BAD QUESTION EXAMPLE:**
{
  "questiontext": "What is garbage collection?",
  "optiona": "Deleting files",
  "optionb": "Automatic memory management",
  "optionc": "Code optimization",
  "optiond": "Error handling",
  "correctanswer": "B",
  "difficulty": "easy",
  "rationale": "It's the definition."
}
(Too simple, just recall, weak distractors)

---

**OUTPUT FORMAT:**
Return ONLY a valid JSON object. Do NOT include any markdown formatting, explanations, or text outside the JSON.

Required structure:
{
  "analysis": "Your Step 1 analysis of key concepts and potential question areas (2-3 sentences)",
  "questions": [
    {
      "questiontext": "Complete question with scenario/context...",
      "optiona": "Plausible distractor based on misconception A",
      "optionb": "Plausible distractor based on misconception B",
      "optionc": "Correct answer with proper reasoning",
      "optiond": "Plausible distractor based on misconception D",
      "correctanswer": "C",
      "difficulty": "medium",
      "rationale": "Detailed explanation of why the correct answer is right and why each distractor is wrong"
    }
  ]
}

Generate exactly ${numQuestions} questions now.`;
    }
}

module.exports = BaseAIProvider;