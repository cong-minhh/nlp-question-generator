/**
 * Answer Matcher - Confidence-based answer matching
 * Prevents false positives from substring matching
 */

// Lazy load TextSimilarity to avoid blocking on embeddings model load
let _TextSimilarity = null;
const getTextSimilarity = () => {
  if (!_TextSimilarity) {
    _TextSimilarity = require("../utils/textSimilarity");
  }
  return _TextSimilarity;
};

/**
 * Match confidence levels
 */
const MatchConfidence = {
  EXACT: "exact", // Perfect match
  HIGH: "high", // >90% similarity
  LOW: "low", // 70-90% similarity - risky, don't auto-correct
  NONE: "none", // No match
};

class AnswerMatcher {
  /**
   * Match answer text to options with confidence scoring
   * @param {string} answerText - The answer text from LLM
   * @param {Object} options - { A: 'option text', B: '...', C: '...', D: '...' }
   * @param {Object} config - Configuration options
   * @returns {Promise<Object>} - { key, confidence, similarity? }
   */
  static async matchAnswer(answerText, options, config = {}) {
    const {
      highThreshold = 90,
      lowThreshold = 70,
      useSemanticSimilarity = true,
    } = config;

    if (!answerText || typeof answerText !== "string") {
      return { key: null, confidence: MatchConfidence.NONE };
    }

    const normalizedAnswer = answerText.trim().toLowerCase();

    // 1. Exact match check (fastest)
    for (const [key, val] of Object.entries(options)) {
      if (!val) continue;
      const normalizedOption = val.trim().toLowerCase();

      if (normalizedAnswer === normalizedOption) {
        return { key, confidence: MatchConfidence.EXACT };
      }
    }

    // 2. Similarity-based matching
    let bestMatch = {
      key: null,
      confidence: MatchConfidence.NONE,
      similarity: 0,
    };

    for (const [key, val] of Object.entries(options)) {
      if (!val) continue;

      let similarity;
      const TextSimilarity = getTextSimilarity();
      if (useSemanticSimilarity) {
        similarity = await TextSimilarity.combinedSimilarity(answerText, val);
      } else {
        // Fallback to simpler similarity
        similarity = TextSimilarity.cosineSimilarity(answerText, val);
      }

      if (similarity > bestMatch.similarity) {
        let confidence;
        if (similarity >= highThreshold) {
          confidence = MatchConfidence.HIGH;
        } else if (similarity >= lowThreshold) {
          confidence = MatchConfidence.LOW;
        } else {
          confidence = MatchConfidence.NONE;
        }

        bestMatch = { key, confidence, similarity };
      }
    }

    return bestMatch;
  }

  /**
   * Synchronous exact-match only matcher (for performance-critical paths)
   * @param {string} answerText
   * @param {Object} options
   * @returns {Object}
   */
  static matchExactOnly(answerText, options) {
    if (!answerText || typeof answerText !== "string") {
      return { key: null, confidence: MatchConfidence.NONE };
    }

    const normalizedAnswer = answerText.trim().toLowerCase();

    for (const [key, val] of Object.entries(options)) {
      if (!val) continue;
      if (normalizedAnswer === val.trim().toLowerCase()) {
        return { key, confidence: MatchConfidence.EXACT };
      }
    }

    return { key: null, confidence: MatchConfidence.NONE };
  }

  /**
   * Check if a match is safe to auto-correct
   * Only EXACT and HIGH are safe
   * @param {string} confidence
   * @returns {boolean}
   */
  static isSafeToCorrect(confidence) {
    return (
      confidence === MatchConfidence.EXACT ||
      confidence === MatchConfidence.HIGH
    );
  }
}

module.exports = {
  AnswerMatcher,
  MatchConfidence,
};
