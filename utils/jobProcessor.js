/**
 * Background Job Processor
 * Processes jobs from the queue in the background
 * Supports both text-based and document-based question generation
 */
const { logger } = require("./logger");
const path = require("path");
const fs = require("fs").promises;

class JobProcessor {
  constructor(jobQueue, questionGenerator, services = {}) {
    this.jobQueue = jobQueue;
    this.questionGenerator = questionGenerator;
    // Additional services for document processing
    this.documentStorage = services.documentStorage || null;
    this.imageAssetStorage = services.imageAssetStorage || null;
    this.fileProcessingService = services.fileProcessingService || null;
    this.ContentFilter = services.ContentFilter || null;
    this.running = false;
  }

  /**
   * Set document processing services (called after construction if needed)
   */
  setDocumentServices(services) {
    this.documentStorage = services.documentStorage || this.documentStorage;
    this.imageAssetStorage =
      services.imageAssetStorage || this.imageAssetStorage;
    this.fileProcessingService =
      services.fileProcessingService || this.fileProcessingService;
    this.ContentFilter = services.ContentFilter || this.ContentFilter;
  }

  /**
   * Start processing jobs
   */
  start() {
    if (this.running) {
      logger.info("Job processor already running");
      return;
    }

    this.running = true;
    logger.info("Job processor started");

    // Set the processor function on the queue
    this.jobQueue.setProcessor(async (data, onProgress) => {
      return await this.processJob(data, onProgress);
    });
  }

  /**
   * Stop processing jobs
   */
  stop() {
    this.running = false;
    this.jobQueue.stop();
    logger.info("Job processor stopped");
  }

  /**
   * Process a single job (routes to appropriate handler based on job type)
   * @param {Object} data - Job data
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} - Job result
   */
  async processJob(data, onProgress) {
    const jobType = data.type || "text";

    logger.info(`Processing ${jobType} job`, {
      hasDocId: !!data.docId,
      hasText: !!data.text,
    });

    switch (jobType) {
      case "document":
        return await this.processDocumentJob(data, onProgress);
      case "text":
      default:
        return await this.processTextJob(data, onProgress);
    }
  }

  /**
   * Process text-based question generation job
   * @param {Object} data - Job data with text field
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} - Job result
   */
  async processTextJob(data, onProgress) {
    try {
      onProgress(5);

      if (!data.text || data.text.trim().length === 0) {
        throw new Error("Text is required");
      }

      onProgress(10);

      const result = await this.questionGenerator.generateQuestions(data.text, {
        numQuestions: data.numQuestions || 10,
        difficulty: data.difficulty || "mixed",
        bloomLevel: data.bloomLevel || "apply",
      });

      onProgress(90);

      const formattedResult = {
        questions: result.questions,
        metadata: {
          ...result.metadata,
          processedAt: new Date().toISOString(),
          jobType: "text",
        },
      };

      onProgress(100);
      return formattedResult;
    } catch (error) {
      logger.error("Text job processing error:", error);
      throw error;
    }
  }

  /**
   * Process document-based question generation job
   * @param {Object} data - Job data with docId and options
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} - Job result
   */
  async processDocumentJob(data, onProgress) {
    try {
      const { docId, options = {} } = data;

      if (!docId) {
        throw new Error("docId is required for document jobs");
      }

      // Validate services are available
      if (!this.documentStorage) {
        throw new Error("Document storage service not available");
      }

      onProgress(5);
      logger.info(`[DocumentJob] Starting for docId: ${docId}`);

      // 1. Retrieve Document Info
      const metadata = await this.documentStorage.get(docId);
      if (!metadata) {
        throw new Error(`Document ${docId} not found`);
      }
      onProgress(10);

      // 2. Load Extraction Result
      const extractionPath = path.join(
        path.dirname(metadata.path),
        "extraction.json",
      );

      let extractionData;
      try {
        const rawData = await fs.readFile(extractionPath, "utf8");
        extractionData = JSON.parse(rawData);
        logger.info(`[DocumentJob] Loaded cached extraction for ${docId}`);
      } catch (e) {
        // Fallback: Re-process
        if (!this.fileProcessingService) {
          throw new Error(
            "File processing service not available for extraction",
          );
        }
        logger.info(`[DocumentJob] Re-processing ${docId} (no cache)`);
        extractionData = await this.fileProcessingService.processFile(
          metadata.path,
          metadata.originalName,
          { docId },
        );
      }
      onProgress(25);

      // 3. Filter Content
      let finalInput;
      if (this.ContentFilter) {
        finalInput = await this.ContentFilter.apply(extractionData, {
          ...options,
          docId,
          imageAssetStorage: this.imageAssetStorage,
        });
      } else {
        // Basic fallback if no ContentFilter
        finalInput = {
          text: extractionData.text || "",
          images: extractionData.images || [],
          imageMetadata: [],
        };
      }
      onProgress(35);

      logger.info(
        `[DocumentJob] Generating for ${docId}: ${finalInput.images?.length || 0} images, ${finalInput.text?.length || 0} chars`,
      );

      // 4. Generate Questions
      const result = await this.questionGenerator.generateQuestions(
        finalInput,
        {
          ...options,
          docId: docId,
          imageMetadata: finalInput.imageMetadata || [],
        },
      );
      onProgress(85);

      // 5. Enhance questions with source references
      if (result.questions && this.imageAssetStorage) {
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
              const assetUrl = this.imageAssetStorage.getUrl(
                q.question_image,
                docId,
              );
              enhanced.question_image = assetUrl || null;
            }
          }

          return enhanced;
        });
      }
      onProgress(95);

      const formattedResult = {
        success: true,
        questions: result.questions,
        provider: result.provider,
        analysis: result.analysis,
        metadata: {
          ...result.metadata,
          docId,
          processedAt: new Date().toISOString(),
          jobType: "document",
        },
      };

      onProgress(100);
      logger.info(
        `[DocumentJob] Completed for ${docId}: ${result.questions?.length || 0} questions`,
      );

      return formattedResult;
    } catch (error) {
      logger.error("Document job processing error:", {
        error: error.message,
        docId: data.docId,
      });
      throw error;
    }
  }

  /**
   * Get processor status
   * @returns {Object}
   */
  getStatus() {
    return {
      running: this.running,
      hasDocumentServices: !!(this.documentStorage && this.imageAssetStorage),
      queueStats: this.jobQueue.getStats(),
    };
  }
}

module.exports = JobProcessor;
