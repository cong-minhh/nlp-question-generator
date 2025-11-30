const crypto = require('crypto');

/**
 * Text Hashing Utility
 * Creates consistent hashes for caching purposes
 */
class HashGenerator {
    /**
     * Generate SHA256 hash from text
     * @param {string} text - Text to hash
     * @returns {string} - Hex hash string
     */
    static hashText(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('Invalid text for hashing');
        }
        
        return crypto
            .createHash('sha256')
            .update(text.trim().toLowerCase())
            .digest('hex');
    }

    /**
     * Generate hash from options object
     * @param {Object} options - Options to hash
     * @returns {string} - Hex hash string
     */
    static hashOptions(options) {
        const normalized = this.normalizeOptions(options);
        const optionsString = JSON.stringify(normalized);
        
        return crypto
            .createHash('sha256')
            .update(optionsString)
            .digest('hex');
    }

    /**
     * Generate combined cache key from text and options
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {string} - Cache key
     */
    static generateCacheKey(text, options = {}) {
        const textHash = this.hashText(text);
        const optionsHash = this.hashOptions(options);
        
        return `${textHash}-${optionsHash}`;
    }

    /**
     * Normalize options for consistent hashing
     * @param {Object} options - Raw options
     * @returns {Object} - Normalized options
     */
    static normalizeOptions(options) {
        const normalized = {
            numQuestions: options.numQuestions || 10,
            bloomLevel: options.bloomLevel || 'apply',
            difficulty: options.difficulty || 'mixed',
            provider: options.provider || 'default'
        };

        // Sort keys for consistent hashing
        return Object.keys(normalized)
            .sort()
            .reduce((acc, key) => {
                acc[key] = normalized[key];
                return acc;
            }, {});
    }
}

module.exports = HashGenerator;
