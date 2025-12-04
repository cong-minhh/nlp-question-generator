/**
 * Cost Tracker
 * Tracks and calculates costs for different AI providers
 */
class CostTracker {
    constructor() {
        // Cost per 1K tokens (approximate, as of 2024)
        this.providerCosts = {
            gemini: {
                input: 0.00015,   // Gemini Flash - very cheap
                output: 0.0006,
                speed: 'fast',
                quality: 'good'
            },
            openai: {
                input: 0.0005,    // GPT-3.5 Turbo
                output: 0.0015,
                speed: 'fast',
                quality: 'good'
            },
            anthropic: {
                input: 0.0008,    // Claude Haiku
                output: 0.0024,
                speed: 'fast',
                quality: 'excellent'
            },
            deepseek: {
                input: 0.00014,   // Very cheap
                output: 0.00028,
                speed: 'medium',
                quality: 'good'
            },
            kimi: {
                input: 0.0002,
                output: 0.0006,
                speed: 'fast',
                quality: 'good'
            },
            kimicn: {
                input: 0.0002,
                output: 0.0006,
                speed: 'fast',
                quality: 'good'
            }
        };

        this.usage = {}; // Track usage per provider
    }

    /**
     * Estimate tokens for text
     * @param {string} text - Text to estimate
     * @returns {number} - Estimated tokens
     */
    estimateTokens(text) {
        // Rough estimate: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4);
    }

    /**
     * Calculate cost for a request
     * @param {string} provider - Provider name
     * @param {string} inputText - Input text
     * @param {number} numQuestions - Number of questions
     * @returns {Object} - Cost breakdown
     */
    calculateCost(provider, inputText, numQuestions = 10) {
        const providerCost = this.providerCosts[provider.toLowerCase()];
        
        if (!providerCost) {
            return {
                provider,
                inputCost: 0,
                outputCost: 0,
                totalCost: 0,
                estimated: true,
                error: 'Unknown provider'
            };
        }

        // Estimate input tokens
        const inputTokens = this.estimateTokens(inputText);
        
        // Estimate output tokens (rough: ~200 tokens per question)
        const outputTokens = numQuestions * 200;

        // Calculate costs
        const inputCost = (inputTokens / 1000) * providerCost.input;
        const outputCost = (outputTokens / 1000) * providerCost.output;
        const totalCost = inputCost + outputCost;

        return {
            provider,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            inputCost: parseFloat(inputCost.toFixed(6)),
            outputCost: parseFloat(outputCost.toFixed(6)),
            totalCost: parseFloat(totalCost.toFixed(6)),
            costPer1K: providerCost.input + providerCost.output,
            estimated: true
        };
    }

    /**
     * Compare costs across providers
     * @param {string} inputText - Input text
     * @param {number} numQuestions - Number of questions
     * @param {Array} providers - List of provider names
     * @returns {Array} - Sorted by cost (cheapest first)
     */
    compareCosts(inputText, numQuestions, providers) {
        const comparisons = providers.map(provider => {
            const cost = this.calculateCost(provider, inputText, numQuestions);
            const info = this.providerCosts[provider.toLowerCase()] || {};
            
            return {
                ...cost,
                speed: info.speed || 'unknown',
                quality: info.quality || 'unknown'
            };
        });

        // Sort by total cost (cheapest first)
        return comparisons.sort((a, b) => a.totalCost - b.totalCost);
    }

    /**
     * Get cheapest provider
     * @param {Array} providers - Available providers
     * @returns {string} - Cheapest provider name
     */
    getCheapestProvider(providers) {
        let cheapest = providers[0];
        let lowestCost = this.providerCosts[cheapest.toLowerCase()]?.input || Infinity;

        providers.forEach(provider => {
            const cost = this.providerCosts[provider.toLowerCase()]?.input || Infinity;
            if (cost < lowestCost) {
                lowestCost = cost;
                cheapest = provider;
            }
        });

        return cheapest;
    }

    /**
     * Get fastest provider
     * @param {Array} providers - Available providers
     * @returns {string} - Fastest provider name
     */
    getFastestProvider(providers) {
        const speedOrder = { fast: 1, medium: 2, slow: 3 };
        
        let fastest = providers[0];
        let bestSpeed = speedOrder[this.providerCosts[fastest.toLowerCase()]?.speed] || 999;

        providers.forEach(provider => {
            const speed = speedOrder[this.providerCosts[provider.toLowerCase()]?.speed] || 999;
            if (speed < bestSpeed) {
                bestSpeed = speed;
                fastest = provider;
            }
        });

        return fastest;
    }

    /**
     * Get best quality provider
     * @param {Array} providers - Available providers
     * @returns {string} - Best quality provider name
     */
    getBestQualityProvider(providers) {
        const qualityOrder = { excellent: 1, good: 2, fair: 3 };
        
        let best = providers[0];
        let bestQuality = qualityOrder[this.providerCosts[best.toLowerCase()]?.quality] || 999;

        providers.forEach(provider => {
            const quality = qualityOrder[this.providerCosts[provider.toLowerCase()]?.quality] || 999;
            if (quality < bestQuality) {
                bestQuality = quality;
                best = provider;
            }
        });

        return best;
    }

    /**
     * Track usage for a provider
     * @param {string} provider - Provider name
     * @param {Object} cost - Cost object
     */
    trackUsage(provider, cost) {
        if (!this.usage[provider]) {
            this.usage[provider] = {
                requests: 0,
                totalCost: 0,
                totalTokens: 0
            };
        }

        this.usage[provider].requests++;
        this.usage[provider].totalCost += cost.totalCost || 0;
        this.usage[provider].totalTokens += cost.totalTokens || 0;
    }

    /**
     * Get usage statistics
     * @returns {Object} - Usage stats
     */
    getUsageStats() {
        const total = {
            requests: 0,
            totalCost: 0,
            totalTokens: 0
        };

        Object.values(this.usage).forEach(stats => {
            total.requests += stats.requests;
            total.totalCost += stats.totalCost;
            total.totalTokens += stats.totalTokens;
        });

        return {
            byProvider: this.usage,
            total: {
                ...total,
                totalCost: parseFloat(total.totalCost.toFixed(6)),
                avgCostPerRequest: total.requests > 0 
                    ? parseFloat((total.totalCost / total.requests).toFixed(6))
                    : 0
            }
        };
    }

    /**
     * Reset usage statistics
     */
    resetUsage() {
        this.usage = {};
    }

    /**
     * Get provider information
     * @param {string} provider - Provider name
     * @returns {Object} - Provider info
     */
    getProviderInfo(provider) {
        return this.providerCosts[provider.toLowerCase()] || null;
    }
}

module.exports = CostTracker;
