/**
 * PromptBuilder - Composable prompt construction for AI providers
 * Separates prompt engineering from provider logic
 */

const { logger } = require("../utils/logger");

class PromptBuilder {
  constructor() {
    this.sections = {
      systemRole: "",
      inputContext: "",
      images: "",
      distribution: "",
      pedagogy: "",
      outputFormat: "",
      execution: "",
    };
    this.isImageOnlyMode = false;
  }

  /**
   * Set system role instruction
   * @param {string} role - Custom role or use default
   * @returns {PromptBuilder}
   */
  withSystemRole(role = null) {
    this.sections.systemRole =
      role ||
      `
<system_role>
You are an Expert University Lecturer and Assessment Specialist.
Your goal is to create a high-quality, academically rigorous exam for international students.
</system_role>`;
    return this;
  }

  /**
   * Set input context (text and/or images)
   * @param {string} text - Source text
   * @param {Array} imageMetadata - Available images with IDs
   * @returns {PromptBuilder}
   */
  withInputContext(text, imageMetadata = []) {
    const hasImages = imageMetadata && imageMetadata.length > 0;
    const textLength = (text || "").toString().trim().length;
    this.isImageOnlyMode = hasImages && textLength < 50;

    let imageInventory = "";
    if (hasImages) {
      const imageList = imageMetadata
        .map(
          (img, idx) =>
            `   - Image ${idx + 1} (imageId: "${img.imageId}") - from ${img.label || `Page ${img.page}`}`,
        )
        .join("\n");

      if (this.isImageOnlyMode) {
        imageInventory = `
<available_images>
IMPORTANT: This is an IMAGE-BASED question generation request.
The following ${imageMetadata.length} image(s) are the PRIMARY source material - you MUST analyze them carefully.

${imageList}

You MUST:
1. Carefully examine EACH attached image to understand its content
2. Generate questions based on what you SEE in the image(s)
3. Include the imageId in the "question_image" field for EVERY question
4. Reference the image content naturally in your questions
</available_images>`;
      } else {
        imageInventory = `
<available_images>
The following ${imageMetadata.length} image(s) are attached and visible to you.
When you create a question that references one of these images, include its imageId in the "question_image" field.

${imageList}

IMPORTANT: Match figures/tables in the text to these images based on what you see in them.
</available_images>`;
      }
    }

    this.sections.inputContext = `
<input_context>
${
  this.isImageOnlyMode
    ? `There is NO text content provided. You must generate questions by analyzing the attached image(s) below.`
    : `The following text is the source material for the exam:
"""
${text}
"""`
}
${imageInventory}
</input_context>`;

    return this;
  }

  /**
   * Set distribution requirements
   * @param {Object} options - numQuestions, difficulty, bloomLevel, distributionPlan
   * @returns {PromptBuilder}
   */
  withDistribution({
    numQuestions = 10,
    difficulty = "mixed",
    bloomLevel = "apply",
    distributionPlan = null,
  }) {
    if (distributionPlan && distributionPlan.breakdown) {
      const breakdownList = distributionPlan.breakdown
        .map(
          (item) =>
            `   - ${item.count} questions: Difficulty [${item.difficulty.toUpperCase()}], Bloom Level [${item.bloomLevel.toUpperCase()}]`,
        )
        .join("\n");

      this.sections.distribution = `
<distribution_requirements>
You must STRICTLY follow this question breakdown:
${breakdownList}
Total Questions: ${numQuestions}
</distribution_requirements>`;
    } else {
      this.sections.distribution = `
<distribution_requirements>
- Total Questions: ${numQuestions}
- Difficulty: ${difficulty.toUpperCase()}
- Bloom's Level: ${bloomLevel.toUpperCase()}
</distribution_requirements>`;
    }
    return this;
  }

