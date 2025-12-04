const CostTracker = require('./costTracker');

/**
 * Smart Provider Router
 * Intelligently selects the best provider based on criteria
 */
class ProviderRouter {
    constructor(config = {}) {
        this.costTracker = new CostTracker();
        this.routingStrategy = config.routingStrategy || 'balanced'; // cost, speed, quality, balanced
        this.providerHealth = {}; // Track provider health
        this.enabled = config.enabled !== false;
    }

    /**
     * Select best provider based on routing strategy
     * @param {Array} availableProviders - List of available provider names
     * @param {Object} context - Request context
     * @returns {string} - Selected provider name
     */
    selectProvider(availableProviders, context = {}) {
        if (!this.enabled || availableProviders.length === 0) {
            return availableProviders[0] || null;
        }

        if (availableProviders.length === 1) {
            return availableProviders[0];
        }

        // Filter out unhealthy providers
        const healthyProviders = this.filterHealthyProviders(availableProviders);
        
        if (healthyProviders.length === 0) {
            console.warn('⚠️  No healthy providers available, using any available');
            return availableProviders[0];
        }

        // Select based on strategy
        switch (this.routingStrategy) {
            case 'cost':
                return this.selectByCost(healthyProviders, context);
            
            case 'speed':
                return this.selectBySpeed(healthyProviders, context);
            
            case 'quality':
                return this.selectByQuality(healthyProviders, context);
            
            case 'balanced':
                return this.selectBalanced(healthyProviders, context);
            
            case 'round-robin':
                return this.selectRoundRobin(healthyProviders);
            
            default:
                return healthyProviders[0];
        }
    }

    /**
     * Select provider by cost (cheapest)
     * @param {Array} providers - Available providers
     * @param {Object} context - Request context
     * @returns {string}
     */
    selectByCost(providers, context) {
        const inputText = context.text || '';
        const numQuestions = context.numQuestions || 10;

        const costs = this.costTracker.compareCosts(inputText, numQuestions, providers);
        const selected = costs[0].provider;

        console.log(`Selected ${selected} (cheapest: $${costs[0].totalCost.toFixed(6)})`);
        return selected;
    }

    /**
     * Select provider by speed (fastest)
     * @param {Array} providers - Available providers
     * @returns {string}
     */
    selectBySpeed(providers) {
        const selected = this.costTracker.getFastestProvider(providers);
        console.log(`Selected ${selected} (fastest)`);
        return selected;
    }

    /**
     * Select provider by quality (best)
     * @param {Array} providers - Available providers
     * @returns {string}
     */
    selectByQuality(providers) {
        const selected = this.costTracker.getBestQualityProvider(providers);
        console.log(`Selected ${selected} (best quality)`);
        return selected;
    }

    /**
     * Select provider with balanced approach
     * @param {Array} providers - Available providers
     * @param {Object} context - Request context
     * @returns {string}
     */
    selectBalanced(providers, context) {
        const inputText = context.text || '';
        const numQuestions = context.numQuestions || 10;

        // Score each provider based on multiple factors
        const scores = providers.map(provider => {
            const cost = this.costTracker.calculateCost(provider, inputText, numQuestions);
            const info = this.costTracker.getProviderInfo(provider);
            const health = this.getProviderHealth(provider);

            // Normalize scores (0-100)
            const costScore = this.normalizeCostScore(cost.totalCost);
            const speedScore = this.normalizeSpeedScore(info?.speed);
            const qualityScore = this.normalizeQualityScore(info?.quality);
            const healthScore = health.successRate * 100;

            // Weighted average
            const totalScore = (
                costScore * 0.3 +      // 30% weight on cost
                speedScore * 0.25 +    // 25% weight on speed
                qualityScore * 0.25 +  // 25% weight on quality
                healthScore * 0.2      // 20% weight on health
            );

            return {
                provider,
                totalScore,
                costScore,
                speedScore,
                qualityScore,
                healthScore
            };
        });

        // Sort by total score (highest first)
        scores.sort((a, b) => b.totalScore - a.totalScore);
        const selected = scores[0].provider;

        console.log(`Selected ${selected} (balanced score: ${scores[0].totalScore.toFixed(1)})`);
        return selected;
    }

