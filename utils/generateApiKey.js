#!/usr/bin/env node

const crypto = require('crypto');

/**
 * Generate a secure API key
 */
function generateApiKey() {
    // Generate 32 random bytes and convert to hex
    const randomBytes = crypto.randomBytes(32).toString('hex');
    
    // Format as nlp-qg-{random}
    return `nlp-qg-${randomBytes}`;
}

// If run directly, generate and print an API key
if (require.main === module) {
    const apiKey = generateApiKey();
    console.log('\n🔑 Generated API Key:\n');
    console.log(apiKey);
    console.log('\n📝 Add this to your .env file:');
    console.log(`SERVER_API_KEY=${apiKey}`);
    console.log('\n⚠️  Keep this key secret and secure!\n');
}

module.exports = { generateApiKey };
