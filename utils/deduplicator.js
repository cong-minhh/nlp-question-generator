const TextSimilarity = require('./textSimilarity');

/**
 * Question Deduplication Engine
 * Detects and removes duplicate or highly similar questions
 */
class Deduplicator {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.threshold = config.threshold || 85; // Similarity threshold (0-100)
        this.compareOptions = config.compareOptions !== false; // Also compare answer options
        this.keepBest = config.keepBest !== false; // Keep highest quality version
    }

    /**
     * Calculate similarity between two questions
     * @param {Object} q1 - First question
     * @param {Object} q2 - Second question
     * @returns {number} - Similarity score (0-100)
     */
    calculateQuestionSimilarity(q1, q2) {
        // Compare question text
        const questionSimilarity = TextSimilarity.combinedSimilarity(
            q1.questiontext,
            q2.questiontext
        );

        // If questions are very different, no need to check options
        if (questionSimilarity < 50) {
            return questionSimilarity;
        }

        // If comparing options is enabled, also check answer similarity
        if (this.compareOptions) {
            const options1 = [q1.optiona, q1.optionb, q1.optionc, q1.optiond].join(' ');
            const options2 = [q2.optiona, q2.optionb, q2.optionc, q2.optiond].join(' ');
            
            const optionsSimilarity = TextSimilarity.combinedSimilarity(options1, options2);
            
            // Weighted average: question text is more important
            return questionSimilarity * 0.7 + optionsSimilarity * 0.3;
        }

        return questionSimilarity;
    }

    /**
     * Find duplicate questions
     * @param {Array} questions - Questions to check
     * @returns {Array} - Array of duplicate groups
     */
    findDuplicates(questions) {
        const duplicateGroups = [];
        const processed = new Set();

        questions.forEach((q1, i) => {
            if (processed.has(i)) return;

            const group = {
                indices: [i],
                questions: [q1],
                similarities: []
            };

            questions.forEach((q2, j) => {
                if (i !== j && !processed.has(j)) {
                    const similarity = this.calculateQuestionSimilarity(q1, q2);
                    
                    if (similarity >= this.threshold) {
                        group.indices.push(j);
                        group.questions.push(q2);
                        group.similarities.push({
                            index: j,
                            similarity: similarity.toFixed(2)
                        });
                        processed.add(j);
                    }
                }
            });

            // Only add if duplicates were found
            if (group.indices.length > 1) {
                duplicateGroups.push(group);
            }

            processed.add(i);
        });

        return duplicateGroups;
    }

    /**
     * Select best question from a group of duplicates
     * @param {Array} questions - Duplicate questions
     * @param {Array} scores - Quality scores (optional)
     * @returns {Object} - Best question with metadata
     */
    selectBest(questions, scores = null) {
        if (questions.length === 1) {
            return {
                question: questions[0],
                index: 0,
                reason: 'only_one'
            };
        }

        // If we have quality scores, use them
        if (scores && scores.length === questions.length) {
            let bestIndex = 0;
            let bestScore = scores[0]?.score || 0;

            scores.forEach((score, index) => {
                const currentScore = score?.score || 0;
                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestIndex = index;
                }
            });

            return {
                question: questions[bestIndex],
                index: bestIndex,
                reason: 'highest_quality_score',
                score: bestScore
            };
        }

        // Otherwise, use heuristics
        let bestIndex = 0;
        let bestScore = this.scoreQuestionHeuristic(questions[0]);

        questions.forEach((question, index) => {
            const score = this.scoreQuestionHeuristic(question);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });

        return {
            question: questions[bestIndex],
            index: bestIndex,
            reason: 'heuristic_score',
            score: bestScore
        };
    }

    /**
     * Score question using simple heuristics
     * @param {Object} question - Question to score
     * @returns {number} - Heuristic score
     */
    scoreQuestionHeuristic(question) {
        let score = 0;

        // Longer questions are often more detailed
        score += Math.min(question.questiontext.length / 10, 20);

        // Questions with rationale are better
        if (question.rationale && question.rationale.length > 50) {
            score += 20;
        }

        // Longer options suggest more thought
        const avgOptionLength = (
            question.optiona.length +
            question.optionb.length +
            question.optionc.length +
            question.optiond.length
        ) / 4;
        score += Math.min(avgOptionLength / 5, 20);

        // Hard questions are often more valuable
        if (question.difficulty === 'hard') {
            score += 10;
        } else if (question.difficulty === 'medium') {
            score += 5;
        }

        return score;
    }

    /**
     * Remove duplicates from questions
     * @param {Array} questions - Questions to deduplicate
     * @param {Array} scores - Quality scores (optional)
     * @returns {Object} - Deduplicated results
     */
    deduplicate(questions, scores = null) {
        if (!this.enabled || questions.length <= 1) {
            return {
                questions,
                duplicatesFound: 0,
                duplicatesRemoved: 0,
                kept: questions.length,
                groups: []
            };
        }

        console.log(`Checking ${questions.length} questions for duplicates (threshold: ${this.threshold}%)...`);

        const duplicateGroups = this.findDuplicates(questions);

        if (duplicateGroups.length === 0) {
            console.log('✓ No duplicates found');
            return {
                questions,
                duplicatesFound: 0,
                duplicatesRemoved: 0,
                kept: questions.length,
                groups: []
            };
        }

        console.log(`⚠ Found ${duplicateGroups.length} duplicate groups`);

        // Build set of indices to keep
        const indicesToKeep = new Set();
        const removalInfo = [];

        // First, mark all non-duplicate questions
        questions.forEach((_, index) => {
            indicesToKeep.add(index);
        });

        // Process each duplicate group
        duplicateGroups.forEach((group, groupIndex) => {
            const groupScores = group.indices.map(i => scores?.[i] || null);
            const best = this.selectBest(group.questions, groupScores);

            // Keep the best one, remove others
            const bestGlobalIndex = group.indices[best.index];
            
            group.indices.forEach((index, localIndex) => {
                if (localIndex !== best.index) {
                    indicesToKeep.delete(index);
                    removalInfo.push({
                        removed: index,
                        keptInstead: bestGlobalIndex,
                        similarity: group.similarities.find(s => s.index === index)?.similarity || 'N/A',
                        reason: best.reason
                    });
                }
            });

            console.log(`Group ${groupIndex + 1}: Kept question ${bestGlobalIndex}, removed ${group.indices.length - 1} duplicates`);
        });

        // Filter questions
        const deduplicatedQuestions = questions.filter((_, index) => indicesToKeep.has(index));
        const deduplicatedScores = scores ? scores.filter((_, index) => indicesToKeep.has(index)) : null;

        const duplicatesRemoved = questions.length - deduplicatedQuestions.length;
        console.log(`✓ Removed ${duplicatesRemoved} duplicates, kept ${deduplicatedQuestions.length} unique questions`);

        return {
            questions: deduplicatedQuestions,
            scores: deduplicatedScores,
            duplicatesFound: duplicateGroups.reduce((sum, g) => sum + g.indices.length, 0),
            duplicatesRemoved,
            kept: deduplicatedQuestions.length,
            groups: duplicateGroups.map(g => ({
                count: g.indices.length,
                indices: g.indices,
                similarities: g.similarities
            })),
            removalInfo
        };
    }

    /**
     * Check if two specific questions are duplicates
     * @param {Object} q1 - First question
     * @param {Object} q2 - Second question
     * @returns {Object} - Duplicate check result
     */
    areDuplicates(q1, q2) {
        const similarity = this.calculateQuestionSimilarity(q1, q2);
        
        return {
            isDuplicate: similarity >= this.threshold,
            similarity: similarity.toFixed(2),
            threshold: this.threshold
        };
    }

    /**
     * Get deduplication statistics
     * @param {Object} result - Deduplication result
     * @returns {Object} - Statistics
     */
    getStatistics(result) {
        return {
            originalCount: result.kept + result.duplicatesRemoved,
            finalCount: result.kept,
            duplicatesFound: result.duplicatesFound,
            duplicatesRemoved: result.duplicatesRemoved,
            duplicateRate: ((result.duplicatesRemoved / (result.kept + result.duplicatesRemoved)) * 100).toFixed(1) + '%',
            groups: result.groups.length
        };
    }

    /**
     * Get configuration
     * @returns {Object}
     */
    getConfig() {
        return {
            enabled: this.enabled,
            threshold: this.threshold,
            compareOptions: this.compareOptions,
            keepBest: this.keepBest
        };
    }
}

module.exports = Deduplicator;
