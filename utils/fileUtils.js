const fs = require('fs').promises;
const path = require('path');

/**
 * Clean up uploaded files
 * @param {Array} filePaths - Array of file paths to delete
 */
async function cleanupFiles(filePaths) {
    for (const filePath of filePaths) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            // Ignore ENOENT errors (file already deleted)
            if (error.code !== 'ENOENT') {
                console.error(`Failed to delete file ${filePath}:`, error.message);
            }
        }
    }
}

/**
 * Create uploads directory if it doesn't exist
 * @param {string} uploadsDir - Directory path
 */
async function ensureUploadsDirectory(uploadsDir) {
    try {
        await fs.mkdir(uploadsDir, { recursive: true });
    } catch (error) {
        console.error('Error creating uploads directory:', error);
    }
}

/**
 * Validate text input
 * @param {string} text - Text to validate
 * @returns {Object} - Validation result
 */
function validateTextInput(text) {
    if (!text || typeof text !== 'string') {
        return {
            valid: false,
            error: 'Invalid input: text field is required and must be a string'
        };
    }

    if (text.trim().length === 0) {
        return {
            valid: false,
            error: 'Invalid input: text cannot be empty'
        };
    }

    return { valid: true };
}

/**
 * Validate number of questions parameter
 * @param {number} numQuestions - Number of questions to validate
 * @returns {Object} - Validation result
 */
function validateNumQuestions(numQuestions) {
    const parsed = parseInt(numQuestions, 10);
    
    if (isNaN(parsed) || parsed < 1 || parsed > 50) {
        return {
            valid: false,
            error: 'Invalid input: num_questions must be between 1 and 50'
        };
    }

    return {
        valid: true,
        value: parsed
    };
}

/**
 * Create error response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @returns {Object} - Error response object
 */
function createErrorResponse(message, statusCode = 500) {
    return {
        error: message,
        statusCode
    };
}

/**
 * Create success response object
 * @param {Object} data - Success data
 * @param {Object} metadata - Additional metadata
 * @returns {Object} - Success response object
 */
function createSuccessResponse(data, metadata = null) {
    const response = { ...data };
    if (metadata) {
        response.metadata = metadata;
    }
    return response;
}

module.exports = {
    cleanupFiles,
    ensureUploadsDirectory,
    validateTextInput,
    validateNumQuestions,
    createErrorResponse,
    createSuccessResponse
};