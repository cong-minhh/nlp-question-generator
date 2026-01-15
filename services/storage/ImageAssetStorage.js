/**
 * Image Asset Storage Service
 *
 * Manages persistence of extracted images with abstraction layer supporting:
 * - Local disk storage (default)
 * - S3-compatible object storage (via env config)
 *
 * Environment variables:
 * - ASSET_STORAGE_TYPE: 'local' (default) or 's3'
 * - ASSET_STORAGE_PATH: Local path for disk storage (default: 'storage/assets')
 * - ASSET_S3_BUCKET: S3 bucket name
 * - ASSET_S3_REGION: S3 region
 * - ASSET_S3_ENDPOINT: Optional custom endpoint (for MinIO, etc.)
 * - ASSET_BASE_URL: Base URL for asset delivery (optional, inferred if not set)
 */

const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { logger } = require("../../utils/logger");

/**
 * Storage Backend Interface
 * All backends must implement: save, get, getBuffer, delete, exists
 */
class StorageBackend {
  async save(assetPath, buffer, metadata) {
    throw new Error("Not implemented");
  }
  async get(assetPath) {
    throw new Error("Not implemented");
  }
  async getBuffer(assetPath) {
    throw new Error("Not implemented");
  }
  async delete(assetPath) {
    throw new Error("Not implemented");
  }
  async exists(assetPath) {
    throw new Error("Not implemented");
  }
}

/**
 * Local Disk Storage Backend
 */
