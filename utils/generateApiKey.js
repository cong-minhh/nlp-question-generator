#!/usr/bin/env node

const crypto = require('crypto');
const { logger } = require('./logger');

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
    logger.info('\nGenerated API Key:\n');
    logger.info(apiKey);
    logger.info('\nAdd this to your .env file:');
    logger.info(`SERVER_API_KEY=${apiKey}`);
    logger.info('\nKeep this key secret and secure!\n');
}

module.exports = { generateApiKey };
