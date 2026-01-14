const LocalEmbeddings = require('./nlp/embeddings');

/**
 * Text Similarity Calculator
 * Calculates similarity between text strings using various algorithms
 */
class TextSimilarity {
    /**
     * Calculate Levenshtein distance between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Edit distance
     */
    static levenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = [];

        // Initialize matrix
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        // Fill matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // deletion
                    matrix[i][j - 1] + 1,      // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }

        return matrix[len1][len2];
    }

    /**
     * Calculate similarity percentage using Levenshtein distance
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Similarity percentage (0-100)
     */
    static levenshteinSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        if (str1 === str2) return 100;

        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        
        if (maxLength === 0) return 100;
        
        return ((1 - distance / maxLength) * 100);
    }

    /**
     * Normalize text for comparison
     * @param {string} text - Text to normalize
     * @returns {string} - Normalized text
     */
    static normalizeText(text) {
        return text
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')           // Normalize whitespace
            .replace(/[^\w\s]/g, '')        // Remove punctuation
            .replace(/\b(a|an|the)\b/g, '') // Remove articles
            .trim();
    }

    /**
     * Calculate Jaccard similarity (set-based)
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Similarity percentage (0-100)
     */
    static jaccardSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        if (str1 === str2) return 100;

        const words1 = new Set(str1.toLowerCase().split(/\s+/));
        const words2 = new Set(str2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        if (union.size === 0) return 0;

        return (intersection.size / union.size) * 100;
    }

    /**
     * Calculate cosine similarity using word frequency
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Similarity percentage (0-100)
     */
    static cosineSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        if (str1 === str2) return 100;

        const words1 = str1.toLowerCase().split(/\s+/);
        const words2 = str2.toLowerCase().split(/\s+/);

        // Build frequency vectors
        const allWords = new Set([...words1, ...words2]);
        const vector1 = {};
        const vector2 = {};

        allWords.forEach(word => {
            vector1[word] = words1.filter(w => w === word).length;
            vector2[word] = words2.filter(w => w === word).length;
        });

        // Calculate dot product and magnitudes
        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        allWords.forEach(word => {
            dotProduct += vector1[word] * vector2[word];
            magnitude1 += vector1[word] * vector1[word];
            magnitude2 += vector2[word] * vector2[word];
        });

        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);

        if (magnitude1 === 0 || magnitude2 === 0) return 0;

        return (dotProduct / (magnitude1 * magnitude2)) * 100;
    }

    /**
     * Calculate deep semantic similarity using embeddings if available
     * @param {string} str1 
     * @param {string} str2 
     * @returns {Promise<number>} 0-100
     */
    static async semanticSimilarity(str1, str2) {
        try {
            const vec1 = await LocalEmbeddings.getEmbedding(str1);
            const vec2 = await LocalEmbeddings.getEmbedding(str2);

            if (vec1 && vec2) {
                return LocalEmbeddings.cosineSimilarity(vec1, vec2) * 100;
            }
        } catch (e) {
            // Ignore embedding errors and fallback
        }
        return this.cosineSimilarity(str1, str2);
    }

    /**
     * Calculate combined similarity score
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @param {Object} weights - Weights for each algorithm
     * @returns {Promise<number>|number} - Combined similarity percentage (0-100)
     */
    static async combinedSimilarity(str1, str2, weights = {}) {
        const defaultWeights = {
            levenshtein: 0.3,
            jaccard: 0.2,
            cosine: 0.2,
            semantic: 0.3
        };

        const w = { ...defaultWeights, ...weights };

        const normalized1 = this.normalizeText(str1);
        const normalized2 = this.normalizeText(str2);

        const levenshtein = this.levenshteinSimilarity(normalized1, normalized2);
        const jaccard = this.jaccardSimilarity(str1, str2);
        
        // Semantic check is async
        let semantic = 0;
        let cosine = 0;
        
        // try to use it if loaded.
        if (LocalEmbeddings.loaded) {
            semantic = await this.semanticSimilarity(str1, str2);
        } else {
            // Fallback: increase cosine weight
            cosine = this.cosineSimilarity(str1, str2);
            w.cosine += w.semantic;
            w.semantic = 0;
        }

        return (
            levenshtein * w.levenshtein +
            jaccard * w.jaccard +
            cosine * w.cosine +
            semantic * w.semantic
        );
    }

    /**
     * Check if two strings are similar above threshold
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @param {number} threshold - Similarity threshold (0-100)
     * @returns {Promise<boolean>} - True if similar
     */
    static async areSimilar(str1, str2, threshold = 85) {
        const similarity = await this.combinedSimilarity(str1, str2);
        return similarity >= threshold;
    }

    /**
     * Find most similar string from a list
     * @param {string} target - Target string
     * @param {Array<string>} candidates - Candidate strings
     * @returns {Promise<Object>} - Most similar match with score
     */
    static async findMostSimilar(target, candidates) {
        if (!candidates || candidates.length === 0) {
            return { match: null, similarity: 0, index: -1 };
        }

        let maxSimilarity = 0;
        let bestMatch = null;
        let bestIndex = -1;

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const similarity = await this.combinedSimilarity(target, candidate);
            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                bestMatch = candidate;
                bestIndex = i;
            }
        }

        return {
            match: bestMatch,
            similarity: maxSimilarity,
            index: bestIndex
        };
    }

    /**
     * Group similar strings together
     * @param {Array<string>} strings - Strings to group
     * @param {number} threshold - Similarity threshold
     * @returns {Promise<Array<Array<number>>>} - Groups of indices
     */
    static async groupSimilar(strings, threshold = 85) {
        const groups = [];
        const processed = new Set();

        for (let i = 0; i < strings.length; i++) {
            if (processed.has(i)) continue;

            const group = [i];
            processed.add(i);

            for (let j = 0; j < strings.length; j++) {
                if (i !== j && !processed.has(j)) {
                    if (await this.areSimilar(strings[i], strings[j], threshold)) {
                        group.push(j);
                        processed.add(j);
                    }
                }
            }

            groups.push(group);
        }

        return groups;
    }
}

module.exports = TextSimilarity;