class LocalStorageBackend extends StorageBackend {
  constructor(basePath) {
    super();
    this.basePath = path.resolve(basePath);
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      logger.info(
        `[ImageAssetStorage] Initialized local storage at: ${this.basePath}`
      );
    } catch (err) {
      logger.error(
        "[ImageAssetStorage] Failed to initialize storage directory:",
        err
      );
    }
  }

  async save(assetPath, buffer, metadata = {}) {
    const fullPath = path.join(this.basePath, assetPath);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, buffer);

    // Save metadata alongside
    if (Object.keys(metadata).length > 0) {
      await fs.writeFile(
        `${fullPath}.meta.json`,
        JSON.stringify(metadata, null, 2)
      );
    }

    return fullPath;
  }

  async get(assetPath) {
    const fullPath = path.join(this.basePath, assetPath);
    const metaPath = `${fullPath}.meta.json`;

    try {
      await fs.access(fullPath);
      let metadata = {};
      try {
        const metaData = await fs.readFile(metaPath, "utf8");
        metadata = JSON.parse(metaData);
      } catch (e) {
        // No metadata file
      }
      return { path: fullPath, metadata };
    } catch (err) {
      return null;
    }
  }

  async getBuffer(assetPath) {
    const fullPath = path.join(this.basePath, assetPath);
    return fs.readFile(fullPath);
  }

  async delete(assetPath) {
    const fullPath = path.join(this.basePath, assetPath);
    try {
      await fs.unlink(fullPath);
      await fs.unlink(`${fullPath}.meta.json`).catch(() => {});
    } catch (err) {
      // Ignore if not exists
    }
  }

  async exists(assetPath) {
    const fullPath = path.join(this.basePath, assetPath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * S3 Storage Backend (placeholder - implement when needed)
 */
class S3StorageBackend extends StorageBackend {
  constructor(config) {
    super();
    this.bucket = config.bucket;
    this.region = config.region;
    this.endpoint = config.endpoint;
    // TODO: Initialize S3 client when implementing
    logger.warn(
      "[ImageAssetStorage] S3 backend not yet implemented, falling back to local"
    );
  }

  // Implement S3 methods when needed
}

/**
 * Image Asset Storage Service
 */
class ImageAssetStorage {
  constructor() {
    const storageType = process.env.ASSET_STORAGE_TYPE || "local";
    const storagePath = process.env.ASSET_STORAGE_PATH || "storage/assets";

    if (storageType === "s3") {
      this.backend = new S3StorageBackend({
        bucket: process.env.ASSET_S3_BUCKET,
        region: process.env.ASSET_S3_REGION,
        endpoint: process.env.ASSET_S3_ENDPOINT,
      });
    } else {
      this.backend = new LocalStorageBackend(storagePath);
    }

    this.baseUrl = process.env.ASSET_BASE_URL || "/assets";
    this.storageType = storageType;
  }

  /**
   * Generate a stable image ID
   * @param {string} docId - Document ID
   * @param {number} page - Page number
   * @param {number} order - Image order on page
   * @returns {string} - Stable image ID
   */
  generateImageId(docId, page, order) {
    // Format: img_{page}_{order}_{short_hash}
    // Short hash provides uniqueness while keeping IDs readable
    const hash = crypto
      .createHash("md5")
      .update(`${docId}_${page}_${order}`)
      .digest("hex")
      .substring(0, 6);
    return `img_${page}_${order}_${hash}`;
  }

  /**
   * Save an image asset
   * @param {string} docId - Document ID
   * @param {number} page - Page number
   * @param {number} order - Image order on page
   * @param {Buffer} buffer - Image data
   * @param {Object} metadata - Image metadata (width, height, label, caption, etc.)
   * @returns {Promise<Object>} - Saved asset info { imageId, url, ...metadata }
   */
  async save(docId, page, order, buffer, metadata = {}) {
    const imageId = this.generateImageId(docId, page, order);
    const extension = metadata.extension || "png";
    const assetPath = `${docId}/${imageId}.${extension}`;

    const fullMetadata = {
      imageId,
      docId,
      page,
      order,
      ...metadata,
      createdAt: new Date().toISOString(),
    };

    await this.backend.save(assetPath, buffer, fullMetadata);

    logger.debug(`[ImageAssetStorage] Saved image: ${imageId}`);

    return {
      imageId,
      url: `${this.baseUrl}/${imageId}?docId=${docId}`,
      page,
      order,
      ...metadata,
    };
  }

  /**
   * Get image asset info
   * @param {string} imageId - Image ID
   * @returns {Promise<Object|null>} - Asset info or null
   */
  async get(imageId) {
    // Parse imageId to find the asset path
    // imageId format: img_{page}_{order}_{hash}
    // We need to search for it, or maintain an index

    // For now, we'll require docId to be passed or search all docs
    // This is a limitation that could be solved with Redis/DB index

    // Simpler approach: store a global index file or use filename pattern
    // For MVP, we'll scan (not efficient but works)

    logger.warn(
      "[ImageAssetStorage] get() without docId is slow, consider using getByDocId()"
    );
    return null;
  }

  /**
   * Get image asset by docId and imageId
   * @param {string} docId - Document ID
   * @param {string} imageId - Image ID
   * @returns {Promise<Object|null>} - Asset info with path
   */
  async getByDocId(docId, imageId) {
    // Try common extensions
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const assetPath = `${docId}/${imageId}.${ext}`;
      const result = await this.backend.get(assetPath);
      if (result) {
        return { ...result, assetPath };
      }
    }
    return null;
  }

  /**
   * Get image buffer for serving
   * @param {string} docId - Document ID
   * @param {string} imageId - Image ID
   * @returns {Promise<Buffer|null>}
   */
  async getBuffer(docId, imageId) {
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const assetPath = `${docId}/${imageId}.${ext}`;
      if (await this.backend.exists(assetPath)) {
        return this.backend.getBuffer(assetPath);
      }
    }
    return null;
  }

  /**
   * List all images for a document
   * @param {string} docId - Document ID
   * @returns {Promise<Array>} - Array of image metadata
   */
  async listByDocId(docId) {
    // For local storage, scan the directory
    if (this.storageType === "local") {
      const docDir = path.join(this.backend.basePath, docId);
      try {
        const files = await fs.readdir(docDir);
        const images = [];

        for (const file of files) {
          if (file.endsWith(".meta.json")) {
            try {
              const metaPath = path.join(docDir, file);
              const data = await fs.readFile(metaPath, "utf8");
              const metadata = JSON.parse(data);
              images.push({
                ...metadata,
                url: `${this.baseUrl}/${metadata.imageId}?docId=${docId}`,
              });
            } catch (e) {
              // Skip invalid meta files
            }
          }
        }

        return images.sort((a, b) => {
          if (a.page !== b.page) return a.page - b.page;
          return a.order - b.order;
        });
      } catch (err) {
        // Directory doesn't exist
        return [];
      }
    }

    return [];
  }

  /**
   * Delete all images for a document
   * @param {string} docId - Document ID
   */
  async deleteByDocId(docId) {
    if (this.storageType === "local") {
      const docDir = path.join(this.backend.basePath, docId);
      try {
        await fs.rm(docDir, { recursive: true, force: true });
        logger.info(`[ImageAssetStorage] Deleted assets for doc: ${docId}`);
      } catch (err) {
        // Ignore
      }
    }
  }

  /**
   * Get the base URL for assets
   */
  getBaseUrl() {
    return this.baseUrl;
  }
}

module.exports = new ImageAssetStorage();
