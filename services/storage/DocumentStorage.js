const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { logger } = require("../../utils/logger");

/**
 * Document Storage Service
 * Manages persistence of uploaded files for stateful processing.
 * Uses content-hash based docId for caching (same file = same docId).
 */
class DocumentStorage {
  constructor(storageDir = "uploads/storage") {
    this.storageDir = path.resolve(storageDir);
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (err) {
      logger.error("Failed to initialize storage directory:", err);
    }
  }

  /**
   * Generate a content-based hash for the file
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>} - Short content hash
   */
  async getContentHash(filePath) {
    const buffer = await fs.readFile(filePath);
    return crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Save a file to storage (with content-based caching)
   * @param {Object} file - Multer file object
   * @returns {Promise<string>} - The document ID (content hash)
   */
  async save(file) {
    // Generate content-based hash as docId
    const contentHash = await this.getContentHash(file.path);
    const docId = `doc_${contentHash}`;
    const docDir = path.join(this.storageDir, docId);

    // Check if already cached
    const metadataPath = path.join(docDir, "metadata.json");
    try {
      await fs.access(metadataPath);
      // Already exists - return cached docId
      logger.info(
        `[DocumentStorage] Cache hit for ${file.originalname} -> ${docId}`
      );

      // Clean up the temp file
      await fs.unlink(file.path).catch(() => {});

      return docId;
    } catch (e) {
      // Not cached, proceed with storage
    }

    await fs.mkdir(docDir, { recursive: true });

    const targetPath = path.join(docDir, file.originalname);

    // Move file from temp (multer) to storage
    try {
      await fs.rename(file.path, targetPath);
    } catch (e) {
      await fs.copyFile(file.path, targetPath);
      await fs.unlink(file.path).catch(() => {});
    }

    // Store metadata
    const metadata = {
      id: docId,
      contentHash: contentHash,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: targetPath,
      uploadDate: new Date().toISOString(),
    };

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    logger.info(
      `[DocumentStorage] Stored new document: ${docId} (${file.originalname})`
    );

    return docId;
  }

  /**
   * Check if extraction cache exists for a document
   * @param {string} docId
   * @returns {Promise<boolean>}
   */
  async hasExtractionCache(docId) {
    const extractionPath = path.join(this.storageDir, docId, "extraction.json");
    try {
      await fs.access(extractionPath);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get file info by ID
   * @param {string} docId
   * @returns {Promise<Object>} - Metadata object including path
   */
  async get(docId) {
    const docDir = path.join(this.storageDir, docId);
    const metadataPath = path.join(docDir, "metadata.json");

    try {
      const data = await fs.readFile(metadataPath, "utf8");
      const metadata = JSON.parse(data);

      // Verify file still exists
      await fs.access(metadata.path);

      return metadata;
    } catch (err) {
      throw new Error(`Document ${docId} not found or corrupted`);
    }
  }

  /**
   * Clean up a document
   * @param {string} docId
   */
  async cleanup(docId) {
    const docDir = path.join(this.storageDir, docId);
    try {
      await fs.rm(docDir, { recursive: true, force: true });
      logger.info(`[DocumentStorage] Cleaned up document: ${docId}`);
    } catch (err) {
      // Ignore if already gone
    }
  }
}

module.exports = new DocumentStorage();
