const BaseAIProvider = require("./baseProvider");
const fetch = require("node-fetch");
const { logger } = require("../utils/logger");

/**
 * LocalProvider - Supports Ollama/LocalAI with multimodal (vision) capabilities
 *
 * Designed to work with limited VRAM (e.g., RTX 3050 4GB) by:
 * 1. Processing text in chunks
 * 2. Processing images in small batches
 * 3. Sequential processing to avoid OOM
 */
class LocalProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config);
    this.name = "local";
    this.description = "Local LLM (Ollama/LocalAI) with Vision Support";
    this.supportedModels = [
      "llama3",
      "mistral",
      "gemma",
      "phi3",
      "qwen2.5:3b",
      "qwen2.5-vl:3b",
      "qwen2.5-vl:7b",
      "qwen3-vl:2b",
      "qwen3-vl:8b",
      "llava",
      "llava:13b",
    ];

    // Load configuration based on preset
    this.loadPresetConfig();
  }

  /**
   * Load configuration from ENV variables
   */
  loadPresetConfig() {
    // Toggle chunking on/off (default: true)
    this.useChunking = process.env.LOCAL_USE_CHUNKING !== "false";

    this.chunkConfig = {
      maxTextChars: parseInt(process.env.LOCAL_MAX_TEXT_CHARS) || 12000,
      maxImagesPerChunk: parseInt(process.env.LOCAL_MAX_IMAGES) || 2, // Reduce default for stability
      questionsPerChunk: parseInt(process.env.LOCAL_QUESTIONS_PER_CHUNK) || 5,
      chunkTimeout: parseInt(process.env.LOCAL_CHUNK_TIMEOUT) || 300000,
      delayBetweenChunks: parseInt(process.env.LOCAL_CHUNK_DELAY) || 2000, // Increase cooling time
      maxRetries: parseInt(process.env.LOCAL_MAX_RETRIES) || 2,
      retryDelay: parseInt(process.env.LOCAL_RETRY_DELAY) || 3000,
      keepAlive: process.env.LOCAL_KEEP_ALIVE || "5m", // Reduce keepalive to free VRAM sooner
      ctxSize: parseInt(process.env.LOCAL_CTX_SIZE) || 4096, // Reduce for 4GB VRAM safety
      temperature: parseFloat(process.env.LOCAL_TEMPERATURE) || 0.1,
      repeatPenalty: parseFloat(process.env.LOCAL_REPEAT_PENALTY) || 1.25, // Stronger penalty
    };

    logger.info(`[LocalProvider] Initialized`, {
      useChunking: this.useChunking,
      ...this.chunkConfig,
    });
  }

  validateConfig() {
    if (!this.config.baseUrl) {
      this.config.baseUrl = "http://localhost:11434";
    }
  }

  isConfigured() {
    return !!this.config.baseUrl;
  }

  /**
   * Check if the model is a vision-capable model
   */
  isVisionModel() {
    const model = (this.config.model || "").toLowerCase();
    return (
      model.includes("vl") ||
      model.includes("llava") ||
      model.includes("vision") ||
      model.includes("minicpm")
    );
  }

  /**
   * Main entry point - routes to chunked or simple generation
   */
  async generateQuestions(text, options = {}) {
    const numQuestions = options.numQuestions || 10;

    // Extract input data
    let inputText = typeof text === "object" ? text.text || "" : text;
    let images = typeof text === "object" ? text.images || [] : [];
    let imageMetadata = options.imageMetadata || [];

    // Decide processing strategy based on input size and chunking toggle
    const textLength = inputText.length;
    const imageCount = images.length;
    const isLargeInput =
      this.useChunking &&
      (textLength > this.chunkConfig.maxTextChars ||
        imageCount > this.chunkConfig.maxImagesPerChunk ||
        numQuestions > this.chunkConfig.questionsPerChunk);

    logger.info(`[LocalProvider] Processing request`, {
      textLength,
      imageCount,
      numQuestions,
      isLargeInput,
      isVisionModel: this.isVisionModel(),
    });

    if (isLargeInput) {
      return await this.generateQuestionsChunked(
        inputText,
        images,
        imageMetadata,
        options,
      );
    } else {
      return await this.generateQuestionsSingle(
        inputText,
        images,
        imageMetadata,
        options,
      );
    }
  }

  /**
   * Single request generation (for small inputs) with retry logic
   */
  async generateQuestionsSingle(text, images, imageMetadata, options = {}) {
    const numQuestions = options.numQuestions || 10;
    const maxRetries = options.maxRetries || this.chunkConfig.maxRetries;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Build prompt with image metadata
        const prompt = this.buildPrompt(
          { text, images: [] }, // Don't include raw images in text
          { ...options, imageMetadata },
        );

        // Safety enforcement for VRAM protection
        const ctxSize = this.chunkConfig.ctxSize;

        if (attempt > 0) {
          logger.info(`[LocalProvider] Retry attempt ${attempt}/${maxRetries}`);
        }

        logger.debug(`[LocalProvider] Single request`, {
          textLength: text.length,
          imageCount: images.length,
          attempt,
        });

        // Log full prompt for debugging (set LOG_LEVEL=TRACE to see this)
        // logger.trace(
        //   `[LocalProvider] === FULL PROMPT TO LLM ===\n${prompt}\n=== END PROMPT ===`,
        // );

        // Also log at info level for easier debugging (truncated)
        // logger.info(`[LocalProvider] Prompt preview (first 500 chars):`, {
        //   promptPreview:
        //     prompt.substring(0, 500) + (prompt.length > 500 ? "..." : ""),
        //   promptLength: prompt.length,
        // });

        // Build request body - increase temperature slightly on retries for different output
        const requestBody = {
          model: this.config.model || "llama3",
          prompt: prompt,
          stream: false,
          format: "json",
          think: false, // This is currently not working
          options: {
            // Use low temperature for structured data extraction
            // Do NOT increase temperature on retries as it increases hallucination risk
            temperature: this.chunkConfig.temperature,

            repeat_penalty: this.chunkConfig.repeatPenalty,
            top_k: 40,
            top_p: 0.9,

            num_ctx:
              this.chunkConfig.ctxSize ||
              parseInt(process.env.LOCAL_CTX_SIZE) ||
              4096,
            // Dynamic num_predict: ~400 tokens per question + 500 buffer
            // Cap at 8192 to prevent runaways while allowing large contexts
            num_predict: Math.min(8192, numQuestions * 400 + 500),
          },
          keep_alive: this.chunkConfig.keepAlive || "5m", // Keep model loaded
        };

        // Add images for vision models
        if (this.isVisionModel() && images.length > 0) {
          requestBody.images = images.map((img) => {
            // Ollama expects raw base64 without data URI prefix
            if (typeof img === "string") {
              return img.replace(/^data:image\/[a-z]+;base64,/, "");
            } else if (img.data) {
              return img.data;
            }
            return img;
          });
          logger.info(
            `[LocalProvider] Sending ${requestBody.images.length} images to vision model`,
          );
        }

        return await this._executeRequest(requestBody, numQuestions, options);
      } catch (error) {
        lastError = error;

        // Don't retry on connection errors or timeouts - they won't help
        if (error.code === "ECONNREFUSED" || error.name === "AbortError") {
          throw error;
        }

        // Check if this is a validation/JSON error or a transient server error (worth retrying)
        const isRetryable =
          error.message.includes("Validation") ||
          error.message.includes("JSON") ||
          error.message.includes("Invalid") ||
          error.message.includes("500 Internal Server Error") ||
          error.message.includes("model runner");

        if (!isRetryable || attempt >= maxRetries) {
          throw error;
        }

        logger.warn(`[LocalProvider] Request failed, will retry`, {
          attempt,
          error: error.message,
        });

        // Wait before retry
        await this.delay(this.chunkConfig.retryDelay);
      }
    }

    throw lastError;
  }

  /**
   * Chunked generation for large inputs (text + images)
   * Distributes difficulty and bloom levels across chunks for better variety
   */
  async generateQuestionsChunked(text, images, imageMetadata, options = {}) {
    const numQuestions = options.numQuestions || 10;

    // Create chunks
    const textChunks = this.splitTextIntoChunks(
      text,
      this.chunkConfig.maxTextChars,
    );
    const imageChunks = this.chunkArray(
      images,
      this.chunkConfig.maxImagesPerChunk,
    );
    const metadataChunks = this.chunkArray(
      imageMetadata,
      this.chunkConfig.maxImagesPerChunk,
    );

    // Calculate questions per chunk
    const totalChunks = Math.max(textChunks.length, imageChunks.length, 1);
    const questionsPerChunk = Math.ceil(numQuestions / totalChunks);

    // Create distribution plan for chunks
    // Small models can't follow complex distribution, so we assign ONE difficulty and bloom per chunk
    const chunkAssignments = this.createChunkAssignments(
      totalChunks,
      numQuestions,
      options.difficulty || "mixed",
      options.bloomLevel || "apply",
      options.distributionPlan,
    );

    logger.info(`[LocalProvider] Chunked processing`, {
      textChunks: textChunks.length,
      imageChunks: imageChunks.length,
      totalChunks,
      questionsPerChunk,
      assignments: chunkAssignments.map(
        (a) => `${a.difficulty}/${a.bloomLevel}`,
      ),
    });

    const allQuestions = [];
    const errors = [];

    // Process each chunk sequentially to avoid OOM
    for (let i = 0; i < totalChunks; i++) {
      const chunkText =
        textChunks[i] || textChunks[textChunks.length - 1] || "";
      const chunkImages = imageChunks[i] || [];
      const chunkMetadata = metadataChunks[i] || [];

      // Adjust questions for this chunk
      const remaining = numQuestions - allQuestions.length;
      const chunkQuestions = Math.min(
        chunkAssignments[i]?.count || questionsPerChunk,
        remaining,
      );

      if (chunkQuestions <= 0) break;

      // Get this chunk's difficulty and bloom assignment
      const assignment = chunkAssignments[i] || {
        difficulty: "medium",
        bloomLevel: "apply",
      };

      logger.info(`[LocalProvider] Processing chunk ${i + 1}/${totalChunks}`, {
        textLen: chunkText.length,
        images: chunkImages.length,
        questions: chunkQuestions,
        difficulty: assignment.difficulty,
        bloomLevel: assignment.bloomLevel,
      });

      try {
        const result = await this.generateQuestionsSingle(
          chunkText,
          chunkImages,
          chunkMetadata,
          {
            ...options,
            numQuestions: chunkQuestions,
            timeout: this.chunkConfig.chunkTimeout,
            // Override with this chunk's specific assignment
            difficulty: assignment.difficulty,
            bloomLevel: assignment.bloomLevel,
            // Clear any complex distribution plan - use simple mode
            distributionPlan: null,
          },
        );

        if (result.questions) {
          // Tag questions with chunk's assigned difficulty/bloom if model didn't follow
          const taggedQuestions = result.questions.map((q) => ({
            ...q,
            // Use model's output if valid, otherwise use assignment
            difficulty: this.isValidDifficulty(q.difficulty)
              ? q.difficulty
              : assignment.difficulty,
            cognitive_level: q.cognitive_level || assignment.bloomLevel,
          }));

          allQuestions.push(...taggedQuestions);
          logger.info(`[LocalProvider] Chunk ${i + 1} complete`, {
            generated: result.questions.length,
            total: allQuestions.length,
          });
        }
      } catch (error) {
        logger.error(`[LocalProvider] Chunk ${i + 1} failed`, {
          error: error.message,
        });
        errors.push({ chunk: i + 1, error: error.message });

        // Continue with other chunks instead of failing completely
        continue;
      }

      // Stop if we have enough questions
      if (allQuestions.length >= numQuestions) {
        logger.info(
          `[LocalProvider] Reached target question count (${numQuestions}), stopping early.`,
        );
        break;
      }

      // Add delay between chunks to let GPU cool down / free memory
      if (i < totalChunks - 1) {
        await this.delay(this.chunkConfig.delayBetweenChunks);
      }
    }

    // Return what we have, even if some chunks failed
    if (allQuestions.length === 0 && errors.length > 0) {
      throw new Error(
        `All chunks failed. Errors: ${errors.map((e) => e.error).join("; ")}`,
      );
    }

    if (errors.length > 0) {
      logger.warn(`[LocalProvider] Completed with errors`, {
        totalQuestions: allQuestions.length,
        errors: errors.map((e) => e.error),
      });
    }

    logger.info(`[LocalProvider] Chunked generation complete`, {
      totalQuestions: allQuestions.length,
      errors: errors.length,
    });

    return {
      questions: allQuestions.slice(0, numQuestions), // Trim to requested count
      provider: this.name,
      analysis: `Generated ${allQuestions.length} questions from ${totalChunks} chunks`,
      metadata: {
        generated_at: new Date().toISOString(),
        numQuestions: Math.min(allQuestions.length, numQuestions),
        expected_questions: numQuestions,
        source: this.name,
        chunking: {
          totalChunks,
          successful: totalChunks - errors.length,
          failed: errors.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      },
    };
  }

  /**
   * Create simple difficulty/bloom assignments for each chunk
   * Small models work better with ONE explicit requirement per chunk
   */
  createChunkAssignments(
    totalChunks,
    numQuestions,
    difficulty,
    bloomLevel,
    distributionPlan,
  ) {
    const assignments = [];
    const questionsPerChunk = Math.ceil(numQuestions / totalChunks);

    // Define the difficulties and bloom levels to cycle through
    const difficulties =
      difficulty === "mixed"
        ? ["easy", "medium", "hard"]
        : [difficulty.toLowerCase()];

    // Common bloom levels for variety - use all 6 for better coverage
    const bloomLevels = [
      "remember",
      "understand",
      "apply",
      "analyze",
      "evaluate",
      "create",
    ];

    // If there's a distribution plan, convert it to per-chunk assignments
    if (distributionPlan?.breakdown && distributionPlan.breakdown.length > 0) {
      // Flatten the distribution plan into individual slots
      const slots = [];
      for (const item of distributionPlan.breakdown) {
        for (let i = 0; i < item.count; i++) {
          slots.push({
            difficulty: item.difficulty.toLowerCase(),
            bloomLevel: item.bloomLevel.toLowerCase(),
          });
        }
      }

      // Shuffle slots to interleave difficulties
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }

      // Group shuffled slots into chunks
      let slotIdx = 0;
      for (let i = 0; i < totalChunks; i++) {
        const chunkCount = Math.min(
          questionsPerChunk,
          numQuestions - i * questionsPerChunk,
        );
        if (chunkCount <= 0) break;

        // Use the first slot in this chunk's range for the chunk's assignment
        if (slotIdx < slots.length) {
          assignments.push({
            difficulty: slots[slotIdx].difficulty,
            bloomLevel: slots[slotIdx].bloomLevel,
            count: chunkCount,
          });
          slotIdx += chunkCount;
        } else {
          // Fallback to cycling if we run out of slots
          assignments.push({
            difficulty: difficulties[i % difficulties.length],
            bloomLevel: bloomLevels[i % bloomLevels.length],
            count: chunkCount,
          });
        }
      }
    } else {
      // No distribution plan - use simple cycling for variety
      for (let i = 0; i < totalChunks; i++) {
        const chunkCount = Math.min(
          questionsPerChunk,
          numQuestions - i * questionsPerChunk,
        );
        if (chunkCount <= 0) break;

        assignments.push({
          difficulty: difficulties[i % difficulties.length],
          bloomLevel: bloomLevels[i % bloomLevels.length],
          count: chunkCount,
        });
      }
    }

    return assignments;
  }

  /**
   * Check if difficulty value is valid
   */
  isValidDifficulty(difficulty) {
    return ["easy", "medium", "hard"].includes(
      (difficulty || "").toLowerCase(),
    );
  }

  /**
   * Execute a single API request to Ollama
   */
  async _executeRequest(requestBody, numQuestions, options = {}) {
    const requestStartTime = Date.now();
    const controller = new AbortController();
    const timeoutMs = options.timeout || this.chunkConfig.chunkTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.debug(`[LocalProvider] Executing request`, {
        model: requestBody.model,
        hasImages: !!requestBody.images,
        imageCount: requestBody.images?.length || 0,
      });

      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Local API Error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();

      // Handle various response formats
      let rawText = data.response;
      if (!rawText || rawText.trim() === "") {
        // Try 'thinking' field for reasoning models
        if (data.thinking && data.thinking.trim() !== "") {
          logger.debug("Using 'thinking' field for response");
          rawText = data.thinking;
        }
      }

      if (!rawText || rawText.trim() === "") {
        logger.error("Empty response from Local LLM", {
          responseKeys: Object.keys(data),
          model: requestBody.model,
        });
        throw new Error(
          "Empty response from Local LLM. Model may be overloaded or doesn't support this input size.",
        );
      }

      // Log full raw response for debugging
      logger.trace(
        `[LocalProvider] === RAW LLM RESPONSE ===\n${rawText}\n=== END RESPONSE ===`,
      );

      logger.info(`[LocalProvider] Raw LLM response received`, {
        responseLength: rawText.length,
        durationMs: Date.now() - requestStartTime,
        preview:
          rawText.substring(0, 500) + (rawText.length > 500 ? "..." : ""),
      });

      let json;
      try {
        json = this.safeJSONParse(rawText);
      } catch (parseError) {
        logger.error("JSON Parse Error - Raw Response:", {
          raw: rawText, // Log the full raw text to identify the issue
          error: parseError.message,
        });
        throw parseError; // Re-throw to trigger retry logic
      }

      // Check for empty object or missing questions
      if (!json || Object.keys(json).length === 0) {
        logger.warn("Received empty JSON structure", { json });
        throw new Error("Invalid JSON structure: Empty object");
      }

      return this.standardizeResponse(json, numQuestions);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        throw new Error(
          `Request timed out after ${timeoutMs / 1000}s. Try reducing text/image size or increasing LOCAL_CHUNK_TIMEOUT.`,
        );
      }
      if (error.code === "ECONNREFUSED") {
        throw new Error(
          `Could not connect to Local LLM at ${this.config.baseUrl}. Is Ollama running?`,
        );
      }

      logger.error("Local LLM request error", { error: error.message });
      throw error;
    }
  }

  /**
   * Split array into chunks
   */
  chunkArray(array, chunkSize) {
    if (!array || array.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);

      if (!response.ok) {
        return {
          success: false,
          message: `Connected but returned error: ${response.statusText}`,
          model: this.config.model || "unknown",
        };
      }

      const data = await response.json();
      const models = data.models?.map((m) => m.name) || [];

      return {
        success: true,
        message: "Successfully connected to Local LLM",
        model: this.config.model || "unknown",
        availableModels: models,
        isVisionCapable: this.isVisionModel(),
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
        error: error.message,
      };
    }
  }
}

module.exports = LocalProvider;