    /**
     * Select provider using round-robin
     * @param {Array} providers - Available providers
     * @returns {string}
     */
    selectRoundRobin(providers) {
        if (!this.roundRobinIndex) {
            this.roundRobinIndex = 0;
        }

        const selected = providers[this.roundRobinIndex % providers.length];
        this.roundRobinIndex++;

        console.log(`Selected ${selected} (round-robin)`);
        return selected;
    }

    /**
     * Normalize cost score (lower cost = higher score)
     * @param {number} cost - Cost in dollars
     * @returns {number} - Score 0-100
     */
    normalizeCostScore(cost) {
        // Assume max cost of $0.01 per request
        const maxCost = 0.01;
        const normalized = Math.max(0, 1 - (cost / maxCost));
        return normalized * 100;
    }

    /**
     * Normalize speed score
     * @param {string} speed - Speed rating
     * @returns {number} - Score 0-100
     */
    normalizeSpeedScore(speed) {
        const speedScores = {
            fast: 100,
            medium: 60,
            slow: 30
        };
        return speedScores[speed] || 50;
    }

    /**
     * Normalize quality score
     * @param {string} quality - Quality rating
     * @returns {number} - Score 0-100
     */
    normalizeQualityScore(quality) {
        const qualityScores = {
            excellent: 100,
            good: 75,
            fair: 50
        };
        return qualityScores[quality] || 50;
    }

    /**
     * Filter out unhealthy providers
     * @param {Array} providers - All providers
     * @returns {Array} - Healthy providers
     */
    filterHealthyProviders(providers) {
        return providers.filter(provider => {
            const health = this.getProviderHealth(provider);
            return health.successRate >= 0.5; // At least 50% success rate
        });
    }

    /**
     * Get provider health status
     * @param {string} provider - Provider name
     * @returns {Object} - Health status
     */
    getProviderHealth(provider) {
        if (!this.providerHealth[provider]) {
            this.providerHealth[provider] = {
                requests: 0,
                successes: 0,
                failures: 0,
                lastSuccess: null,
                lastFailure: null,
                successRate: 1.0 // Start optimistic
            };
        }

        return this.providerHealth[provider];
    }

    /**
     * Record successful request
     * @param {string} provider - Provider name
     * @param {Object} cost - Cost information
     */
    recordSuccess(provider, cost = {}) {
        const health = this.getProviderHealth(provider);
        health.requests++;
        health.successes++;
        health.lastSuccess = Date.now();
        health.successRate = health.successes / health.requests;

        // Track cost
        if (cost.totalCost) {
            this.costTracker.trackUsage(provider, cost);
        }
    }

    /**
     * Record failed request
     * @param {string} provider - Provider name
     * @param {Error} error - Error object
     */
    recordFailure(provider, error) {
        const health = this.getProviderHealth(provider);
        health.requests++;
        health.failures++;
        health.lastFailure = Date.now();
        health.successRate = health.successes / health.requests;

        console.warn(`⚠️  Provider ${provider} failure: ${error.message}`);
    }

    /**
     * Get routing statistics
     * @returns {Object} - Statistics
     */
    getStats() {
        const costStats = this.costTracker.getUsageStats();
        
        return {
            strategy: this.routingStrategy,
            enabled: this.enabled,
            providerHealth: this.providerHealth,
            costs: costStats
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.providerHealth = {};
        this.costTracker.resetUsage();
        this.roundRobinIndex = 0;
    }

    /**
     * Set routing strategy
     * @param {string} strategy - New strategy
     */
    setStrategy(strategy) {
        const validStrategies = ['cost', 'speed', 'quality', 'balanced', 'round-robin'];
        
        if (validStrategies.includes(strategy)) {
            this.routingStrategy = strategy;
            console.log(`✓ Routing strategy set to: ${strategy}`);
        } else {
            console.warn(`⚠️  Invalid strategy: ${strategy}`);
        }
    }

    /**
     * Get configuration
     * @returns {Object}
     */
    getConfig() {
        return {
            enabled: this.enabled,
            routingStrategy: this.routingStrategy
        };
    }
}

module.exports = ProviderRouter;
