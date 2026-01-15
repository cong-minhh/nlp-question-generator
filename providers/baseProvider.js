/**
 * Base AI Provider Interface with Advanced NLP Patterns
 * All AI providers must implement these methods
 */

const { logger } = require("../utils/logger");
const { z } = require("zod");

// --- VALIDATION SCHEMAS (Best Practice) ---

const QuestionSchema = z.object({
  questiontext: z.string().min(1, "Question text is required"),
  optiona: z.string().min(1, "Option A is required"),
  optionb: z.string().min(1, "Option B is required"),
  optionc: z.string().min(1, "Option C is required"),
  optiond: z.string().min(1, "Option D is required"),
  correctanswer: z.enum(["A", "B", "C", "D"]),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("medium"),
  cognitive_level: z.string().optional(),
  rationale: z.string().optional(),
});

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
   * Robust JSON Parser - All-in-One Implementation
   * Handles markdown stripping, structural fixing, and character cleaning.
   */
  safeJSONParse(rawResponse) {
    if (!rawResponse || typeof rawResponse !== "string") {
      throw new Error("Invalid response: Expected non-empty string");
    }

    // 1. Basic Markdown Cleaning
    let cleaned = rawResponse.trim();
    cleaned = cleaned
      .replace(/```json\s*/gi, "")
      .replace(/```javascript\s*/gi, "")
      .replace(/```\s*/g, "");

    // 2. Extract JSON Blob
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      throw new Error("Invalid JSON structure: No valid JSON object found");
    }

    let jsonString = cleaned.substring(firstBrace, lastBrace + 1);

    // 3. Fix Common AI Structural Errors (Missing commas, unclosed arrays)
    if (jsonString.includes('"questions"') && !jsonString.match(/\]\s*\}/)) {
      const lastBraceIndex = jsonString.lastIndexOf("}");
      if (lastBraceIndex > 0) {
        jsonString = jsonString.substring(0, lastBraceIndex + 1) + "\n  ]\n}";
      }
    }

    // Fix missing commas between objects and properties
    jsonString = jsonString
      .replace(/}(\s+){/g, "},\n{") // } { -> }, {
      .replace(/}({)/g, "},$1") // } { -> }, { (no space)
      .replace(/"\s*\n\s*"/g, '",\n"') // "line"\n"line" -> "line",\n"line"
      .replace(/"(\s*\n\s*)"(\w+)":/g, '",$1"$2":') // "val" "key": -> "val", "key":
      .replace(/,(\s*[}\]])/g, "$1"); // Remove trailing commas

    // 4. Character Level Cleaning (Control chars inside/outside strings)
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
      // Logic for aggressive retry could go here, but usually above fixes catch 99%
      logger.error(`JSON Parse failed: ${parseError.message}`);
      throw new Error(`JSON Parse Error: ${parseError.message}`);
    }
  }

  /**
   * Standardize and Validate using Zod
   */
  standardizeResponse(response, numQuestions = 10) {
    // 1. Ensure we have an object
    let parsedData = response;
    if (typeof response === "string") {
      try {
        parsedData = this.safeJSONParse(response);
      } catch (error) {
        throw new Error(
          `Failed to parse JSON for standardization: ${error.message}`
        );
      }
    }

    // 2. Handle cases where AI returns just an array instead of { questions: [] }
    if (Array.isArray(parsedData)) {
      parsedData = { questions: parsedData };
    }

    // 3. Validate with Zod
    const result = AIResponseSchema.safeParse(parsedData);

    if (!result.success) {
      const errorMsg = result.error.issues
        .map((issue) => `Field '${issue.path.join(".")}' - ${issue.message}`)
        .join("; ");
      logger.error(`Validation Failed: ${errorMsg}`);
      throw new Error(`AI Response Validation Failed: ${errorMsg}`);
    }

    // 4. Return valid data
    const validData = result.data;

    return {
      questions: validData.questions.map((q) => ({
        ...q,
        difficulty: q.difficulty.toLowerCase(),
      })),
      provider: this.name,
      analysis: validData.analysis || "No analysis provided",
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
    } = options;

    let sourceText =
      typeof text === "object" && text !== null
        ? text.text || JSON.stringify(text)
        : text;
    let difficultyRequirements = "";
    let bloomDefinitions = "";

    if (distributionPlan && distributionPlan.breakdown) {
      // Strict Distribution Mode
      const breakdownList = distributionPlan.breakdown
        .map(
          (item) =>
            `   - ${
              item.count
            } questions: Difficulty [${item.difficulty.toUpperCase()}], Bloom Level [${item.bloomLevel.toUpperCase()}]`
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
The following text is the source material for the exam:
"""
${sourceText}
"""
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
    4. **RATIONALE:** Provide clear explanation for correct answer and why distractors are wrong.
    </design_rules>
</pedagogical_guidelines>

<output_format>
You must output ONLY a valid JSON object. Do not add conversational text.
Use this exact schema:
{
  "analysis": "Brief analysis of key concepts...",
  "questions": [
    {
      "questiontext": "Stem...",
      "optiona": "A", "optionb": "B", "optionc": "C", "optiond": "D",
      "correctanswer": "C",
      "difficulty": "medium",
      "cognitive_level": "apply",
      "rationale": "Explanation..."
    }
  ]
}
</output_format>

<execution_step>
Analyze the text, plan the questions according to the <distribution_requirements>, and generate the JSON response.
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

  // Utility: Split text
  splitTextIntoChunks(text, maxChars = 4000) {
    if (!text || text.length <= maxChars) return [text];
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+[\s\n]*/g) || [text];
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
