const { logger } = require('../utils/logger');

/**
 * Session Analyzer Service
 * Analyzes classroom session data to provide teaching insights
 */
class SessionAnalyzer {
    constructor(providerManager) {
        this.providerManager = providerManager;
    }

    /**
     * Generate teaching analysis from session data
     * @param {Object} sessionData - The session statistics and data
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} - Analysis result
     */
    async analyzeSession(sessionData, options = {}) {
        try {
            const provider = this.providerManager.getCurrentProvider();
            
            if (typeof provider.generateResponse !== 'function') {
                throw new Error(`Provider ${provider.name} does not support raw text generation (generateResponse)`);
            }

            const prompt = this.buildAnalysisPrompt(sessionData, options);
            
            logger.info(`Generating session analysis using ${provider.name}...`);
            const rawResponse = await provider.generateResponse(prompt);
            
            logger.info(`Session analysis completed`, { provider: provider.name, responseLength: rawResponse.length });

            // Parse the response (expecting JSON from the prompt instructions)
            return this.parseAnalysisResponse(rawResponse);
        } catch (error) {
            logger.error('Session analysis failed', error);
            throw error;
        }
    }

    /**
     * Build the analysis prompt
     * @param {Object} data - Session data
     * @returns {string} - The prompt
     */
    buildAnalysisPrompt(data, options) {
        // Format relevant data for the LLM
        const engagementStats = `
- Engagement Level: ${data.engagement?.percentage}% (${data.engagement?.level})
- Participation: ${data.engagement?.unique_participants}/${data.engagement?.total_enrolled} students
- Responsiveness: ${data.responsiveness?.pace || 'N/A'} (Avg Time: ${data.responsiveness?.avg_time || 0}s)
`;

        const comprehensionStats = `
- Overall Comprehension: ${data.comprehension?.level} (Avg Correctness: ${data.comprehension?.avg_correctness}%)
- Confused Topics: ${data.comprehension?.confused_topics?.join(', ') || 'None'}
`;

        const activitiesStats = `
- Questions Answered: ${data.activity_counts?.questions_answered}
- Polls: ${data.activity_counts?.poll_submissions}
`;

        // Add concept difficulty if available
        let conceptStats = '';
        if (data.concept_difficulty && data.concept_difficulty.length > 0) {
            conceptStats = '\n**Question Analysis (Concept Difficulty):**\n';
            data.concept_difficulty.forEach(c => {
                conceptStats += `- Q${c.question_order} [${c.difficulty_level}]: ${c.correctness_rate}% correct. Text: "${c.question_text}"\n`;
            });
        }

        return `You are an Expert Pedagogy Consultant and Data Scientist specializing in educational technology.
You are analyzing data from a specific session of "ClassEngage", a Moodle plugin that facilitates real-time classroom engagement (similar to Kahoot! or Mentimeter).

**CONTEXT:**
- The teacher used this session to engage students with live questions/slides.
- The data represents real-time responses.
- "Engagement" refers to the % of enrolled students who actively participated.
- "Comprehension" is based on the correctness of their answers.

**SESSION DATA:**
${engagementStats}
${comprehensionStats}
${activitiesStats}
${conceptStats}

**INSTRUCTIONS:**
1. **Analyze Bloom's Taxonomy**: For the provided "Question Analysis" items, infer the likely cognitive level based on the question text. Note if students struggled with higher-order thinking vs. basic recall.
2. **Correlate Difficulty**: Check if low correctness correlates with high cognitive load or if basic concepts were missed.
3. **Identify Patterns**: Look for trends (e.g., "Students dropped off after Q3" or "All calculations were incorrect").
4. **Language Style**: Write in clear, simple, professional English suitable for non-native English speaking teachers. Avoid overly complex jargon.

**GOAL:**
Help the teacher improve their next class. Provide "Useful Effective Recommendations" that are specific, not generic.

**OUTPUT FORMAT:**
Return ONLY a valid JSON object with the following structure:
{
    "summary": "1-2 sentence executive summary of the session performance. Use simple, direct language.",
    "strengths": ["Bulleted list of 1-3 specific positives (e.g., 'Strong performance on application questions like Q3')"],
    "areas_for_improvement": ["Bulleted list of 1-3 critical issues. PINPOINT specific concepts that need reteaching (e.g., 'Students did not understand [Specific Concept] in Q5. You should reteach this.')"],
    "actionable_advice": ["Bulleted list of 1-3 specific teaching strategies. Focus on HOW to reteach the difficult concepts identified above (e.g., 'Use a diagram to explain [Concept]' or 'Review [Topic] with a paired activity')."]
}

Do not include markdown formatting (like \`\`\`json) in the response, just the raw JSON string if possible.`;
    }

    /**
     * Parse and validate the analysis response
     * @param {string} rawResponse 
     * @returns {Object}
     */
    parseAnalysisResponse(rawResponse) {
        let cleaned = rawResponse.trim();
        // Remove markdown code blocks if present
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        try {
            const parsed = JSON.parse(cleaned);
            // Basic validation
            if (!parsed.summary || !Array.isArray(parsed.strengths)) {
                throw new Error('Invalid analysis format');
            }
            return parsed;
        } catch (e) {
            logger.error('Failed to parse analysis JSON', { raw: rawResponse });
            // Fallback object to avoid crashing client
            return {
                summary: "Analysis generated but format was invalid.",
                strengths: ["Could not parse details."],
                areas_for_improvement: [],
                actionable_advice: ["Please try generating analysis again."]
            };
        }
    }
}

module.exports = SessionAnalyzer;
