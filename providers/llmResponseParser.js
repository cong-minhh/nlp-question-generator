/**
 * LLMResponseParser - Parse and normalize LLM responses
 * Handles JSON extraction, structural normalization, and answer correction
 */

const { logger } = require("../utils/logger");
const { ParseError } = require("./errors");
const { AnswerMatcher, MatchConfidence } = require("./answerMatcher");
const { normalizeCorrectAnswer } = require("./questionValidator");

class LLMResponseParser {
  /**
   * Parse raw LLM response to JSON
   * @param {string} rawResponse
   * @param {Object} options
   * @param {string} options.mode - 'strict' or 'repair'
   * @returns {Object}
   */
  static parse(rawResponse, { mode = "strict" } = {}) {
    if (!rawResponse || typeof rawResponse !== "string") {
      throw new ParseError(
        "Invalid response: Expected non-empty string",
        rawResponse,
      );
    }

    // 1. Basic Markdown Cleaning
    let cleaned = rawResponse.trim();
    cleaned = cleaned
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*/gi, "")
      .replace(/<\/think>/gi, "")
      .replace(/<think>/gi, "");

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

    // 3. Repair mode: Fix structural errors
    if (mode === "repair") {
      if (jsonString.includes('"questions"') && !jsonString.match(/\]\s*\}/)) {
        const lastBraceIndex = jsonString.lastIndexOf("}");
        if (lastBraceIndex > 0) {
          jsonString = jsonString.substring(0, lastBraceIndex + 1) + "\n  ]\n}";
        }
      }

      jsonString = jsonString
        .replace(/}(\s+){/g, "},\n{")
        .replace(/}({)/g, "},$1")
        .replace(/"\s*\n\s*"/g, '",\n"')
        .replace(/"(\s*\n\s*)"(\w+)":/g, '",$1"$2":')
        .replace(/,(\s*[\}\]])/g, "$1");

      logger.debug("[LLMResponseParser] Repair mode applied structural fixes");
    }

    // 4. Character Level Cleaning
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
        if (charCode >= 0x20 || "\n\r\t ".includes(char)) {
          result += char;
        }
      }
    }

    // 5. Parse
    try {
      return JSON.parse(result);
    } catch (parseError) {
      logger.error(`JSON Parse failed (mode: ${mode}): ${parseError.message}`);
      if (mode === "strict") {
        logger.info(
          "[LLMResponseParser] Strict mode failed - consider mode: repair",
        );
      }
      throw new ParseError(
        `JSON Parse Error: ${parseError.message}`,
        rawResponse,
      );
    }
  }

  /**
   * Normalize response structure (array to object, single question to array)
   * @param {*} parsedData
   * @returns {Object}
   */
  static normalizeStructure(parsedData) {
    if (Array.isArray(parsedData)) {
      return { questions: parsedData };
    }
    if (parsedData && !parsedData.questions && parsedData.questiontext) {
      return { questions: [parsedData] };
    }
    return parsedData;
  }

  /**
   * Normalize answers using confidence-based matching
   * @param {Object} parsedData
   * @returns {Object}
   */
  static normalizeAnswers(parsedData) {
    if (!parsedData || !Array.isArray(parsedData.questions)) {
      return parsedData;
    }

    for (const q of parsedData.questions) {
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

          const match = AnswerMatcher.matchExactOnly(answerText, options);
          if (AnswerMatcher.isSafeToCorrect(match.confidence)) {
            q.correctanswer = match.key;
            normalized = match.key;
            logger.debug(
              `[LLMResponseParser] Answer corrected: "${answerText}" -> "${match.key}"`,
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

        // Try rationale parsing
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

        if (["A", "B", "C", "D"].includes(normalized)) {
          q.correctanswer = normalized;
        }
      } else {
        q.correctanswer = normalized;
      }
    }

    return parsedData;
  }
}

module.exports = { LLMResponseParser };
