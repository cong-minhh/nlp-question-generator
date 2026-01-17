const crypto = require("crypto");

/**
 * Text Hashing Utility
 * Creates consistent hashes for caching purposes
 */
class HashGenerator {
  /**
   * Generate SHA256 hash from text or content object
   * @param {string|Object} textOrContent - Text string or content object { text: string, images?: Array }
   * @returns {string} - Hex hash string
   */
  static hashText(textOrContent) {
    // Handle null/undefined
    if (textOrContent === null || textOrContent === undefined) {
      throw new Error("Invalid text for hashing: input is null or undefined");
    }

    let textToHash = "";

    if (typeof textOrContent === "string") {
      // Simple string input
      textToHash = textOrContent;
    } else if (typeof textOrContent === "object") {
      // Object input (multimodal content with images)
      // Create a deterministic string representation
      const textPart = textOrContent.text || "";

      // Include image metadata in hash (not the actual image data)
      let imageSignature = "";
      if (
        Array.isArray(textOrContent.images) &&
        textOrContent.images.length > 0
      ) {
        imageSignature = textOrContent.images
          .map((img) => {
            // Use imageId, url, or source for uniqueness
            return img.imageId || img.url || img.source || "unknown";
          })
          .sort()
          .join("|");
      }

      // Build hash input - only include separator if we have content
      if (textPart && imageSignature) {
        textToHash = `${textPart}::images::${imageSignature}`;
      } else if (textPart) {
        textToHash = textPart;
      } else if (imageSignature) {
        textToHash = `::images::${imageSignature}`;
      } else {
        throw new Error(
          "Invalid text for hashing: object has no text or images",
        );
      }
    } else {
      throw new Error(
        `Invalid text for hashing: expected string or object, got ${typeof textOrContent}`,
      );
    }

    // Validate we have something to hash
    if (!textToHash || textToHash.trim().length === 0) {
      throw new Error("Invalid text for hashing: empty content");
    }

    return crypto
      .createHash("sha256")
      .update(textToHash.trim().toLowerCase())
      .digest("hex");
  }

  /**
   * Generate hash from options object
   * @param {Object} options - Options to hash
   * @returns {string} - Hex hash string
   */
  static hashOptions(options) {
    const normalized = this.normalizeOptions(options);
    const optionsString = JSON.stringify(normalized);

    return crypto.createHash("sha256").update(optionsString).digest("hex");
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
      bloomLevel: options.bloomLevel || "apply",
      difficulty: options.difficulty || "mixed",
      provider: options.provider || "default",
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
