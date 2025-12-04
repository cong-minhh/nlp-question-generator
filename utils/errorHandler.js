/**
 * Centralized Error Handler
 * Provides consistent error handling and categorization
 */
class ErrorHandler {
    /**
     * Error categories
     */
    static ErrorTypes = {
        RATE_LIMIT: 'rate_limit',
        AUTHENTICATION: 'authentication',
        NETWORK: 'network',
        TIMEOUT: 'timeout',
        INVALID_INPUT: 'invalid_input',
        PROVIDER_ERROR: 'provider_error',
        PARSING_ERROR: 'parsing_error',
        CONFIGURATION: 'configuration',
        UNKNOWN: 'unknown'
    };

    /**
     * Categorize error based on message and properties
     * @param {Error} error - Error object
     * @returns {string} - Error category
     */
    static categorizeError(error) {
        const message = error.message?.toLowerCase() || '';
        const status = error.status || error.statusCode || 0;

        // Rate limiting
        if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
            return this.ErrorTypes.RATE_LIMIT;
        }

        // Authentication
        if (status === 401 || status === 403 || message.includes('unauthorized') || 
            message.includes('invalid api key') || message.includes('authentication')) {
            return this.ErrorTypes.AUTHENTICATION;
        }

        // Network errors
        if (message.includes('econnrefused') || message.includes('enotfound') || 
            message.includes('network') || message.includes('fetch failed')) {
            return this.ErrorTypes.NETWORK;
        }

        // Timeout
        if (message.includes('timeout') || message.includes('timed out') || status === 408) {
            return this.ErrorTypes.TIMEOUT;
        }

        // Invalid input
        if (status === 400 || message.includes('invalid') || message.includes('bad request')) {
            return this.ErrorTypes.INVALID_INPUT;
        }

        // Provider errors
        if (status === 500 || status === 502 || status === 503 || status === 504 ||
            message.includes('service unavailable') || message.includes('internal server error')) {
            return this.ErrorTypes.PROVIDER_ERROR;
        }

        // Parsing errors
        if (message.includes('parse') || message.includes('json') || message.includes('syntax')) {
            return this.ErrorTypes.PARSING_ERROR;
        }

        // Configuration
        if (message.includes('config') || message.includes('not configured') || 
            message.includes('missing')) {
            return this.ErrorTypes.CONFIGURATION;
        }

        return this.ErrorTypes.UNKNOWN;
    }

    /**
     * Check if error is transient (can be retried)
     * @param {Error} error - Error object
     * @returns {boolean}
     */
    static isTransient(error) {
        const category = this.categorizeError(error);
        
        const transientTypes = [
            this.ErrorTypes.RATE_LIMIT,
            this.ErrorTypes.NETWORK,
            this.ErrorTypes.TIMEOUT,
            this.ErrorTypes.PROVIDER_ERROR
        ];

        return transientTypes.includes(category);
    }

    /**
     * Get user-friendly error message
     * @param {Error} error - Error object
     * @returns {string}
     */
    static getUserMessage(error) {
        const category = this.categorizeError(error);

        const messages = {
            [this.ErrorTypes.RATE_LIMIT]: 'Rate limit exceeded. Please try again in a few moments.',
            [this.ErrorTypes.AUTHENTICATION]: 'Authentication failed. Please check your API key.',
            [this.ErrorTypes.NETWORK]: 'Network error. Please check your internet connection.',
            [this.ErrorTypes.TIMEOUT]: 'Request timed out. Please try again.',
            [this.ErrorTypes.INVALID_INPUT]: 'Invalid input. Please check your request.',
            [this.ErrorTypes.PROVIDER_ERROR]: 'AI provider is temporarily unavailable. Please try again.',
            [this.ErrorTypes.PARSING_ERROR]: 'Failed to parse response. Please try again.',
            [this.ErrorTypes.CONFIGURATION]: 'Configuration error. Please check your settings.',
            [this.ErrorTypes.UNKNOWN]: 'An unexpected error occurred. Please try again.'
        };

        return messages[category] || messages[this.ErrorTypes.UNKNOWN];
    }

    /**
     * Create standardized error response
     * @param {Error} error - Error object
     * @param {Object} context - Additional context
     * @returns {Object}
     */
    static createErrorResponse(error, context = {}) {
        const category = this.categorizeError(error);
        const isTransient = this.isTransient(error);

        return {
            success: false,
            error: {
                message: this.getUserMessage(error),
                type: category,
                transient: isTransient,
                retryable: isTransient,
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString(),
                ...context
            }
        };
    }

    /**
     * Log error with appropriate level
     * @param {Error} error - Error object
     * @param {Object} context - Additional context
     */
    static logError(error, context = {}) {
        const category = this.categorizeError(error);
        const isTransient = this.isTransient(error);

        const logData = {
            category,
            transient: isTransient,
            message: error.message,
            stack: error.stack,
            ...context,
            timestamp: new Date().toISOString()
        };

        // Log based on severity
        if (category === this.ErrorTypes.AUTHENTICATION || 
            category === this.ErrorTypes.CONFIGURATION) {
            console.error('❌ Critical Error:', JSON.stringify(logData, null, 2));
        } else if (isTransient) {
            console.warn('⚠ Transient Error:', logData.message);
        } else {
            console.error('❌ Error:', logData.message);
        }
    }

    /**
     * Wrap async function with error handling
     * @param {Function} fn - Async function to wrap
     * @param {Object} options - Options
     * @returns {Function}
     */
    static wrapAsync(fn, options = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.logError(error, options.context);
                
                if (options.rethrow !== false) {
                    throw error;
                }
                
                return this.createErrorResponse(error, options.context);
            }
        };
    }

    /**
     * Handle Express route errors
     * @param {Error} error - Error object
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next function
     */
    static expressErrorHandler(error, req, res, next) {
        this.logError(error, {
            path: req.path,
            method: req.method,
            ip: req.ip
        });

        const response = this.createErrorResponse(error, {
            path: req.path
        });

        const statusCode = error.status || error.statusCode || 500;
        res.status(statusCode).json(response);
    }

    /**
     * Create error from message
     * @param {string} message - Error message
     * @param {string} type - Error type
     * @returns {Error}
     */
    static createError(message, type = this.ErrorTypes.UNKNOWN) {
        const error = new Error(message);
        error.type = type;
        return error;
    }
}

module.exports = ErrorHandler;
