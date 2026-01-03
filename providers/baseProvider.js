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
     * Robust JSON Parser - Handles markdown blocks, control characters, and malformed responses
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

        let jsonString = cleaned.substring(firstBrace, lastBrace + 1);

        // DEBUG: Save original for inspection
        const originalJson = jsonString;

        // Step 3: Fix incomplete JSON structure (missing closing brackets)
        // Check if questions array is not properly closed
        if (jsonString.includes('"questions"') && !jsonString.match(/\]\s*\}/)) {
            // Find the last complete question object
            const lastBraceIndex = jsonString.lastIndexOf('}');
            if (lastBraceIndex > 0) {
                // Add closing bracket for questions array and closing brace for main object
                jsonString = jsonString.substring(0, lastBraceIndex + 1) + '\n  ]\n}';
            }
        }

        // Step 4: Pre-emptively fix common JSON errors BEFORE cleaning
        // This is critical - we need to fix structural issues before character-level cleaning
        jsonString = this.fixCommonJSONErrors(jsonString);
        
        // Step 5: Comprehensive cleaning for large responses
        // This handles control characters, unescaped quotes, and malformed strings
        jsonString = this.cleanJSONString(jsonString);
        
        // Step 6: Attempt to parse
        try {
            const parsed = JSON.parse(jsonString);
            return parsed;
        } catch (parseError) {
            // Step 7: Try more aggressive fixes
            try {
                // Additional aggressive fixes for stubborn errors
                let fixed = jsonString;
                
                // Ultra-aggressive: Find the error position and try to fix it
                const errorPosition = parseError.message.match(/position (\d+)/);
                if (errorPosition) {
                    const pos = parseInt(errorPosition[1]);
                    // Check if there's a missing comma around the error position
                    const before = fixed.substring(Math.max(0, pos - 10), pos);
                    const after = fixed.substring(pos, Math.min(fixed.length, pos + 10));
                    
                    // If we see }  { or }\n{ pattern around error, it's a missing comma
                    if (/}\s*$/.test(before) && /^\s*{/.test(after)) {
                        // Insert comma at the position
                        fixed = fixed.substring(0, pos) + ',' + fixed.substring(pos);
                    }
                }
                
                // Also try these patterns globally one more time
                fixed = fixed.replace(/}(\s+){/g, '},\n{');
                fixed = fixed.replace(/}({)/g, '},$1');
                
                // Try parsing again
                const parsed = JSON.parse(fixed);
                console.warn('⚠ JSON required aggressive error correction - AI response had formatting issues');
                return parsed;
            } catch (secondError) {
                // Provide detailed error for debugging
                const errorPosition = parseError.message.match(/position (\d+)/);
                const pos = errorPosition ? parseInt(errorPosition[1]) : 0;
                const contextStart = Math.max(0, pos - 100);
                const contextEnd = Math.min(jsonString.length, pos + 100);
                const context = jsonString.substring(contextStart, contextEnd);
                
                // DEBUG: Save the problematic JSON to a file for inspection
                const fs = require('fs');
                const debugPath = `debug-json-error-${Date.now()}.txt`;
                fs.writeFileSync(debugPath, `ORIGINAL:\n${originalJson}\n\nAFTER FIXES:\n${jsonString}\n\nERROR:\n${parseError.message}\n\nCONTEXT:\n${context}`);
                console.error(`❌ JSON parsing failed. Debug info saved to: ${debugPath}`);
                
                throw new Error(
                    `JSON Parse Error: ${parseError.message}\n` +
                    `Context around error: ...${context}...`
                );
            }
        }
    }

    /**
     * Sleep utility for retry logic and rate limiting
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clean AI response to extract JSON by removing markdown code blocks
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
     * Clean JSON string by handling control characters and escape sequences
     * @param {string} jsonString - Raw JSON string
     * @returns {string} - Cleaned JSON string
     */
    cleanJSONString(jsonString) {
        let result = '';
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < jsonString.length; i++) {
            const char = jsonString[i];
            const charCode = char.charCodeAt(0);
            
            // Handle escape sequences
            if (escapeNext) {
                result += char;
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                result += char;
                escapeNext = true;
                continue;
            }
            
            // Track if we're inside a string
            if (char === '"') {
                inString = !inString;
                result += char;
                continue;
            }
            
            // If we're inside a string, handle control characters
            if (inString) {
                // Control characters (0x00-0x1F) need to be escaped or removed
                if (charCode < 0x20) {
                    switch (char) {
                        case '\n':
                            result += '\\n';
                            break;
                        case '\r':
                            result += '\\r';
                            break;
                        case '\t':
                            result += '\\t';
                            break;
                        case '\b':
                            result += '\\b';
                            break;
                        case '\f':
                            result += '\\f';
                            break;
                        default:
                            // Remove other control characters
                            break;
                    }
                } else {
                    result += char;
                }
            } else {
                // Outside strings, keep everything except problematic control chars
                if (charCode >= 0x20 || char === '\n' || char === '\r' || char === '\t' || char === ' ') {
                    result += char;
                }
            }
        }
        
        return result;
    }

    /**
     * Fix common JSON errors like trailing commas, unescaped quotes, etc.
     * @param {string} jsonString - Malformed JSON string
     * @returns {string} - Fixed JSON string
     */
    fixCommonJSONErrors(jsonString) {
        let fixed = jsonString;
        
        // CRITICAL FIX: Add missing commas between array elements
        // Pattern: }\n    { or }  { (closing brace, whitespace, opening brace)
        // This is the most common AI error - missing commas in arrays
        fixed = fixed.replace(/}(\s+){/g, '},\n{');
        
        // Fix missing commas after closing brace before opening brace (no whitespace)
        fixed = fixed.replace(/}({)/g, '},$1');
        
        // Fix missing commas between properties (common AI error)
        fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
        
        // Fix missing commas after property values before next property
        // Pattern: "value"\n    "nextProp": becomes "value",\n    "nextProp":
        fixed = fixed.replace(/"(\s*\n\s*)"(\w+)":/g, '",$1"$2":');
        
        // Remove trailing commas before closing braces/brackets
        fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
        
        // Remove any remaining control characters
        fixed = fixed.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');
        
        return fixed;
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
            try {
                parsedResponse = JSON.parse(response);
            } catch (error) {
                throw new Error(`Failed to parse JSON response: ${error.message}`);
            }
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
            if (!['easy', 'medium', 'hard', 'mixed'].includes(standardized.difficulty)) {
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
            difficulty = 'mixed',
            distributionPlan = null
        } = options;

        // Handle object input (text + images)
        let sourceText = text;
        if (typeof text === 'object' && text !== null) {
            if (text.text) {
                sourceText = text.text;
            } else {
                sourceText = JSON.stringify(text); // Fallback
            }
        }

        let promptInstructions = '';
        let promptDifficulty = difficulty;

        if (distributionPlan && distributionPlan.breakdown) {
            // Advanced Distribution Mode
            promptInstructions = `\n        **DISTRIBUTION REQUIREMENTS (STRICT):**\n        You must generate exactly ${numQuestions} questions according to this breakdown:\n`;
            
            distributionPlan.breakdown.forEach(item => {
                promptInstructions += `        - ${item.count} questions: Difficulty [${item.difficulty.toUpperCase()}], Bloom Level [${item.bloomLevel.toUpperCase()}]\n`;
            });

            promptInstructions += `\n        **BLOOM DEFINITIONS FOR REFERENCE:**\n`;
            
            // Collect unique bloom levels
            const uniqueBlooms = [...new Set(distributionPlan.breakdown.map(item => item.bloomLevel))];
            uniqueBlooms.forEach(level => {
                 const info = this.getBloomInstructions(level).replace('Ensure all questions target this cognitive level specifically.', ''); // remove constraint
                 promptInstructions += `        ${info}\n`;
            });
            
            promptDifficulty = 'VARIES (See Distribution Requirements)';
        } else {
            // Standard Mode
            promptInstructions = this.getBloomInstructions(bloomLevel);
        }

        return `You are an Expert Instructional Designer and Assessment Specialist with expertise in cognitive science and learning theory.

        Your task is to create ${numQuestions} high-quality multiple choice questions that test deep understanding, NOT simple recall.

        ${promptInstructions}

        **SOURCE TEXT:**
        ${sourceText}

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
        - Aligns with the difficulty level: ${promptDifficulty}

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
            "difficulty": "${promptDifficulty === 'VARIES (See Distribution Requirements)' ? 'easy|medium|hard' : promptDifficulty}",
            "cognitive_level": "remember|understand|apply|analyze|evaluate|create",
            "rationale": "Detailed explanation of why the correct answer is right and why each distractor is wrong"
            }
        ]
        }

        Generate exactly ${numQuestions} questions now.`;
    }
}

module.exports = BaseAIProvider;