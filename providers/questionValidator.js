/**
 * QuestionValidator - Zod schema validation for AI responses
 * Separates validation logic from provider implementation
 */

const { z } = require("zod");

/**
 * Normalize correctanswer from various LLM formats
 * @param {*} value
 * @returns {string}
 */
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

  // 4. Option prefix: "OPTION A", "ANSWER: A"
  const cleanStr = str.replace(/['"]/g, "");
  const complexMatch = cleanStr.match(
    /\b(?:OPTION|ANSWER|IS)\s*[:\-]?\s*[\(\[]?([ABCD])[\)\]]?/,
  );
  if (complexMatch) return complexMatch[1];

  // 5. Fallback: Check if starts with A/B/C/D
  const startMatch = cleanStr.match(/^([ABCD])(?:\W|$)/);
  if (startMatch) return startMatch[1];

  return str;
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

/**
 * Create question schema with optional image-only mode enforcement
 * @param {boolean} isImageOnlyMode
 * @returns {z.ZodSchema}
 */
const createQuestionSchema = (isImageOnlyMode = false) => {
  if (!isImageOnlyMode) {
    return QuestionSchemaBase;
  }

  return QuestionSchemaBase.refine(
    (q) => q.question_image != null && q.question_image.length > 0,
    { message: "question_image is required in image-only mode" },
  );
};

/**
 * Create AI response schema
 * @param {boolean} isImageOnlyMode
 * @returns {z.ZodSchema}
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

// Default schemas for backward compatibility
const QuestionSchema = QuestionSchemaBase;
const AIResponseSchema = z.object({
  analysis: z.string().optional(),
  questions: z
    .array(QuestionSchema)
    .min(1, "At least one question is required"),
});

class QuestionValidator {
  /**
   * Validate parsed data against schema
   * @param {Object} parsedData
   * @param {Object} options
   * @returns {Object} { success, data, error }
   */
  static validate(parsedData, options = {}) {
    const { isImageOnlyMode = false } = options;
    const schema = createAIResponseSchema(isImageOnlyMode);
    return schema.safeParse(parsedData);
  }

  /**
   * Get human-readable error message from validation result
   * @param {Object} validationResult
   * @returns {string}
   */
  static formatErrors(validationResult) {
    if (validationResult.success) return "";
    return validationResult.error.issues
      .map((issue) => `Field '${issue.path.join(".")}' - ${issue.message}`)
      .join("; ");
  }
}

module.exports = {
  QuestionValidator,
  QuestionSchema,
  QuestionSchemaBase,
  AIResponseSchema,
  createQuestionSchema,
  createAIResponseSchema,
  normalizeCorrectAnswer,
};
