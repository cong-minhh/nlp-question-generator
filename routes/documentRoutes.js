const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const documentStorage = require("../services/storage/DocumentStorage");
const imageAssetStorage = require("../services/storage/ImageAssetStorage");
const fileProcessingService = require("../services/FileProcessingService");
const ContentFilter = require("../utils/ContentFilter");
const { logger } = require("../utils/logger");

// Temp upload for multer before moving to storage
const upload = multer({ dest: "uploads/temp/" });

/**
 * POST /api/documents/inspect
 * Uploads a file and returns its structured content (slides/images).
 * Uses content-hash caching - same file returns cached extraction.
 */
router.post("/inspect", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // 1. Save to Storage (returns cached docId if same file)
    const docId = await documentStorage.save(req.file);
    const metadata = await documentStorage.get(docId);

    // 2. Check for cached extraction
    const extractionPath = path.join(
      path.dirname(metadata.path),
      "extraction.json"
    );

    let result;
    try {
      const cachedData = await fs.readFile(extractionPath, "utf8");
      result = JSON.parse(cachedData);
      logger.info(
        `[Document] Cache hit for ${docId} (${metadata.originalName})`
      );
    } catch (e) {
      // No cache - process file
      logger.info(
        `[Document] Processing new document: ${docId} (${metadata.originalName})`
      );

      result = await fileProcessingService.processFile(
        metadata.path,
        metadata.originalName,
        { docId }
      );

      // Cache extraction result
      await fs.writeFile(extractionPath, JSON.stringify(result));
    }

    // 3. Return Catalog (images have URLs, not Base64)
    res.json({
      success: true,
      docId: docId,
      filename: metadata.originalName,
      pages: result.pages || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/documents/generate
 * Generates questions based on selected content from a previously uploaded document.
 * Response includes explicit image references in sources.
 */
router.post("/generate", async (req, res, next) => {
  try {
    const { docId, options } = req.body;

    if (!docId) return res.status(400).json({ error: "docId is required" });

    // 1. Retrieve Document Info
    const metadata = await documentStorage.get(docId);

    // 2. Load Extraction Result
    const extractionPath = path.join(
      path.dirname(metadata.path),
      "extraction.json"
    );
    let extractionData;

    try {
      const data = await fs.readFile(extractionPath, "utf8");
      extractionData = JSON.parse(data);
    } catch (e) {
      // Fallback: Re-process (with docId for proper storage)
      extractionData = await fileProcessingService.processFile(
        metadata.path,
        metadata.originalName,
        { docId }
      );
    }

    // 3. Filter Content (handles both URL-based and legacy Base64 images)
    const finalInput = await ContentFilter.apply(extractionData, {
      ...options,
      docId,
      imageAssetStorage,
    });

    logger.info(
      `[Document] Generating for ${docId}: Using ${finalInput.images.length} images and ${finalInput.text.length} chars of text.`
    );

    // 4. Generate Questions
    const generator = req.app.locals.questionGenerator;
    if (!generator) throw new Error("QuestionGenerator service not available");

    const result = await generator.generateQuestions(finalInput, {
      ...options,
      docId: docId,
      // Pass image metadata for source tracking
      imageMetadata: finalInput.imageMetadata || [],
    });

    // 5. Enhance questions with source references
    if (result.questions && finalInput.imageMetadata) {
      result.questions = result.questions.map((q) => ({
        ...q,
        sources: {
          slides: options?.includeSlides || [],
          images: (finalInput.imageMetadata || []).map((img) => ({
            imageId: img.imageId,
            label: img.label,
            url: img.url,
            reason: "Used in context for generation",
          })),
        },
      }));
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
