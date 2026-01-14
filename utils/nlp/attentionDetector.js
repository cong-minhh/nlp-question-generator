/**
 * Attention Detector
 * Identifies important sections of text that should be prioritized for questions.
 */
class AttentionDetector {

    constructor() {
        this.importantKeywords = [
            'important', 'note', 'remember', 'summary', 'conclusion', 'key point', 
            'significantly', 'crucial', 'essential', 'warning', 'attention'
        ];
    }

    /**
     * Detect important sections in text
     * @param {string} text 
     * @returns {Array<{text: string, score: number, reason: string}>}
     */
    detectImportantSections(text) {
        if (!text) return [];

        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const importantSections = [];

        sentences.forEach(sentence => {
            const lower = sentence.toLowerCase();
            let score = 0;
            const reasons = [];

            // Check for keywords
            this.importantKeywords.forEach(kw => {
                if (lower.includes(kw)) {
                    score += 2;
                    reasons.push(`Contains keyword "${kw}"`);
                }
            });

            // Check for comparisons
            if (lower.includes('difference between') || lower.includes('compared to') || lower.includes('unlike')) {
                score += 1;
                reasons.push('Contains comparison');
            }

            // Check for definitions
            if (lower.includes(' is defined as ') || lower.includes(' refers to ')) {
                score += 3;
                reasons.push('Contains definition');
            }

            if (score > 0) {
                importantSections.push({
                    text: sentence.trim(),
                    score,
                    reason: reasons.join(', ')
                });
            }
        });

        // Sort by score
        return importantSections.sort((a, b) => b.score - a.score);
    }
}

module.exports = new AttentionDetector();
