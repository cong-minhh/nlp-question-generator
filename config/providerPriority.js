/**
 * Provider Priority Configuration
 * Defines priority and characteristics for each provider
 */

module.exports = {
    /**
     * Provider priority order (higher = preferred)
     */
    priorities: {
        gemini: 90,      // High priority - cheap and fast
        deepseek: 85,    // High priority - very cheap
        kimi: 80,        // Good priority - balanced
        kimicn: 80,      // Good priority - balanced
        openai: 70,      // Medium priority - reliable but more expensive
        anthropic: 60    // Lower priority - expensive but excellent quality
    },

    /**
     * Provider characteristics for routing decisions
     */
    characteristics: {
        gemini: {
            cost: 'very_low',
            speed: 'fast',
            quality: 'good',
            reliability: 'high',
            rateLimit: 60,  // requests per minute
            bestFor: ['general', 'bulk', 'cost-sensitive']
        },
        deepseek: {
            cost: 'very_low',
            speed: 'medium',
            quality: 'good',
            reliability: 'medium',
            rateLimit: 30,
            bestFor: ['cost-sensitive', 'bulk']
        },
        kimi: {
            cost: 'low',
            speed: 'fast',
            quality: 'good',
            reliability: 'high',
            rateLimit: 60,
            bestFor: ['general', 'balanced']
        },
        kimicn: {
            cost: 'low',
            speed: 'fast',
            quality: 'good',
            reliability: 'high',
            rateLimit: 60,
            bestFor: ['general', 'balanced', 'chinese']
        },
        openai: {
            cost: 'medium',
            speed: 'fast',
            quality: 'good',
            reliability: 'very_high',
            rateLimit: 60,
            bestFor: ['general', 'reliable', 'production']
        },
        anthropic: {
            cost: 'high',
            speed: 'fast',
            quality: 'excellent',
            reliability: 'very_high',
            rateLimit: 50,
            bestFor: ['quality-critical', 'complex', 'production']
        }
    },

    /**
     * Fallback chains for each provider
     */
    fallbackChains: {
        gemini: ['deepseek', 'kimi', 'openai'],
        deepseek: ['gemini', 'kimi', 'openai'],
        kimi: ['gemini', 'deepseek', 'openai'],
        kimicn: ['kimi', 'gemini', 'deepseek'],
        openai: ['gemini', 'anthropic', 'kimi'],
        anthropic: ['openai', 'gemini', 'kimi']
    },

    /**
     * Use case to provider mapping
     */
    useCaseMapping: {
        'cost-sensitive': ['deepseek', 'gemini', 'kimi'],
        'quality-critical': ['anthropic', 'openai', 'gemini'],
        'speed-critical': ['gemini', 'kimi', 'openai'],
        'bulk-processing': ['deepseek', 'gemini', 'kimi'],
        'production': ['openai', 'anthropic', 'gemini'],
        'development': ['gemini', 'deepseek', 'kimi']
    },

    /**
     * Get provider priority
     * @param {string} provider - Provider name
     * @returns {number} - Priority score
     */
    getPriority(provider) {
        return this.priorities[provider.toLowerCase()] || 50;
    },

    /**
     * Get provider characteristics
     * @param {string} provider - Provider name
     * @returns {Object} - Provider characteristics
     */
    getCharacteristics(provider) {
        return this.characteristics[provider.toLowerCase()] || null;
    },

    /**
     * Get fallback chain for provider
     * @param {string} provider - Provider name
     * @returns {Array} - Fallback provider names
     */
    getFallbackChain(provider) {
        return this.fallbackChains[provider.toLowerCase()] || [];
    },

    /**
     * Get recommended providers for use case
     * @param {string} useCase - Use case name
     * @returns {Array} - Recommended provider names
     */
    getProvidersForUseCase(useCase) {
        return this.useCaseMapping[useCase] || [];
    },

    /**
     * Sort providers by priority
     * @param {Array} providers - Provider names
     * @returns {Array} - Sorted provider names (highest priority first)
     */
    sortByPriority(providers) {
        return providers.sort((a, b) => {
            return this.getPriority(b) - this.getPriority(a);
        });
    }
};
