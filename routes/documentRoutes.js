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
      "extraction.json",
    );

    let result;
    try {
      const cachedData = await fs.readFile(extractionPath, "utf8");
      result = JSON.parse(cachedData);
      logger.info(
        `[Document] Cache hit for ${docId} (${metadata.originalName})`,
      );
    } catch (e) {
      // No cache - process file
      logger.info(
        `[Document] Processing new document: ${docId} (${metadata.originalName})`,
      );

      result = await fileProcessingService.processFile(
        metadata.path,
        metadata.originalName,
        { docId },
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
      "extraction.json",
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
        { docId },
      );
    }

    // 3. Filter Content (handles both URL-based and legacy Base64 images)
    const finalInput = await ContentFilter.apply(extractionData, {
      ...options,
      docId,
      imageAssetStorage,
    });

    logger.info(
      `[Document] Generating for ${docId}: Using ${finalInput.images.length} images and ${finalInput.text.length} chars of text.`,
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

    // 5. Enhance questions with source references and convert imageIds to URLs
    if (result.questions) {
      const imageMetadataMap = new Map(
        (finalInput.imageMetadata || []).map((img) => [img.imageId, img]),
      );

      result.questions = result.questions.map((q) => {
        const enhanced = {
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
        };

        // Convert question_image imageId to full URL
        if (q.question_image) {
          const imgMeta = imageMetadataMap.get(q.question_image);
          if (imgMeta && imgMeta.url) {
            enhanced.question_image = imgMeta.url;
          } else {
            // Try to build URL from imageId
            const assetUrl = imageAssetStorage.getUrl(q.question_image, docId);
            enhanced.question_image = assetUrl || null;
          }
        }

        return enhanced;
      });
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/documents/generate-async
 * Start async question generation from a previously inspected document.
 * Returns jobId immediately, client polls /api/jobs/:id for status.
 */
router.post("/generate-async", async (req, res, next) => {
  try {
    const { docId, options } = req.body;

    if (!docId) {
      return res.status(400).json({
        success: false,
        error: "docId is required",
      });
    }

    // Validate document exists
    const metadata = await documentStorage.get(docId);
    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: `Document ${docId} not found. Please inspect the document first.`,
      });
    }

    // Get job queue from app
    const jobQueue = req.app.locals.jobQueue;
    if (!jobQueue) {
      return res.status(500).json({
        success: false,
        error: "Job queue not initialized",
      });
    }

    // Create document generation job
    const jobId = await jobQueue.createJob({
      type: "document",
      docId,
      options: {
        numQuestions: options?.numQuestions || 10,
        includeSlides: options?.includeSlides || [],
        includeImages: options?.includeImages !== false,
        difficulty: options?.difficulty || "mixed",
        bloomLevel: options?.bloomLevel || "apply",
        ...options,
      },
    });

    logger.info(`[Async] Created document job ${jobId} for docId: ${docId}`);

    // Return 202 Accepted with job info
    res.status(202).json({
      success: true,
      jobId,
      docId,
      message: "Document generation job queued",
      statusUrl: `/api/jobs/${jobId}`,
      resultUrl: `/api/jobs/${jobId}/result`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/documents/:docId/status
 * Quick check if a document has been inspected
 */
router.get("/:docId/status", async (req, res, next) => {
  try {
    const { docId } = req.params;
    const metadata = await documentStorage.get(docId);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        exists: false,
        error: "Document not found",
      });
    }

    res.json({
      success: true,
      exists: true,
      docId,
      filename: metadata.originalName,
      inspectedAt: metadata.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
