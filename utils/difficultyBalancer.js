/**
 * Difficulty Distribution Balancer
 * Ensures proper difficulty distribution in question sets
 */
class DifficultyBalancer {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.targetDistribution = config.targetDistribution || {
            easy: 0.30,    // 30%
            medium: 0.40,  // 40%
            hard: 0.30     // 30%
        };
        this.tolerance = config.tolerance || 0.10; // 10% tolerance
        this.maxRetries = config.maxRetries || 2;
    }

    /**
     * Calculate current difficulty distribution
     * @param {Array} questions - Questions to analyze
     * @returns {Object} - Distribution statistics
     */
    calculateDistribution(questions) {
        if (!questions || questions.length === 0) {
            return {
                easy: 0,
                medium: 0,
                hard: 0,
                total: 0,
                percentages: { easy: 0, medium: 0, hard: 0 }
            };
        }

        const counts = {
            easy: 0,
            medium: 0,
            hard: 0
        };

        questions.forEach(q => {
            const difficulty = (q.difficulty || 'medium').toLowerCase();
            if (counts.hasOwnProperty(difficulty)) {
                counts[difficulty]++;
            } else {
                counts.medium++; // Default to medium if unknown
            }
        });

        const total = questions.length;
        const percentages = {
            easy: total > 0 ? counts.easy / total : 0,
            medium: total > 0 ? counts.medium / total : 0,
            hard: total > 0 ? counts.hard / total : 0
        };

        return {
            ...counts,
            total,
            percentages
        };
    }

    /**
     * Check if distribution is balanced
     * @param {Object} distribution - Current distribution
     * @param {Object} target - Target distribution
     * @returns {Object} - Balance check result
     */
    isBalanced(distribution, target = null) {
        const targetDist = target || this.targetDistribution;
        const current = distribution.percentages;

        const deviations = {
            easy: Math.abs(current.easy - targetDist.easy),
            medium: Math.abs(current.medium - targetDist.medium),
            hard: Math.abs(current.hard - targetDist.hard)
        };

        const maxDeviation = Math.max(...Object.values(deviations));
        const isBalanced = maxDeviation <= this.tolerance;

        return {
            isBalanced,
            maxDeviation: maxDeviation.toFixed(3),
            deviations,
            current: {
                easy: (current.easy * 100).toFixed(1) + '%',
                medium: (current.medium * 100).toFixed(1) + '%',
                hard: (current.hard * 100).toFixed(1) + '%'
            },
            target: {
                easy: (targetDist.easy * 100).toFixed(1) + '%',
                medium: (targetDist.medium * 100).toFixed(1) + '%',
                hard: (targetDist.hard * 100).toFixed(1) + '%'
            }
        };
    }

    /**
     * Calculate how many questions of each difficulty are needed
     * @param {number} totalQuestions - Total questions needed
     * @param {Object} currentDistribution - Current distribution
     * @returns {Object} - Questions needed per difficulty
     */
    calculateNeeded(totalQuestions, currentDistribution = null) {
        const target = {
            easy: Math.round(totalQuestions * this.targetDistribution.easy),
            medium: Math.round(totalQuestions * this.targetDistribution.medium),
            hard: Math.round(totalQuestions * this.targetDistribution.hard)
        };

        // Adjust for rounding errors
        const sum = target.easy + target.medium + target.hard;
        if (sum !== totalQuestions) {
            const diff = totalQuestions - sum;
            target.medium += diff; // Add/subtract from medium
        }

        if (currentDistribution) {
            const current = currentDistribution;
            return {
                easy: Math.max(0, target.easy - current.easy),
                medium: Math.max(0, target.medium - current.medium),
                hard: Math.max(0, target.hard - current.hard),
                target,
                current
            };
        }

        return {
            easy: target.easy,
            medium: target.medium,
            hard: target.hard,
            target
        };
    }

    /**
     * Balance questions by difficulty
     * @param {Array} questions - Questions to balance
     * @param {Function} regenerateFn - Function to regenerate questions
     * @param {number} attempt - Current attempt number
     * @returns {Promise<Object>} - Balanced questions
     */
    async balance(questions, regenerateFn = null, attempt = 1) {
        if (!this.enabled || questions.length === 0) {
            return {
                questions,
                balanced: true,
                distribution: this.calculateDistribution(questions),
                attempts: 0
            };
        }

        console.log(`Balancing difficulty distribution (attempt ${attempt}/${this.maxRetries + 1})...`);

        const distribution = this.calculateDistribution(questions);
        const balanceCheck = this.isBalanced(distribution);

        console.log(`Current: Easy ${balanceCheck.current.easy}, Medium ${balanceCheck.current.medium}, Hard ${balanceCheck.current.hard}`);
        console.log(`Target:  Easy ${balanceCheck.target.easy}, Medium ${balanceCheck.target.medium}, Hard ${balanceCheck.target.hard}`);

        if (balanceCheck.isBalanced) {
            console.log('✓ Distribution is balanced');
            return {
                questions,
                balanced: true,
                distribution,
                balanceCheck,
                attempts: attempt
            };
        }

        console.log(`⚠ Distribution imbalanced (max deviation: ${(parseFloat(balanceCheck.maxDeviation) * 100).toFixed(1)}%)`);

        // If we can't regenerate or reached max retries, return what we have
        if (!regenerateFn || attempt > this.maxRetries) {
            console.log('⚠ Cannot rebalance - returning current questions');
            return {
                questions,
                balanced: false,
                distribution,
                balanceCheck,
                attempts: attempt,
                reason: !regenerateFn ? 'no_regenerate_function' : 'max_retries_reached'
            };
        }

        // Calculate what we need
        const needed = this.calculateNeeded(questions.length, distribution);
        
        // Determine which difficulties to regenerate
        const toRegenerate = [];
        if (needed.easy > 0) toRegenerate.push({ difficulty: 'easy', count: needed.easy });
        if (needed.medium > 0) toRegenerate.push({ difficulty: 'medium', count: needed.medium });
        if (needed.hard > 0) toRegenerate.push({ difficulty: 'hard', count: needed.hard });

        if (toRegenerate.length === 0) {
            // We have too many of everything - need to remove some
            return await this.balanceByRemoval(questions, distribution);
        }

        console.log(`Regenerating: ${toRegenerate.map(t => `${t.count} ${t.difficulty}`).join(', ')}`);

        try {
            // Regenerate needed questions
            const newQuestions = [];
            for (const { difficulty, count } of toRegenerate) {
                const generated = await regenerateFn(count, difficulty);
                newQuestions.push(...generated);
            }

            // Remove excess questions from over-represented difficulties
            const balanced = this.removeExcess(questions, distribution, needed);
            
            // Combine and recursively balance
            const combined = [...balanced, ...newQuestions];
            return await this.balance(combined, regenerateFn, attempt + 1);

        } catch (error) {
            console.warn('Rebalancing failed:', error.message);
            return {
                questions,
                balanced: false,
                distribution,
                balanceCheck,
                attempts: attempt,
                error: error.message
            };
        }
    }

    /**
     * Balance by removing excess questions
     * @param {Array} questions - Questions
     * @param {Object} distribution - Current distribution
     * @returns {Object} - Balanced result
     */
    async balanceByRemoval(questions, distribution) {
        console.log('Balancing by removing excess questions...');

        const target = this.calculateNeeded(questions.length);
        const toKeep = {
            easy: [],
            medium: [],
            hard: []
        };

        // Group questions by difficulty
        questions.forEach(q => {
            const difficulty = (q.difficulty || 'medium').toLowerCase();
            if (toKeep[difficulty]) {
                toKeep[difficulty].push(q);
            }
        });

        // Keep only target amount from each difficulty
        const balanced = [
            ...toKeep.easy.slice(0, target.easy),
            ...toKeep.medium.slice(0, target.medium),
            ...toKeep.hard.slice(0, target.hard)
        ];

        const newDistribution = this.calculateDistribution(balanced);
        const balanceCheck = this.isBalanced(newDistribution);

        console.log(`✓ Removed ${questions.length - balanced.length} excess questions`);

        return {
            questions: balanced,
            balanced: balanceCheck.isBalanced,
            distribution: newDistribution,
            balanceCheck,
            removedCount: questions.length - balanced.length
        };
    }

    /**
     * Remove excess questions from over-represented difficulties
     * @param {Array} questions - All questions
     * @param {Object} distribution - Current distribution
     * @param {Object} needed - Needed counts
     * @returns {Array} - Questions with excess removed
     */
    removeExcess(questions, distribution, needed) {
        const byDifficulty = {
            easy: [],
            medium: [],
            hard: []
        };

        // Group by difficulty
        questions.forEach(q => {
            const difficulty = (q.difficulty || 'medium').toLowerCase();
            if (byDifficulty[difficulty]) {
                byDifficulty[difficulty].push(q);
            }
        });

        // Keep target amounts
        const result = [];
        ['easy', 'medium', 'hard'].forEach(difficulty => {
            const target = needed.target[difficulty];
            const current = byDifficulty[difficulty];
            
            if (current.length > target) {
                // Keep only target amount (keep best quality if possible)
                result.push(...current.slice(0, target));
            } else {
                // Keep all
                result.push(...current);
            }
        });

        return result;
    }

    /**
     * Get target distribution for a specific difficulty setting
     * @param {string} difficulty - Difficulty setting ('easy', 'medium', 'hard', 'mixed')
     * @returns {Object} - Target distribution
     */
    getTargetDistribution(difficulty) {
        if (difficulty === 'mixed') {
            return this.targetDistribution;
        }

        // For specific difficulty, 100% of that difficulty
        return {
            easy: difficulty === 'easy' ? 1.0 : 0.0,
            medium: difficulty === 'medium' ? 1.0 : 0.0,
            hard: difficulty === 'hard' ? 1.0 : 0.0
        };
    }

    /**
     * Validate and adjust difficulty values in questions
     * @param {Array} questions - Questions to validate
     * @returns {Array} - Questions with validated difficulties
     */
    validateDifficulties(questions) {
        return questions.map(q => {
            const difficulty = (q.difficulty || 'medium').toLowerCase();
            
            if (!['easy', 'medium', 'hard'].includes(difficulty)) {
                return { ...q, difficulty: 'medium' };
            }
            
            return q;
        });
    }

    /**
     * Get configuration
     * @returns {Object}
     */
    getConfig() {
        return {
            enabled: this.enabled,
            targetDistribution: this.targetDistribution,
            tolerance: this.tolerance,
            maxRetries: this.maxRetries
        };
    }

    /**
     * Get statistics for a set of questions
     * @param {Array} questions - Questions
     * @returns {Object} - Statistics
     */
    getStatistics(questions) {
        const distribution = this.calculateDistribution(questions);
        const balanceCheck = this.isBalanced(distribution);

        return {
            total: distribution.total,
            counts: {
                easy: distribution.easy,
                medium: distribution.medium,
                hard: distribution.hard
            },
            percentages: distribution.percentages,
            balanced: balanceCheck.isBalanced,
            maxDeviation: balanceCheck.maxDeviation,
            target: this.targetDistribution
        };
    }
}

module.exports = DifficultyBalancer;
