/**
 * Custom Error Classes for AI Provider Operations
 * Enables intelligent retry policies and better debugging
 */

/**
 * Parse Error - Thrown when JSON parsing fails
 * Retryable: Yes - LLM might produce valid JSON on retry
 */
class ParseError extends Error {
  constructor(message, rawInput = null) {
    super(message);
    this.name = "ParseError";
    this.rawInput = rawInput;
    this.retryable = true;
  }
}

/**
 * Validation Error - Thrown when Zod validation fails
 * Retryable: No - Known bad schema, retrying won't help
 */
class ValidationError extends Error {
  constructor(message, original = null, normalized = null, issues = []) {
    super(message);
    this.name = "ValidationError";
    this.original = original; // Original data from LLM
    this.normalized = normalized; // Data after normalization attempt
    this.issues = issues; // Zod validation issues
    this.retryable = false;
  }
}

/**
 * Inference Error - Thrown when answer inference fails
 * Retryable: Yes (once) - LLM might be clearer on retry with context
 */
class InferenceError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "InferenceError";
    this.context = context; // Additional context (question, options, etc.)
    this.retryable = true;
    this.maxRetries = 1; // Only retry once
  }
}

/**
 * Image Mode Error - Thrown when image-only mode requirements not met
 * Retryable: Yes - LLM might include images on retry with clearer prompt
 */
class ImageModeError extends Error {
  constructor(message, questions = []) {
    super(message);
    this.name = "ImageModeError";
    this.questions = questions; // Questions that failed image requirement
    this.retryable = true;
  }
}

module.exports = {
  ParseError,
  ValidationError,
  InferenceError,
  ImageModeError,
};
