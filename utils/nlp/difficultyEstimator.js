/**
 * Difficulty Estimator
 * Estimates text complexity using readability formulas and heuristics.
 */
class DifficultyEstimator {

    /**
     * Estimate difficulty score and label
     * @param {string} text 
     * @returns {Object} { score: number (0-100), label: 'easy'|'medium'|'hard' }
     */
    estimateDifficulty(text) {
        if (!text) return { score: 0, label: 'easy' };

        // Clean text
        const cleanText = text.replace(/[^a-zA-Z\s.]/g, '');
        const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = cleanText.split(/\s+/).filter(w => w.length > 0);
        
        if (words.length === 0 || sentences.length === 0) {
            return { score: 0, label: 'easy' };
        }

        const avgSentenceLength = words.length / sentences.length;
        
        // Count syllables (heuristic)
        let syllableCount = 0;
        words.forEach(word => {
            syllableCount += this.countSyllables(word);
        });

        const avgSyllablesPerWord = syllableCount / words.length;

        // Flesch-Kincaid reading ease approx
        // 206.835 - 1.015(total words / total sentences) - 84.6(total syllables / total words)
        // Score: 90-100: Very Easy, 60-70: Standard, 0-30: Very Confusing
        let fkScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
        
        // Normalize to our 0-100 scale where 100 is HARD
        // Using FK: 100 is easy, 0 is hard.
        // So we invert it.
        let difficultyScore = 100 - Math.min(Math.max(fkScore, 0), 100);

        // Adjust for length/vocabulary
        // ... (can add more heuristics here)

        let label = 'medium';
        if (difficultyScore < 40) label = 'easy';
        else if (difficultyScore > 70) label = 'hard';

        return {
            score: Math.round(difficultyScore),
            label,
            metrics: {
                avgSentenceLength,
                avgSyllablesPerWord: avgSyllablesPerWord.toFixed(2),
                fkScore: fkScore.toFixed(2)
            }
        };
    }

    countSyllables(word) {
        word = word.toLowerCase();
        if (word.length <= 3) return 1;
        word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
        word = word.replace(/^y/, '');
        const matches = word.match(/[aeiouy]{1,2}/g);
        return matches ? matches.length : 1;
    }
}

module.exports = new DifficultyEstimator();
