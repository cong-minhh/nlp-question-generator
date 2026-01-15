/**
 * Asset Routes
 *
 * Handles binary delivery of image assets.
 * GET /assets/:imageId → image/png (binary)
 */

const express = require("express");
const router = express.Router();
const imageAssetStorage = require("../services/storage/ImageAssetStorage");
const documentStorage = require("../services/storage/DocumentStorage");
const { logger } = require("../utils/logger");

// Cache control settings
const CACHE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * GET /assets/:imageId
 * Returns the binary image data for a given imageId
 *
 * Query params (optional):
 * - docId: Document ID (speeds up lookup if provided)
 */
router.get("/:imageId", async (req, res, next) => {
  try {
    const { imageId } = req.params;
    const { docId } = req.query;

    if (!imageId) {
      return res.status(400).json({ error: "imageId is required" });
    }

    logger.debug(
      `[Assets] Fetching image: ${imageId}${docId ? ` (docId: ${docId})` : ""}`
    );

    let buffer = null;
    let contentType = "image/png";

    if (docId) {
      // Fast path: docId provided
      buffer = await imageAssetStorage.getBuffer(docId, imageId);
    } else {
      // Slow path: need to find which doc this image belongs to
      // This requires scanning or an index - for now, we'll require docId
      // In production, consider Redis index or database lookup

      // Slow path: docId not provided, need to scan directories
      // This still works but is less efficient than providing docId
      logger.debug(
        `[Assets] No docId provided for imageId ${imageId}, using directory scan`
      );

      // Attempt to scan storage (not efficient but works for MVP)
      const fs = require("fs").promises;
      const path = require("path");
      const storageDir = process.env.ASSET_STORAGE_PATH || "storage/assets";

      try {
        const docDirs = await fs.readdir(path.resolve(storageDir));
        for (const dir of docDirs) {
          buffer = await imageAssetStorage.getBuffer(dir, imageId);
          if (buffer) break;
        }
      } catch (e) {
        // Storage dir doesn't exist yet
      }
    }

    if (!buffer) {
      return res.status(404).json({ error: "Image not found" });
    }

    // Determine content type from buffer magic bytes
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      contentType = "image/jpeg";
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      contentType = "image/png";
    } else if (buffer[0] === 0x52 && buffer[1] === 0x49) {
      contentType = "image/webp";
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49) {
      contentType = "image/gif";
    }

    // Set cache headers for CDN friendliness
    res.set({
      "Content-Type": contentType,
      "Content-Length": buffer.length,
      "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
      ETag: `"${imageId}"`,
      "X-Image-Id": imageId,
    });

    res.send(buffer);
  } catch (error) {
    logger.error("[Assets] Error serving image:", error);
    next(error);
  }
});

/**
 * GET /assets/doc/:docId
 * List all images for a document
 */
router.get("/doc/:docId", async (req, res, next) => {
  try {
    const { docId } = req.params;

    if (!docId) {
      return res.status(400).json({ error: "docId is required" });
    }

    const images = await imageAssetStorage.listByDocId(docId);

    res.json({
      success: true,
      docId,
      count: images.length,
      images,
    });
  } catch (error) {
    logger.error("[Assets] Error listing images:", error);
    next(error);
  }
});

module.exports = router;
