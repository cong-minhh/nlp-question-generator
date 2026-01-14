const natural = require('natural');
const TfIdf = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();

/**
 * Keyword Extractor
 * Identifies important concepts/keywords in text using TF-IDF
 */
class KeywordExtractor {
    constructor() {
        this.stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'this', 'that', 'these', 'those', 'it', 'they', 'them',
            'what', 'which', 'who', 'whom', 'whose',
            'can', 'could', 'will', 'would', 'shall', 'should',
            'have', 'has', 'had',
            'not', 'no', 'yes'
        ]);
    }

    /**
     * Extract top keywords from text
     * @param {string} text - Input text
     * @param {number} count - Number of keywords to return
     * @returns {Array<string>} - List of keywords
     */
    extractKeywords(text, count = 10) {
        if (!text || typeof text !== 'string') return [];

        const tfidf = new TfIdf();
        tfidf.addDocument(text);

        const items = [];

        tfidf.listTerms(0 /* doc index */).forEach(item => {
            // item = { term: 'word', tfidf: scores }
            // Filter short words and numbers
            if (item.term.length > 2 && isNaN(item.term) && !this.stopwords.has(item.term.toLowerCase())) {
                items.push(item);
            }
        });

        // Already sorted by tfidf desc by natural
        return items.slice(0, count).map(i => i.term);
    }

    /**
     * Extract key phrases (RAKE-like heuristic currently)
     * For now, we'll keep it simple and just return the keywords.
     * In a future update, we could look for adjacent high-scoring words.
     */
    extractKeyPhrases(text, count = 5) {
       // Placeholder for phrase extraction
       return this.extractKeywords(text, count);
    }
}

module.exports = new KeywordExtractor();
