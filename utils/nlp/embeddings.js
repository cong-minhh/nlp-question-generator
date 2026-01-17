const logger = require("../logger");

/**
 * Local Embeddings Service
 * Uses a small local model to generate embeddings for semantic comparison
 */
class LocalEmbeddings {
  constructor(config = {}) {
    this.modelName = config.modelName || "Xenova/all-MiniLM-L6-v2";
    this.pipe = null;
    this.loading = false;
    this.loaded = false;
    this.error = null;
  }

  /**
   * Initialize the model
   */
  async initialize() {
    if (this.loaded) return;
    if (this.loading) {
      // Wait for existing load
      while (this.loading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return;
    }

    this.loading = true;
    try {
      logger.info(`Loading local embedding model: ${this.modelName}...`);

      // Dynamic import for ESM package
      const { pipeline } = await import("@xenova/transformers");

      // feature-extraction pipeline
      this.pipe = await pipeline("feature-extraction", this.modelName);
      this.loaded = true;
      logger.info("Local embedding model loaded successfully");
    } catch (err) {
      logger.error("Failed to load local embedding model:", err);
      this.error = err;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Generate embedding for text
   * @param {string} text
   * @returns {Promise<Array<number>|null>} Vector or null if failed
   */
  async getEmbedding(text) {
    if (!this.loaded && !this.error) {
      await this.initialize();
    }

    if (this.error || !this.pipe) {
      return null;
    }

    try {
      // output is a Tensor
      // pooling: 'mean' or 'cls'? The pipeline usually returns per-token.
      // For sentence-transformers, we often want mean pooling.
      // The default pipeline for feature-extraction returns [batch_size, seq_len, hidden_size]
      // We need to average over seq_len.

      const output = await this.pipe(text, {
        pooling: "mean",
        normalize: true,
      });
      // output.data is the Float32Array
      return Array.from(output.data);
    } catch (err) {
      logger.warn(
        `Error generating embedding for text: "${text.substring(0, 50)}..."`,
        { error: err.message },
      );
      return null;
    }
  }

  /**
   * Calculate Cosine Similarity
   * @param {Array<number>} vecA
   * @param {Array<number>} vecB
   * @returns {number} 0-1 score
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    if (magA === 0 || magB === 0) return 0;

    return dot / (magA * magB);
  }
}

// Singleton instance
const instance = new LocalEmbeddings();

module.exports = instance;
