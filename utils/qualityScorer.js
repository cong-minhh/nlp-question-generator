const ScoringPrompts = require('./scoringPrompts');

/**
 * Question Quality Scoring Engine
 * Evaluates and scores generated questions for quality
 */
class QualityScorer {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.minScore = config.minScore || 6;
        this.maxRetries = config.maxRetries || 2;
        this.batchSize = config.batchSize || 5;
        this.scorerProvider = config.scorerProvider || null; // Provider instance for scoring
        this.useQuickScore = config.useQuickScore || false;
    }

    /**
     * Score a single question
     * @param {Object} question - Question to score
     * @returns {Promise<Object>} - Score result
     */
    async scoreQuestion(question) {
        if (!this.enabled || !this.scorerProvider) {
            return {
                score: 10,
                passed: true,
                skipped: true
            };
        }

        try {
            const prompt = this.useQuickScore
                ? ScoringPrompts.getQuickScorePrompt(question)
                : ScoringPrompts.getSingleQuestionPrompt(question);

            // Call provider directly to get raw text response
            const response = await this.scorerProvider.generateQuestions(prompt, {
                numQuestions: 1,
                noCache: true,
                qualityCheck: false, // Don't score the scoring request!
                deduplicate: false
            });

            // The response will be in the questions array, but it's actually score data
            // Try to extract JSON from the response
            let scoreData;
            if (response.questions && response.questions.length > 0) {
                const firstQuestion = response.questions[0];
                // The AI might put the JSON in questiontext or we need to parse the whole thing
                const textToParse = firstQuestion.questiontext || JSON.stringify(firstQuestion);
                scoreData = this.extractJSON(textToParse);
            } else {
                throw new Error('No response from scorer');
            }

            if (!scoreData || typeof scoreData.score === 'undefined') {
                // If we can't get a proper score, pass the question
                return {
                    score: this.minScore,
                    passed: true,
                    skipped: true,
                    reason: 'parse_error'
                };
            }

            return {
                score: scoreData.score || 0,
                clarity: scoreData.clarity,
                distractors: scoreData.distractors,
                relevance: scoreData.relevance,
                correctness: scoreData.correctness,
                issues: scoreData.issues || [],
                strengths: scoreData.strengths || [],
                recommendation: scoreData.recommendation || 'reject',
                passed: scoreData.score >= this.minScore
            };
        } catch (error) {
            // On error, pass the question (don't block generation)
            // Only log in development
            if (process.env.NODE_ENV === 'development') {
                console.warn('Scoring failed:', error.message);
            }
            return {
                score: this.minScore,
                passed: true,
                error: error.message,
                skipped: true
            };
        }
    }

    /**
     * Score multiple questions in batch
     * @param {Array} questions - Questions to score
     * @returns {Promise<Array>} - Array of score results
     */
    async scoreQuestions(questions) {
        if (!this.enabled || !this.scorerProvider || questions.length === 0) {
            return questions.map(() => ({
                score: 10,
                passed: true,
                skipped: true
            }));
        }

        const scores = [];

        // Process in batches
        for (let i = 0; i < questions.length; i += this.batchSize) {
            const batch = questions.slice(i, i + this.batchSize);

            try {
                if (batch.length === 1) {
                    // Single question
                    const score = await this.scoreQuestion(batch[0]);
                    scores.push(score);
                } else {
                    // Batch scoring
                    const batchScores = await this.scoreBatch(batch);
                    scores.push(...batchScores);
                }
            } catch (error) {
                console.warn(`Batch scoring failed for questions ${i}-${i + batch.length}:`, error.message);
                // Pass all questions in failed batch
                batch.forEach(() => {
                    scores.push({
                        score: this.minScore,
                        passed: true,
                        error: error.message
                    });
                });
            }
        }

        return scores;
    }

    /**
     * Score a batch of questions together
     * @param {Array} questions - Batch of questions
     * @returns {Promise<Array>} - Scores
     */
    async scoreBatch(questions) {
        try {
            const prompt = ScoringPrompts.getBatchScoringPrompt(questions);

            const response = await this.scorerProvider.generateQuestions(prompt, {
                numQuestions: 1,
                noCache: true,
                qualityCheck: false,
                deduplicate: false
            });

            const scoreData = this.parseBatchScoreResponse(response);

            return scoreData.scores.map(s => ({
                score: s.score || 0,
                clarity: s.clarity,
                distractors: s.distractors,
                relevance: s.relevance,
                correctness: s.correctness,
                issues: s.issues || [],
                strengths: s.strengths || [],
                recommendation: s.recommendation || 'reject',
                passed: s.score >= this.minScore
            }));
        } catch (error) {
            console.warn('Batch scoring parse error:', error.message);
            // Fall back to individual scoring
            return await Promise.all(questions.map(q => this.scoreQuestion(q)));
        }
    }

    /**
     * Extract JSON from text that might contain other content
     * @param {string} text - Text containing JSON
     * @returns {Object} - Parsed JSON
     */
    extractJSON(text) {
        // First try direct parse
        try {
            return JSON.parse(text);
        } catch {
            // Try to find JSON object in text
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch {
                    // If that fails, try to extract just the score
                    const scoreMatch = text.match(/"score"\s*:\s*(\d+)/);
                    if (scoreMatch) {
                        return {
                            score: parseInt(scoreMatch[1]),
                            recommendation: parseInt(scoreMatch[1]) >= 7 ? 'accept' : 'reject'
                        };
                    }
                }
            }
            throw new Error('Could not extract JSON from response');
        }
    }

    /**
     * Parse score response from AI
     * @param {Object} response - AI response
     * @returns {Object} - Parsed score data
     */
    parseScoreResponse(response) {
        // Try to extract JSON from response
        let scoreData;

        if (response.questions && response.questions.length > 0) {
            // Response is in questions format, try to parse the text
            const firstQuestion = response.questions[0];
            const text = firstQuestion.questiontext || JSON.stringify(firstQuestion);
            scoreData = this.extractJSON(text);
        } else if (typeof response === 'object') {
            scoreData = response;
        } else {
            throw new Error('Invalid score response format');
        }

        return scoreData;
    }

    /**
     * Parse batch score response
     * @param {Object} response - AI response
     * @returns {Object} - Parsed batch scores
     */
    parseBatchScoreResponse(response) {
        const scoreData = this.parseScoreResponse(response);

        if (!scoreData.scores || !Array.isArray(scoreData.scores)) {
            throw new Error('Invalid batch score format');
        }

        return scoreData;
    }

    /**
     * Filter questions based on scores
     * @param {Array} questions - Questions
     * @param {Array} scores - Corresponding scores
     * @returns {Object} - Filtered results
     */
    filterByScore(questions, scores) {
        const accepted = [];
        const rejected = [];
        const needsRevision = [];

        questions.forEach((question, index) => {
            const score = scores[index];

            if (!score || score.skipped) {
                accepted.push({ question, score });
                return;
            }

            if (score.recommendation === 'accept' || score.score >= 7) {
                accepted.push({ question, score });
            } else if (score.recommendation === 'revise' || (score.score >= 5 && score.score < 7)) {
                needsRevision.push({ question, score });
            } else {
                rejected.push({ question, score });
            }
        });

        return {
            accepted: accepted.map(a => a.question),
            rejected: rejected.map(r => ({ question: r.question, score: r.score })),
            needsRevision: needsRevision.map(n => ({ question: n.question, score: n.score })),
            scores: {
                accepted: accepted.map(a => a.score),
                rejected: rejected.map(r => r.score),
                needsRevision: needsRevision.map(n => n.score)
            }
        };
    }

    /**
     * Score and filter questions, regenerating low-quality ones
     * @param {Array} questions - Questions to evaluate
     * @param {Function} regenerateFn - Function to regenerate questions
     * @param {number} attempt - Current attempt number
     * @returns {Promise<Object>} - Filtered and improved questions
     */
    async scoreAndImprove(questions, regenerateFn = null, attempt = 1) {
        if (!this.enabled) {
            return {
                questions,
                allPassed: true,
                scores: questions.map(() => ({ score: 10, passed: true, skipped: true }))
            };
        }

        console.log(`Scoring ${questions.length} questions (attempt ${attempt}/${this.maxRetries + 1})...`);

        const scores = await this.scoreQuestions(questions);
        const filtered = this.filterByScore(questions, scores);

        const avgScore = scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length;
        console.log(`✓ Average score: ${avgScore.toFixed(1)}/10`);
        console.log(`Accepted: ${filtered.accepted.length}, Rejected: ${filtered.rejected.length}, Needs revision: ${filtered.needsRevision.length}`);

        // If we have rejected questions and can retry
        if (filtered.rejected.length > 0 && attempt <= this.maxRetries && regenerateFn) {
            console.log(`Regenerating ${filtered.rejected.length} low-quality questions...`);

            try {
                // Regenerate rejected questions
                const newQuestions = await regenerateFn(filtered.rejected.length);

                // Recursively score new questions
                const improved = await this.scoreAndImprove(
                    newQuestions,
                    regenerateFn,
                    attempt + 1
                );

                // Combine accepted questions with improved ones
                return {
                    questions: [...filtered.accepted, ...improved.questions],
                    allPassed: false,
                    scores: [...filtered.scores.accepted, ...improved.scores],
                    regenerated: filtered.rejected.length,
                    attempts: improved.attempts
                };
            } catch (error) {
                console.warn('Regeneration failed:', error.message);
                // Return what we have
                return {
                    questions: filtered.accepted,
                    allPassed: false,
                    scores: filtered.scores.accepted,
                    regenerationFailed: true
                };
            }
        }

        // Return all questions (accepted + needs revision)
        // We keep "needs revision" questions rather than rejecting them
        const finalQuestions = [...filtered.accepted, ...filtered.needsRevision.map(n => n.question)];
        const finalScores = [...filtered.scores.accepted, ...filtered.scores.needsRevision];

        return {
            questions: finalQuestions,
            allPassed: filtered.rejected.length === 0,
            scores: finalScores,
            rejected: filtered.rejected.length,
            attempts: attempt
        };
    }

    /**
     * Get scoring statistics
     * @param {Array} scores - Array of score objects
     * @returns {Object} - Statistics
     */
    getStatistics(scores) {
        if (!scores || scores.length === 0) {
            return {
                count: 0,
                average: 0,
                min: 0,
                max: 0,
                passed: 0,
                failed: 0
            };
        }

        const validScores = scores.filter(s => s && !s.skipped);
        const scoreValues = validScores.map(s => s.score || 0);

        return {
            count: scores.length,
            average: scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length,
            min: Math.min(...scoreValues),
            max: Math.max(...scoreValues),
            passed: validScores.filter(s => s.passed).length,
            failed: validScores.filter(s => !s.passed).length,
            skipped: scores.filter(s => s && s.skipped).length
        };
    }
}

module.exports = QualityScorer;
