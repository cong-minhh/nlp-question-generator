const LocalEmbeddings = require('../utils/nlp/embeddings');
const KeywordExtractor = require('../utils/nlp/keywordExtractor');
const DifficultyEstimator = require('../utils/nlp/difficultyEstimator');
const AttentionDetector = require('../utils/nlp/attentionDetector');
const TextSimilarity = require('../utils/textSimilarity');

async function runTests() {
    console.log('--- Testing NLP Tools ---\n');

    // 1. Difficulty Estimator
    console.log('1. Testing Difficulty Estimator...');
    const easyText = "The cat sat on the mat. It was a sunny day.";
    const hardText = "The quantum mechanical implications of the Schrödinger equation necessitate a re-evaluation of our ontological framework regarding particle-wave duality.";
    
    const easyScore = DifficultyEstimator.estimateDifficulty(easyText);
    const hardScore = DifficultyEstimator.estimateDifficulty(hardText);
    
    console.log(`Easy Text Score: ${easyScore.score} (${easyScore.label})`);
    console.log(`Hard Text Score: ${hardScore.score} (${hardScore.label})`);
    
    if (easyScore.score < hardScore.score && easyScore.label === 'easy') {
        console.log('✓ Difficulty estimation seems correct.\n');
    } else {
        console.error('✗ Difficulty estimation unexpected.\n');
    }

    // 2. Keyword Extractor
    console.log('2. Testing Keyword Extractor...');
    const keywordText = "Artificial Intelligence is transforming the world of software engineering. Machine Learning models like GPT-4 are powerful tools.";
    const keywords = KeywordExtractor.extractKeywords(keywordText, 5);
    console.log(`Keywords: ${keywords.join(', ')}`);
    if (keywords.includes('artificial') || keywords.includes('intelligence')) {
        console.log('✓ Keywords extracted.\n');
    } else {
        console.error('✗ Keywords missing.\n');
    }

    // 3. Attention Detector
    console.log('3. Testing Attention Detector...');
    const attentionText = "This is general info. Note: This is a very important point. Summary: The project is a success.";
    const sections = AttentionDetector.detectImportantSections(attentionText);
    console.log('Detected Sections:', sections);
    if (sections.length >= 2 && sections[0].text.toLowerCase().includes('important')) {
        console.log('✓ Important sections detected.\n');
    } else {
        console.error('✗ Attention detection failed.\n');
    }

    // 4. Local Embeddings & Text Similarity
    console.log('4. Testing Embeddings (this may take a moment to load model)...');
    try {
        await LocalEmbeddings.initialize();
        const vec1 = await LocalEmbeddings.getEmbedding("Hello world");
        const vec2 = await LocalEmbeddings.getEmbedding("Hi earth");
        const vec3 = await LocalEmbeddings.getEmbedding("Banana split");
        
        if (vec1 && vec2) {
            const sim1 = LocalEmbeddings.cosineSimilarity(vec1, vec2);
            const sim2 = LocalEmbeddings.cosineSimilarity(vec1, vec3);
            
            console.log(`Similarity "Hello world" vs "Hi earth": ${sim1.toFixed(4)}`);
            console.log(`Similarity "Hello world" vs "Banana split": ${sim2.toFixed(4)}`);
            
            if (sim1 > sim2) {
                console.log('✓ Semantic similarity working.\n');
            } else {
                console.error('✗ Semantic similarity unexpected.\n');
            }
        } else {
            console.log('⚠ Embeddings generation returned null (model maybe failed to load).');
        }

        // Test TextSimilarity wrapper
        const wrapperSim = await TextSimilarity.semanticSimilarity("King", "Queen");
        console.log(`Wrapper Semantic Sim (King vs Queen): ${wrapperSim.toFixed(2)}%`);

    } catch (err) {
        console.error('Error testing embeddings:', err);
    }
}

runTests().catch(console.error);