  /**
   * Add pedagogical guidelines (Bloom taxonomy, design rules)
   * @param {string|Array} bloomLevels - Single level or array of levels
   * @param {Object} bloomPlugin - Optional PedagogyPlugin for definitions
   * @returns {PromptBuilder}
   */
  withPedagogy(bloomLevels, bloomPlugin = null) {
    const levels = Array.isArray(bloomLevels) ? bloomLevels : [bloomLevels];
    const plugin = bloomPlugin || PedagogyPlugin;

    const bloomDefinitions = levels
      .map((level) => plugin.getBloomDefinition(level))
      .join("");

    this.sections.pedagogy = `
<pedagogical_guidelines>
<blooms_taxonomy_definitions>
${bloomDefinitions}
</blooms_taxonomy_definitions>

<design_rules>
1. **CLARITY:** Use professional, standard English. Accessible to non-native speakers (CEFR B2+).
2. **RIGOR:** Questions must test concepts, not just vocabulary.
3. **DISTRACTORS:** Must be plausible, roughly same length, and clearly incorrect.
4. **RATIONALE:** Provide clear explanation for correct answer and why distractors are wrong.
5. **IMAGE REFERENCE:** If a question is about a specific figure/table/image:
   - In questiontext: refer to it naturally (e.g., "According to Figure 3...")
   - In question_image: put the imageId from <available_images>
</design_rules>
</pedagogical_guidelines>`;
    return this;
  }

  /**
   * Set output format specification
   * @returns {PromptBuilder}
   */
  withOutputFormat() {
    this.sections.outputFormat = `
<output_format>
IMPORTANT: You must output ONLY a valid JSON object.
- NO introductory text.
- NO markdown formatting.
- NO "<think>" tags in the final JSON output.
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
      "question_image": ${this.isImageOnlyMode ? '"img_ID_here"' : "null"}
    }
  ]
}

CRITICAL RULES:
1. "correctanswer" MUST be exactly one letter: "A", "B", "C", or "D".
2. Do NOT write the full answer text in "correctanswer".
3. Ensure all JSON syntax is correct (commas, quotes, brackets).
</output_format>`;
    return this;
  }

  /**
   * Set execution instructions
   * @returns {PromptBuilder}
   */
  withExecution() {
    this.sections.execution = `
<execution_step>
${
  this.isImageOnlyMode
    ? "Carefully analyze the attached image(s). Identify key concepts, data, diagrams, or information visible in them. Generate questions that test understanding of this visual content."
    : "Analyze the text, plan the questions according to the <distribution_requirements>, and generate the JSON response."
}
</execution_step>`;
    return this;
  }

  /**
   * Build the final prompt string
   * @returns {string}
   */
  build() {
    return `${this.sections.systemRole}
${this.sections.inputContext}

<task_configuration>
${this.sections.distribution}
</task_configuration>

${this.sections.pedagogy}

${this.sections.outputFormat}

${this.sections.execution}`;
  }

  /**
   * Get whether this is image-only mode
   * @returns {boolean}
   */
  getIsImageOnlyMode() {
    return this.isImageOnlyMode;
  }
}

/**
 * PedagogyPlugin - Bloom taxonomy definitions and educational helpers
 * Can be extended or replaced for different educational frameworks
 */
class PedagogyPlugin {
  static definitions = {
    remember: "REMEMBER: Recall facts and basic concepts.",
    understand: "UNDERSTAND: Explain ideas or concepts.",
    apply: "APPLY: Use information in new situations.",
    analyze: "ANALYZE: Draw connections among ideas.",
    evaluate: "EVALUATE: Justify a stand or decision.",
    create: "CREATE: Produce new or original work.",
  };

  /**
   * Get formatted Bloom taxonomy definition
   * @param {string} level
   * @returns {string}
   */
  static getBloomDefinition(level) {
    const key = level.toLowerCase();
    const def = this.definitions[key] || this.definitions.apply;
    return `    - ${def}\n`;
  }

  /**
   * Get all available Bloom levels
   * @returns {Array<string>}
   */
  static getAvailableLevels() {
    return Object.keys(this.definitions);
  }

  /**
   * Validate if a level is valid
   * @param {string} level
   * @returns {boolean}
   */
  static isValidLevel(level) {
    return level && this.definitions[level.toLowerCase()] !== undefined;
  }
}

module.exports = {
  PromptBuilder,
  PedagogyPlugin,
};
