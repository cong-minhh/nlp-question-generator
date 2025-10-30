/**
 * Example test script for the NLP Question Generator API
 * 
 * This script demonstrates how to use the API to generate questions
 * Run this after starting the server with: node index.js
 * 
 * Usage: node test-example.js
 */

const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/generate';

// Sample educational text
const sampleText = `
Machine Learning is a subset of Artificial Intelligence that enables computers to learn from data without being explicitly programmed. 
There are three main types of machine learning: supervised learning, unsupervised learning, and reinforcement learning.

Supervised learning uses labeled data to train models. The algorithm learns from input-output pairs and can then make predictions on new, unseen data.
Common applications include image classification, spam detection, and price prediction.

Unsupervised learning works with unlabeled data and tries to find hidden patterns or structures. Clustering and dimensionality reduction are 
typical unsupervised learning tasks. This approach is useful when you don't have labeled training data.

Reinforcement learning involves an agent learning to make decisions by interacting with an environment. The agent receives rewards or penalties 
based on its actions and learns to maximize cumulative reward over time. This is commonly used in robotics, game playing, and autonomous systems.

Neural networks are a key technology in modern machine learning, inspired by biological neural networks. Deep learning, which uses neural networks 
with many layers, has achieved remarkable success in computer vision, natural language processing, and speech recognition.
`;

async function testGenerateQuestions() {
    try {
        console.log('Testing NLP Question Generator API...\n');
        console.log('Sending request to:', API_URL);
        console.log('Number of questions requested: 5\n');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: sampleText,
                num_questions: 5
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Error:', error);
            return;
        }

        const data = await response.json();
        
        console.log('✅ Success! Generated', data.questions.length, 'questions:\n');
        console.log('='.repeat(80));

        data.questions.forEach((q, index) => {
            console.log(`\nQuestion ${index + 1} [${q.difficulty.toUpperCase()}]:`);
            console.log(q.questiontext);
            console.log(`\n  A) ${q.optiona}`);
            console.log(`  B) ${q.optionb}`);
            console.log(`  C) ${q.optionc}`);
            console.log(`  D) ${q.optiond}`);
            console.log(`\n  ✓ Correct Answer: ${q.correctanswer}`);
            console.log('-'.repeat(80));
        });

        console.log('\n📊 Statistics:');
        const difficulties = data.questions.reduce((acc, q) => {
            acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
            return acc;
        }, {});
        
        console.log('  Easy:', difficulties.easy || 0);
        console.log('  Medium:', difficulties.medium || 0);
        console.log('  Hard:', difficulties.hard || 0);

        console.log('\n✨ Full JSON Response:');
        console.log(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Make sure the server is running on http://localhost:3000');
    }
}

// Run the test
testGenerateQuestions();

