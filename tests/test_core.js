const { Logger } = require('../utils/logger');
const ErrorHandler = require('../utils/errorHandler');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting Core Infrastructure Tests...\n');

// --- Logger Tests ---
console.log('1. Testing Logger...');
try {
    const testLogFile = path.join(__dirname, '../logs/test_core.log');
    
    // Clean previous test
    if (fs.existsSync(testLogFile)) fs.unlinkSync(testLogFile);

    // Use standard logger behavior
    const logger = new Logger('TestLogger');
    
    // Force level to DEBUG for test by mocking process.env if needed, 
    // but default is INFO which is fine for our info/warn/error tests.
    // If we really need debug, we'd need to set env var before require, 
    // but the instance minLevel is set in constructor.
    // Let's just test INFO, WARN, ERROR which are default enabled.

    logger.info('Test Info Message', { data: 123 });
    logger.warn('Test Warn Message');
    logger.error('Test Error Message', new Error('Mock error'));
    
    // Construct expected default log file path
    const dateStr = new Date().toISOString().split('T')[0];
    const defaultLogFile = path.join(process.cwd(), 'logs', `service-${dateStr}.log`);

    // Verify file creation
    if (fs.existsSync(defaultLogFile)) {
        const content = fs.readFileSync(defaultLogFile, 'utf8');
        // Check for our specific messages to ensure they were appended
        if (content.includes('Test Info Message') && content.includes('Test Error Message')) {
            console.log('✅ Logger file output verified');
        } else {
            // It might be that the file exists but our logs aren't there yet (race condition?)
            // But write() uses fs.appendFileSync, so it should be immediate.
            console.error('❌ Logger content mismatch. Content tail:', content.slice(-200));
        }
    } else {
        console.error(`❌ Log file not found at ${defaultLogFile}`);
    }
} catch (e) {
    console.error('❌ Logger test failed:', e);
}

// --- Error Handler Tests ---
console.log('\n2. Testing ErrorHandler...');
try {
    // Test categorizer
    const rateLimitErr = new Error('Rate limit exceeded');
    rateLimitErr.status = 429;
    
    const cat1 = ErrorHandler.categorizeError(rateLimitErr);
    if (cat1 === 'rate_limit') {
        console.log('✅ Error categorization (Rate Limit) success');
    } else {
        console.error(`❌ Categorization failed: got ${cat1}`);
    }

    const netErr = new Error('fetch failed');
    const cat2 = ErrorHandler.categorizeError(netErr);
    if (cat2 === 'network') {
        console.log('✅ Error categorization (Network) success');
    } else {
        console.error(`❌ Categorization failed: got ${cat2}`);
    }

    // Test response creation
    const response = ErrorHandler.createErrorResponse(new Error('Invalid input data'), { input: 'abc' });
    if (response.success === false && response.error.type === 'invalid_input') {
        console.log('✅ Error Response format success');
    } else {
        console.error('❌ Error Response format failed');
    }

} catch (e) {
    console.error('❌ ErrorHandler test failed:', e);
}

console.log('\n---------------------------------------------------');
