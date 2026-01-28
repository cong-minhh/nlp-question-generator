/**
 * Base AI Provider Interface with Advanced NLP Patterns
 * All AI providers must implement these methods
 */

const { logger } = require("../utils/logger");
const { z } = require("zod");
const {
  ParseError,
  ValidationError,
  InferenceError,
  ImageModeError,
} = require("./errors");
const { AnswerMatcher, MatchConfidence } = require("./answerMatcher");

// --- VALIDATION SCHEMAS (Best Practice) ---

// Helper to normalize correctanswer from various LLM formats
const normalizeCorrectAnswer = (value) => {
  if (!value) return value;
  const str = String(value).trim().toUpperCase();

  // 1. Direct match: A, B, C, D
  if (["A", "B", "C", "D"].includes(str)) return str;

  // 2. Common wrapped formats: (A), [A], A., A)
  const wrappedMatch = str.match(/^[\(\[]?([ABCD])[\)\]\.]?$/);
  if (wrappedMatch) return wrappedMatch[1];

  // 3. Number format: 1, 2, 3, 4
  const numMap = { 1: "A", 2: "B", 3: "C", 4: "D" };
  if (numMap[str]) return numMap[str];

  // 4. Option prefix: "OPTION A", "ANSWER: A", "THE CORRECT ANSWER IS A"
  // Look for the pattern "A" at the end or preceded by logical delimiters
  const cleanStr = str.replace(/['"]/g, ""); // Remove quotes

  // Regex: look for A, B, C, D surrounded by boundaries or specific prefixes
  // Matches: "Answer: A", "Option A", "A is correct", "**A**"
  const complexMatch = cleanStr.match(
    /\b(?:OPTION|ANSWER|IS)\s*[:\-]?\s*[\(\[]?([ABCD])[\)\]]?/,
  );
  if (complexMatch) return complexMatch[1];

  // 5. Fallback: Check if the string STARTS with A/B/C/D followed by a non-letter (e.g., "A. Because...")
  const startMatch = cleanStr.match(/^([ABCD])(?:\W|$)/);
  if (startMatch) return startMatch[1];

  return str; // Return as-is, will fail validation with clear error
};

// Base question schema
const QuestionSchemaBase = z.object({
  questiontext: z.string().min(1, "Question text is required"),
  optiona: z.string().min(1, "Option A is required"),
  optionb: z.string().min(1, "Option B is required"),
  optionc: z.string().min(1, "Option C is required"),
  optiond: z.string().min(1, "Option D is required"),
  correctanswer: z
    .string()
    .transform(normalizeCorrectAnswer)
    .pipe(z.enum(["A", "B", "C", "D"])),
  difficulty: z
    .string()
    .transform((v) => v?.toLowerCase())
    .pipe(z.enum(["easy", "medium", "hard", "mixed"]))
    .default("medium"),
  cognitive_level: z.string().optional(),
  rationale: z.string().optional(),
  question_image: z.string().nullable().optional(),
});

// Standard schema (backward compatible)
const QuestionSchema = QuestionSchemaBase;

/**
 * Create a question schema with optional image-only mode enforcement
 * @param {boolean} isImageOnlyMode - If true, question_image is required
 * @returns {z.ZodObject} Zod schema for question validation
 */
const createQuestionSchema = (isImageOnlyMode = false) => {
  if (!isImageOnlyMode) {
    return QuestionSchemaBase;
  }

  // Image-only mode: Enforce question_image is present and non-empty
  return QuestionSchemaBase.refine(
    (q) => q.question_image != null && q.question_image.length > 0,
    { message: "question_image is required in image-only mode" },
  );
};

/**
 * Create the AI response schema with optional image-only mode
 * @param {boolean} isImageOnlyMode
 * @returns {z.ZodObject}
 */
const createAIResponseSchema = (isImageOnlyMode = false) => {
  const questionSchema = createQuestionSchema(isImageOnlyMode);
  return z.object({
    analysis: z.string().optional(),
    questions: z
      .array(questionSchema)
      .min(1, "At least one question is required"),
  });
};

// Default schema for backward compatibility
const AIResponseSchema = z.object({
  analysis: z.string().optional(),
  questions: z
    .array(QuestionSchema)
    .min(1, "At least one question is required"),
});

class BaseAIProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "base";
    this.description = "Base AI Provider";
    this.supportedModels = [];
  }

  // --- ABSTRACT METHODS (Must be implemented by children) ---

  async initialize(config = {}) {
    this.config = { ...this.config, ...config };
    if (this.validateConfig) this.validateConfig();
  }

  validateConfig() {
    throw new Error("validateConfig() must be implemented");
  }
  async generateQuestions(text, options = {}) {
    throw new Error("generateQuestions() must be implemented");
  }
  async testConnection() {
    throw new Error("testConnection() must be implemented");
  }
  isConfigured() {
    throw new Error("isConfigured() must be implemented");
  }

  getSupportedModels() {
    return [...this.supportedModels];
  }

  getProviderInfo() {
    return {
      name: this.name,
      description: this.description,
      supportedModels: this.supportedModels,
      configured: this.isConfigured(),
    };
  }

  // --- CORE LOGIC ---

  /**
   * Robust JSON Parser with parsing mode support
   * @param {string} rawResponse - Raw LLM response
   * @param {Object} options - Parsing options
   * @param {string} options.mode - 'strict' (default) or 'repair'
   *   - strict: Only markdown stripping + control-char cleanup. Fails fast on malformed JSON.
   *   - repair: Aggressive structural fixes. Use for small/local models that often produce broken JSON.
   * @returns {Object} Parsed JSON object
   * @throws {ParseError} When JSON parsing fails
   */
  safeJSONParse(rawResponse, { mode = "strict" } = {}) {
    if (!rawResponse || typeof rawResponse !== "string") {
      throw new ParseError(
        "Invalid response: Expected non-empty string",
        rawResponse,
      );
    }

    // 1. Basic Markdown Cleaning (both modes)
    let cleaned = rawResponse.trim();
    // Remove <think> tags (reasoning models) - Greedy match to remove all variants
    cleaned = cleaned
      .replace(/<think>[\s\S]*?<\/think>/gi, "") // Remove standard think blocks
      .replace(/<think>[\s\S]*/gi, "") // Remove unclosed think blocks at end
      .replace(/<\/think>/gi, "") // Remove stray closing tags
      .replace(/<think>/gi, ""); // Remove stray opening tags

    cleaned = cleaned
      .replace(/```json\s*/gi, "")
      .replace(/```javascript\s*/gi, "")
      .replace(/```\s*/g, "");

    // 2. Extract JSON Blob
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      throw new ParseError(
        "Invalid JSON structure: No valid JSON object found",
        rawResponse,
      );
    }

    let jsonString = cleaned.substring(firstBrace, lastBrace + 1);

    // 3. Repair mode ONLY: Fix Common AI Structural Errors
    if (mode === "repair") {
      // Fix unclosed arrays
      if (jsonString.includes('"questions"') && !jsonString.match(/\]\s*\}/)) {
        const lastBraceIndex = jsonString.lastIndexOf("}");
        if (lastBraceIndex > 0) {
          jsonString = jsonString.substring(0, lastBraceIndex + 1) + "\n  ]\n}";
        }
      }

      // Fix missing commas between objects and properties
      jsonString = jsonString
        .replace(/}(\s+){/g, "},\n{") // } { -> }, {
        .replace(/}({)/g, "},$1") // }{ -> },{
        .replace(/"\s*\n\s*"/g, '",\n"') // "line"\n"line" -> "line",\n"line"
        .replace(/"(\s*\n\s*)"(\w+)":/g, '",$1"$2":') // "val" "key": -> "val", "key":
        .replace(/,(\s*[\}\]])/g, "$1"); // Remove trailing commas

      logger.debug("[safeJSONParse] Repair mode applied structural fixes");
    }

    // 4. Character Level Cleaning (both modes - safe cleanup)
    let result = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      const charCode = char.charCodeAt(0);

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }
      if (char === "\\") {
        result += char;
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      if (inString) {
        // Inside strings: Escape control characters
        if (charCode < 0x20) {
          const map = {
            "\n": "\\n",
            "\r": "\\r",
            "\t": "\\t",
            "\b": "\\b",
            "\f": "\\f",
          };
          result += map[char] || "";
        } else {
          result += char;
        }
      } else {
        // Outside strings: Keep only valid structure chars
        if (charCode >= 0x20 || "\n\r\t ".includes(char)) {
          result += char;
        }
      }
    }

    // 5. Final Parse Attempt
    try {
      return JSON.parse(result);
    } catch (parseError) {
      logger.error(`JSON Parse failed (mode: ${mode}): ${parseError.message}`);

      // In strict mode, suggest retry with repair
      if (mode === "strict") {
        logger.info(
          "[safeJSONParse] Strict mode failed - consider retrying with mode: 'repair'",
        );
      }

      throw new ParseError(
        `JSON Parse Error: ${parseError.message}`,
        rawResponse,
      );
    }
  }

  /**
   * Standardize and Validate LLM response using Zod
   * Separates normalization from validation for better debugging
   * @param {Object|string} response - Raw LLM response
   * @param {number} numQuestions - Expected question count
   * @param {Object} options - Additional options
   * @param {string} options.parseMode - 'strict' or 'repair' for JSON parsing
   * @param {boolean} options.isImageOnlyMode - If true, enforce question_image field
   * @returns {Object} Standardized and validated response
   * @throws {ParseError|ValidationError} On parse or validation failure
   */
  standardizeResponse(response, numQuestions = 10, options = {}) {
    const { parseMode = "strict", isImageOnlyMode = false } = options;

    // 1. Parse JSON if needed
    let parsedData = response;
    if (typeof response === "string") {
      parsedData = this.safeJSONParse(response, { mode: parseMode });
    }

    // 2. Normalize structure (array-only or single question responses)
    if (Array.isArray(parsedData)) {
      parsedData = { questions: parsedData };
    }
    if (parsedData && !parsedData.questions && parsedData.questiontext) {
      parsedData = { questions: [parsedData] };
    }

    // 3. Capture original data BEFORE any normalization (for debugging)
    const originalQuestions = parsedData?.questions
      ? JSON.parse(JSON.stringify(parsedData.questions))
      : null;

    // 4. Normalize answers using confidence-based matching
    // This replaces the dangerous substring matching
    if (parsedData && Array.isArray(parsedData.questions)) {
      for (const q of parsedData.questions) {
        // Try direct letter normalization first
        let normalized = normalizeCorrectAnswer(q.correctanswer);

        // If not a valid letter, use confidence-based matching
        if (!["A", "B", "C", "D"].includes(normalized)) {
          const answerText = String(q.correctanswer || "").trim();

          if (answerText) {
            const options = {
              A: String(q.optiona || ""),
              B: String(q.optionb || ""),
              C: String(q.optionc || ""),
              D: String(q.optiond || ""),
            };

            // Use synchronous exact-only matching for better performance
            // Full similarity matching is async and reserved for retry attempts
            const match = AnswerMatcher.matchExactOnly(answerText, options);

            if (AnswerMatcher.isSafeToCorrect(match.confidence)) {
              q.correctanswer = match.key;
              normalized = match.key;
              logger.debug(
                `[standardizeResponse] Answer corrected: "${answerText}" -> "${match.key}" (${match.confidence})`,
              );
            }
          }
        }

        // Fallback: Check alternative keys
        if (!["A", "B", "C", "D"].includes(normalized)) {
          const altAnswer =
            q.answer || q.correct || q.correct_answer || q.answerOption;
          if (altAnswer) {
            const altNorm = normalizeCorrectAnswer(altAnswer);
            if (["A", "B", "C", "D"].includes(altNorm)) {
              normalized = altNorm;
              q.correctanswer = altNorm;
            }
          }

          // Try to parse from Rationale
          if (!["A", "B", "C", "D"].includes(normalized) && q.rationale) {
            const rationale = String(q.rationale).toUpperCase();
            const rationaleMatch = rationale.match(
              /CORRECT ANSWER IS\s*[:\-]?\s*['"]?([ABCD])['"]?/,
            );
            if (rationaleMatch) {
              normalized = rationaleMatch[1];
              q.correctanswer = normalized;
            }
          }

          // Apply final normalized value
          if (["A", "B", "C", "D"].includes(normalized)) {
            q.correctanswer = normalized;
          }
          // If still invalid, let Zod fail - that's better than fake data
        } else {
          q.correctanswer = normalized;
        }
      }
    }

    // 5. Validate with Zod (use dynamic schema for image-only mode)
    const schema = createAIResponseSchema(isImageOnlyMode);
    const result = schema.safeParse(parsedData);

    if (!result.success) {
      const errorMsg = result.error.issues
        .map((issue) => `Field '${issue.path.join(".")}' - ${issue.message}`)
        .join("; ");

      logger.error(`Validation Failed: ${errorMsg}`);
      logger.error("Invalid Data received from LLM:", {
        questions: parsedData.questions?.map((q) => ({
          text: q.questiontext?.substring(0, 50) + "...",
          ans: q.correctanswer,
        })),
      });

      // Throw ValidationError with full context for debugging
      throw new ValidationError(
        `AI Response Validation Failed: ${errorMsg}`,
        originalQuestions,
        parsedData.questions,
        result.error.issues,
      );
    }

    // 6. Return valid data
    const validData = result.data;

    return {
      questions: validData.questions.map((q) => ({
        ...q,
        // difficulty already lowercased by Zod transform
      })),
      provider: this.name,
      analysis: validData.analysis || null, // Changed from misleading default
      metadata: {
        generated_at: new Date().toISOString(),
        numQuestions: validData.questions.length,
        expected_questions: numQuestions,
        source: this.name,
      },
    };
  }

  /**
   * Build advanced prompt with Chain of Thought (CoT) and XML structuring
   */
  buildPrompt(text, options = {}) {
    const {
      numQuestions = 10,
      bloomLevel = "apply",
      difficulty = "mixed",
      distributionPlan = null,
      imageMetadata = [], // Available images with their IDs
    } = options;

    let sourceText =
      typeof text === "object" && text !== null
        ? text.text || JSON.stringify(text)
        : text;
    let difficultyRequirements = "";
    let bloomDefinitions = "";
    let imageInventory = "";
    let inputContextSection = "";

    // Determine if this is an image-only scenario (no text or minimal text with images)
    const hasImages = imageMetadata && imageMetadata.length > 0;
    const textLength = (sourceText || "").toString().trim().length;
    const isImageOnlyMode = hasImages && textLength < 50; // Less than 50 chars = essentially no meaningful text

    // Build image inventory if images are available
    logger.debug(`[buildPrompt] imageMetadata received:`, {
      count: imageMetadata?.length || 0,
      ids: imageMetadata?.map((img) => img.imageId) || [],
      isImageOnlyMode,
      textLength,
    });

    if (hasImages) {
      const imageList = imageMetadata
        .map(
          (img, idx) =>
            `   - Image ${idx + 1} (imageId: "${img.imageId}") - from ${
              img.label || `Page ${img.page}`
            }`,
        )
        .join("\n");

      if (isImageOnlyMode) {
        // IMAGE-ONLY MODE: Emphasize that the AI must analyze the images
        imageInventory = `
<available_images>
IMPORTANT: This is an IMAGE-BASED question generation request.
The following ${imageMetadata.length} image(s) are the PRIMARY source material - you MUST analyze them carefully.

${imageList}

You MUST:
1. Carefully examine EACH attached image to understand its content (diagrams, charts, figures, tables, text within images, etc.)
2. Generate questions based on what you SEE in the image(s)
3. Include the imageId in the "question_image" field for EVERY question you create
4. Reference the image content naturally in your questions (e.g., "According to the diagram...", "Based on the figure shown...")
</available_images>`;
      } else {
        // MIXED MODE: Text with images
        imageInventory = `
<available_images>
The following ${imageMetadata.length} image(s) are attached and visible to you in this conversation.
When you create a question that references one of these images (figures, tables, diagrams), 
you MUST include its imageId in the "question_image" field.

${imageList}

IMPORTANT: Match figures/tables in the text to these images based on what you see in them.
If a question references any visual (e.g., "Figure 3.3", "the table", "the diagram"), include the corresponding imageId.
</available_images>`;
      }

      logger.info(
        `[buildPrompt] Image inventory added to prompt with ${imageMetadata.length} images (imageOnlyMode: ${isImageOnlyMode})`,
      );
    }

    if (distributionPlan && distributionPlan.breakdown) {
      // Strict Distribution Mode
      const breakdownList = distributionPlan.breakdown
        .map(
          (item) =>
            `   - ${
              item.count
            } questions: Difficulty [${item.difficulty.toUpperCase()}], Bloom Level [${item.bloomLevel.toUpperCase()}]`,
        )
        .join("\n");

      difficultyRequirements = `
    <distribution_requirements>
    You must STRICTLY follow this question breakdown:
    ${breakdownList}
    Total Questions: ${numQuestions}
    </distribution_requirements>`;

      const uniqueBlooms = [
        ...new Set(distributionPlan.breakdown.map((item) => item.bloomLevel)),
      ];
      uniqueBlooms.forEach((level) => {
        bloomDefinitions += this.getFormattedBloomDef(level);
      });
    } else {
      // Standard Mode
      difficultyRequirements = `
    <distribution_requirements>
    - Total Questions: ${numQuestions}
    - Difficulty: ${difficulty.toUpperCase()}
    - Bloom's Level: ${bloomLevel.toUpperCase()}
    </distribution_requirements>`;
      bloomDefinitions = this.getFormattedBloomDef(bloomLevel);
    }

    return `
<system_role>
You are an Expert University Lecturer and Assessment Specialist.
Your goal is to create a high-quality, academically rigorous exam for international students.
</system_role>

<input_context>
${
  isImageOnlyMode
    ? `
There is NO text content provided. You must generate questions by analyzing the attached image(s) below.
Any text shown here is minimal or placeholder - FOCUS ON THE IMAGES.
`
    : `The following text is the source material for the exam:
"""
${sourceText}
"""`
}
${imageInventory}
</input_context>

<task_configuration>
${difficultyRequirements}
</task_configuration>

<pedagogical_guidelines>
    <blooms_taxonomy_definitions>
    ${bloomDefinitions}
    </blooms_taxonomy_definitions>

    <design_rules>
    1. **CLARITY:** Use professional, standard English. Accessible to non-native speakers (CEFR B2+).
    2. **RIGOR:** Questions must test concepts, not just vocabulary.
    3. **DISTRACTORS:** Must be plausible, roughly same length, and clearly incorrect.
    4. **RATIONALE:** Provide clear explanation for correct answer. MUST be concise (max 10 sentences).
    5. **IMAGE REFERENCE:** If a question is about a specific figure/table/image:
       - In questiontext: refer to it naturally (e.g., "According to Figure 3..." or "Based on the table...")
       - In question_image: put the imageId from <available_images> 
       - NEVER put the imageId in the question text itself
    </design_rules>
</pedagogical_guidelines>

<output_format>
IMPORTANT: You must output ONLY a valid JSON object.
- NO introductory text.
- NO markdown formatting.
- NO "<think>" tags in the final JSON output (use them internally if needed, but do not include them in the response).
Required JSON Structure:
{
  "questions": [
    {
      "questiontext": "Question text here?",
      "optiona": "Option A text",
      "optionb": "Option B text",
      "optionc": "Option C text",
      "optiond": "Option D text",
      "correctanswer": "A",
      "difficulty": "medium",
      "cognitive_level": "apply",
      "rationale": "The correct answer is A because...",
      "question_image": ${isImageOnlyMode ? '"img_ID_here"' : "null"}
    }
  ]
}

CRITICAL RULES:
1. "correctanswer" MUST be exactly one letter: "A", "B", "C", or "D".
2. Do NOT write the full answer text in "correctanswer". (e.g., BAD: "BFS", GOOD: "A")
3. If the answer is Option A, write "A".
4. Ensure all JSON syntax is correct (commas, quotes, brackets).
</output_format>

<execution_step>
${isImageOnlyMode ? `Carefully analyze the attached image(s). Identify key concepts, data, diagrams, or information visible in them. Generate questions that test understanding of this visual content.` : `Analyze the text, plan the questions according to the <distribution_requirements>, and generate the JSON response.`}
</execution_step>
`;
  }

  getFormattedBloomDef(level) {
    const definitions = {
      remember: "REMEMBER: Recall facts and basic concepts.",
      understand: "UNDERSTAND: Explain ideas or concepts.",
      apply: "APPLY: Use information in new situations.",
      analyze: "ANALYZE: Draw connections among ideas.",
      evaluate: "EVALUATE: Justify a stand or decision.",
      create: "CREATE: Produce new or original work.",
    };
    const key = level.toLowerCase();
    return definitions[key]
      ? `    - ${definitions[key]}\n`
      : `    - ${definitions.apply}\n`;
  }

  // Utility: Split text into chunks
  // Improved regex to avoid breaking on common abbreviations
  splitTextIntoChunks(text, maxChars = 4000) {
    if (!text || text.length <= maxChars) return [text];
    const chunks = [];

    // Improved sentence splitting that respects common abbreviations
    // Uses a more careful approach: split on sentence-ending punctuation followed by space and capital letter
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
    if (sentences.length === 1) {
      // Fallback to original regex if improved doesn't work
      const fallbackSentences = text.match(/[^.!?]+[.!?]+[\s\n]*/g) || [text];
      sentences.length = 0;
      sentences.push(...fallbackSentences);
    }

    let currentChunk = "";

    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        // Split huge sentences by words
        const words = sentence.split(/\s+/);
        let wordChunk = "";
        for (const word of words) {
          if ((wordChunk + word).length > maxChars) {
            chunks.push(wordChunk.trim());
            wordChunk = word + " ";
          } else {
            wordChunk += word + " ";
          }
        }
        if (wordChunk.trim()) currentChunk = wordChunk;
        continue;
      }
      if ((currentChunk + sentence).length > maxChars) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks.filter((chunk) => chunk.length > 0);
  }
}

module.exports = BaseAIProvider;
