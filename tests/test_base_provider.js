/**
 * Unit Tests for BaseProvider Refactoring
 * Tests: Error classes, AnswerMatcher, safeJSONParse modes, image-only validation
 */

const BaseAIProvider = require("../providers/baseProvider");
const {
  ParseError,
  ValidationError,
  InferenceError,
  ImageModeError,
} = require("../providers/errors");
const {
  AnswerMatcher,
  MatchConfidence,
} = require("../providers/answerMatcher");
const ErrorHandler = require("../utils/errorHandler");

console.log("🧪 BaseProvider Refactoring Tests\n");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`❌ ${name}: ${e.message}`);
  }
}

function assertEqual(actual, expected, msg = "") {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}. ${msg}`);
  }
}

function assertTrue(condition, msg = "") {
  if (!condition) {
    throw new Error(`Assertion failed. ${msg}`);
  }
}

// --- Error Classes Tests ---
console.log("📦 Error Classes\n");

test("ParseError has correct properties", () => {
  const err = new ParseError("Test error", "raw input");
  assertEqual(err.name, "ParseError");
  assertEqual(err.retryable, true);
  assertEqual(err.rawInput, "raw input");
  assertTrue(err instanceof Error);
});

test("ValidationError has correct properties", () => {
  const original = [{ q: 1 }];
  const normalized = [{ q: 2 }];
  const issues = [{ path: ["field"], message: "invalid" }];
  const err = new ValidationError("Test", original, normalized, issues);
  assertEqual(err.name, "ValidationError");
  assertEqual(err.retryable, false);
  assertEqual(err.original, original);
  assertEqual(err.normalized, normalized);
});

test("InferenceError has correct properties", () => {
  const err = new InferenceError("Test", { question: "What?" });
  assertEqual(err.name, "InferenceError");
  assertEqual(err.retryable, true);
  assertEqual(err.maxRetries, 1);
});

// --- ErrorHandler Integration ---
console.log("\n📦 ErrorHandler Integration\n");

test("ErrorHandler categorizes ParseError correctly", () => {
  const err = new ParseError("Parse failed", "{}");
  const category = ErrorHandler.categorizeError(err);
  assertEqual(category, ErrorHandler.ErrorTypes.PARSING_ERROR);
});

test("ErrorHandler categorizes ValidationError correctly", () => {
  const err = new ValidationError("Validation failed", null, null, []);
  const category = ErrorHandler.categorizeError(err);
  assertEqual(category, ErrorHandler.ErrorTypes.VALIDATION_ERROR);
});

test("ErrorHandler.isTransient respects error.retryable", () => {
  const parseErr = new ParseError("Parse failed");
  const validationErr = new ValidationError("Invalid");

  assertTrue(
    ErrorHandler.isTransient(parseErr),
    "ParseError should be transient",
  );
  assertTrue(
    !ErrorHandler.isTransient(validationErr),
    "ValidationError should NOT be transient",
  );
});

// --- AnswerMatcher Tests ---
console.log("\n📦 AnswerMatcher\n");

test("matchExactOnly finds exact match", () => {
  const options = { A: "Binary Search", B: "Search", C: "Linear", D: "Hash" };
  const result = AnswerMatcher.matchExactOnly("Binary Search", options);
  assertEqual(result.key, "A");
  assertEqual(result.confidence, MatchConfidence.EXACT);
});

test("matchExactOnly finds case-insensitive match", () => {
  const options = { A: "Binary Search", B: "Search", C: "Linear", D: "Hash" };
  const result = AnswerMatcher.matchExactOnly("binary search", options);
  assertEqual(result.key, "A");
  assertEqual(result.confidence, MatchConfidence.EXACT);
});

test('matchExactOnly prevents false positive - "Search" should NOT match "Binary Search"', () => {
  const options = {
    A: "Binary Search",
    B: "Linear Search",
    C: "Hash Table",
    D: "Tree",
  };
  const result = AnswerMatcher.matchExactOnly("Search", options);
  // Should NOT match because "Search" is not an exact match to any option
  assertEqual(result.key, null);
  assertEqual(result.confidence, MatchConfidence.NONE);
});

test("isSafeToCorrect returns true for EXACT", () => {
  assertTrue(AnswerMatcher.isSafeToCorrect(MatchConfidence.EXACT));
});

test("isSafeToCorrect returns true for HIGH", () => {
  assertTrue(AnswerMatcher.isSafeToCorrect(MatchConfidence.HIGH));
});

test("isSafeToCorrect returns false for LOW", () => {
  assertTrue(!AnswerMatcher.isSafeToCorrect(MatchConfidence.LOW));
});

test("isSafeToCorrect returns false for NONE", () => {
  assertTrue(!AnswerMatcher.isSafeToCorrect(MatchConfidence.NONE));
});

// --- safeJSONParse Tests ---
console.log("\n📦 safeJSONParse\n");

const provider = new BaseAIProvider();

test("safeJSONParse strict mode parses valid JSON", () => {
  const input = '{"questions": [{"text": "What?"}]}';
  const result = provider.safeJSONParse(input, { mode: "strict" });
  assertTrue(result.questions !== undefined);
  assertEqual(result.questions[0].text, "What?");
});

test("safeJSONParse strict mode handles markdown wrapping", () => {
  const input = '```json\n{"questions": [{"text": "Test"}]}\n```';
  const result = provider.safeJSONParse(input, { mode: "strict" });
  assertEqual(result.questions[0].text, "Test");
});

test("safeJSONParse strict mode throws ParseError on malformed JSON", () => {
  const input = '{"questions": [{"text": "Broken"';
  try {
    provider.safeJSONParse(input, { mode: "strict" });
    throw new Error("Should have thrown");
  } catch (e) {
    assertTrue(e instanceof ParseError, "Should throw ParseError");
  }
});

test("safeJSONParse repair mode fixes missing commas", () => {
  // Missing comma between objects
  const input = '{"questions": [{"text": "Q1"}{"text": "Q2"}]}';
  const result = provider.safeJSONParse(input, { mode: "repair" });
  assertEqual(result.questions.length, 2);
});

test("safeJSONParse removes <think> blocks", () => {
  const input = '<think>This is reasoning</think>{"questions": []}';
  const result = provider.safeJSONParse(input, { mode: "strict" });
  assertTrue(result.questions !== undefined);
});

// --- Summary ---
console.log("\n---------------------------------------------------");
console.log(`Tests: ${passed}/${total} passed`);
if (passed === total) {
  console.log("🎉 All tests passed!");
} else {
  console.log(`⚠️  ${total - passed} tests failed`);
  process.exit(1);
}
