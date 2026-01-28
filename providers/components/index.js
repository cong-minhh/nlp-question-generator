/**
 * Provider Components Index
 * Exports all modular components for AI provider implementations
 */

// Error Classes
const {
  ParseError,
  ValidationError,
  InferenceError,
  ImageModeError,
} = require("./errors");

// Answer Matching
const { AnswerMatcher, MatchConfidence } = require("./answerMatcher");

// Prompt Building
const { PromptBuilder, PedagogyPlugin } = require("./promptBuilder");

// Response Parsing
const { LLMResponseParser } = require("./llmResponseParser");

// Validation
const {
  QuestionValidator,
  QuestionSchema,
  QuestionSchemaBase,
  AIResponseSchema,
  createQuestionSchema,
  createAIResponseSchema,
  normalizeCorrectAnswer,
} = require("./questionValidator");

module.exports = {
  // Errors
  ParseError,
  ValidationError,
  InferenceError,
  ImageModeError,

  // Matching
  AnswerMatcher,
  MatchConfidence,

  // Prompt
  PromptBuilder,
  PedagogyPlugin,

  // Parser
  LLMResponseParser,

  // Validation
  QuestionValidator,
  QuestionSchema,
  QuestionSchemaBase,
  AIResponseSchema,
  createQuestionSchema,
  createAIResponseSchema,
  normalizeCorrectAnswer,
};
