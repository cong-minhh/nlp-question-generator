const path = require('path');
const ProviderManager = require('../providers/providerManager');
const { MultiProviderQuestionGenerator } = require('../services/questionGenerator');
const { logger } = require('../utils/logger');

// Mock config
const config = {
    defaultProvider: 'local', // Use local to avoid API costs if possible, or gemini
    local: {
        baseUrl: 'http://localhost:11434',
        model: 'llama3'
    }
};

async function runVerification() {
    console.log('--- Verifying NLP Integration ---\n');

    // 1. Initialize Provider Manager
    const providerManager = new ProviderManager(config);
    await providerManager.initialize();

    // 2. Initialize Question Generator (this is where our changes are)
    // We pass the providerManager manually as per server.js pattern
    process.env.DEDUP_ENABLED = 'true';
    const questionGenerator = new MultiProviderQuestionGenerator({});
    questionGenerator.providerManager = providerManager;
    await questionGenerator.initialize();

    console.log('\n✓ Services Initialized. Running Generation...\n');

    // 3. Prepare Input with NLP triggers
    // - "Important" keyword for AttentionDetector
    // - Complex sentence for DifficultyEstimator
    // - Repeated concept for KeywordExtractor
    const inputText = `
        Artificial Intelligence (AI) is transforming software engineering.
        Note: This is a very important point regarding the future of coding.
        
        The epistemological implications of large language models require rigorous scrutiny.
        AI agents are autonomous systems that can perceive and act.
        
        Artificial General Intelligence (AGI) is a hypothetical type of intelligent agent.
    `;

    // 4. Generate Questions
    // We'll mock the actual provider call to avoid external dependency if we want, 
    // OR we just rely on the fallback/local if available. 
    // For this test, valid generation is secondary to seeing the NLP logs.
    
    // To ensure we see logs, we rely on the logger which prints to stdout.
    
    try {
        const result = await questionGenerator.generateQuestions(inputText, {
            numQuestions: 2,
            deduplicate: true, // Enable deduplication to test our async changes
            difficulty: 'mixed'
        });

        console.log('\n--- Generation Result Meta ---');
        console.log(JSON.stringify(result.metadata, null, 2));
        
        if (result.questions.length > 0) {
            console.log('Sample Question:', result.questions[0].questiontext);
        }

    } catch (error) {
        console.error('Generation Error (Expected if no API key/local model, but check logs above for NLP steps):');
        console.error(error.message);
    }
}

// execute
runVerification();
