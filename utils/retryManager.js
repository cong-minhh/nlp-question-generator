const ErrorHandler = require('./errorHandler');

/**
 * Retry Manager with Exponential Backoff
 * Handles automatic retries for transient errors
 */
class RetryManager {
    constructor(config = {}) {
        this.maxRetries = config.maxRetries || 3;
        this.baseDelay = config.baseDelay || 1000; // 1 second
        this.maxDelay = config.maxDelay || 30000; // 30 seconds
        this.exponentialBase = config.exponentialBase || 2;
        this.jitter = config.jitter !== false; // Add randomness to prevent thundering herd
    }

    /**
     * Calculate delay for retry attempt
     * @param {number} attempt - Attempt number (1-based)
     * @returns {number} - Delay in milliseconds
     */
    calculateDelay(attempt) {
        // Exponential backoff: baseDelay * (exponentialBase ^ (attempt - 1))
        let delay = this.baseDelay * Math.pow(this.exponentialBase, attempt - 1);
        
        // Cap at max delay
        delay = Math.min(delay, this.maxDelay);
        
        // Add jitter (randomness) to prevent thundering herd
        if (this.jitter) {
            const jitterAmount = delay * 0.1; // 10% jitter
            delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
        }
        
        return Math.floor(delay);
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute function with retry logic
     * @param {Function} fn - Async function to execute
     * @param {Object} options - Retry options
     * @returns {Promise} - Result of function
     */
    async executeWithRetry(fn, options = {}) {
        const maxRetries = options.maxRetries || this.maxRetries;
        const onRetry = options.onRetry || null;
        const shouldRetry = options.shouldRetry || ((error) => ErrorHandler.isTransient(error));
        const context = options.context || {};

        let lastError;

        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            try {
                const result = await fn(attempt);
                
                // Success - log if we had retries
                if (attempt > 1) {
                    console.log(`✓ Succeeded on attempt ${attempt}/${maxRetries + 1}`);
                }
                
                return result;
            } catch (error) {
                lastError = error;
                const isLastAttempt = attempt === maxRetries + 1;
                const category = ErrorHandler.categorizeError(error);
                const canRetry = shouldRetry(error);

                // Log error
                if (isLastAttempt) {
                    ErrorHandler.logError(error, {
                        ...context,
                        attempt,
                        maxRetries,
                        finalAttempt: true
                    });
                } else if (canRetry) {
                    console.warn(`⚠️  Attempt ${attempt}/${maxRetries + 1} failed: ${error.message}`);
                } else {
                    ErrorHandler.logError(error, {
                        ...context,
                        attempt,
                        notRetryable: true
                    });
                }

                // Don't retry if it's the last attempt or error is not retryable
                if (isLastAttempt || !canRetry) {
                    throw error;
                }

                // Calculate delay and wait
                const delay = this.calculateDelay(attempt);
                console.log(`Retrying in ${(delay / 1000).toFixed(1)}s...`);
                
                // Call onRetry callback if provided
                if (onRetry) {
                    await onRetry(attempt, error, delay);
                }
                
                await this.sleep(delay);
            }
        }

        // Should never reach here, but just in case
        throw lastError;
    }

    /**
     * Execute with retry and fallback
     * @param {Function} fn - Primary function
     * @param {Function} fallbackFn - Fallback function
     * @param {Object} options - Options
     * @returns {Promise}
     */
    async executeWithFallback(fn, fallbackFn, options = {}) {
        try {
            return await this.executeWithRetry(fn, options);
        } catch (error) {
            console.warn('⚠️  Primary function failed, trying fallback...');
            
            try {
                const result = await fallbackFn(error);
                console.log('✓ Fallback succeeded');
                return result;
            } catch (fallbackError) {
                console.error('❌ Fallback also failed');
                ErrorHandler.logError(fallbackError, {
                    ...options.context,
                    fallbackFailed: true
                });
                throw fallbackError;
            }
        }
    }

    /**
     * Execute multiple functions in parallel with retry
     * @param {Array<Function>} functions - Array of async functions
     * @param {Object} options - Options
     * @returns {Promise<Array>}
     */
    async executeAllWithRetry(functions, options = {}) {
        const promises = functions.map((fn, index) => 
            this.executeWithRetry(fn, {
                ...options,
                context: { ...options.context, index }
            })
        );

        return await Promise.all(promises);
    }

    /**
     * Execute with timeout
     * @param {Function} fn - Async function
     * @param {number} timeout - Timeout in milliseconds
     * @param {Object} options - Options
     * @returns {Promise}
     */
    async executeWithTimeout(fn, timeout, options = {}) {
        return await this.executeWithRetry(async (attempt) => {
            return await Promise.race([
                fn(attempt),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Operation timed out')), timeout)
                )
            ]);
        }, options);
    }

    /**
     * Execute with circuit breaker pattern
     * @param {Function} fn - Async function
     * @param {Object} options - Options
     * @returns {Promise}
     */
    async executeWithCircuitBreaker(fn, options = {}) {
        const threshold = options.failureThreshold || 5;
        const resetTimeout = options.resetTimeout || 60000; // 1 minute

        if (!this.circuitState) {
            this.circuitState = {
                failures: 0,
                lastFailure: null,
                state: 'closed' // closed, open, half-open
            };
        }

        const state = this.circuitState;

        // Check if circuit is open
        if (state.state === 'open') {
            const timeSinceLastFailure = Date.now() - state.lastFailure;
            
            if (timeSinceLastFailure < resetTimeout) {
                throw ErrorHandler.createError(
                    'Circuit breaker is open - too many recent failures',
                    ErrorHandler.ErrorTypes.PROVIDER_ERROR
                );
            }
            
            // Try to close circuit
            state.state = 'half-open';
            console.log('Circuit breaker: half-open (testing)');
        }

        try {
            const result = await this.executeWithRetry(fn, options);
            
            // Success - reset circuit
            if (state.state === 'half-open') {
                state.state = 'closed';
                state.failures = 0;
                console.log('✓ Circuit breaker: closed (recovered)');
            }
            
            return result;
        } catch (error) {
            state.failures++;
            state.lastFailure = Date.now();

            if (state.failures >= threshold) {
                state.state = 'open';
                console.error(`❌ Circuit breaker: open (${state.failures} failures)`);
            }

            throw error;
        }
    }

    /**
     * Get retry statistics
     * @returns {Object}
     */
    getStats() {
        return {
            maxRetries: this.maxRetries,
            baseDelay: this.baseDelay,
            maxDelay: this.maxDelay,
            exponentialBase: this.exponentialBase,
            jitter: this.jitter,
            circuitState: this.circuitState || null
        };
    }

    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker() {
        this.circuitState = {
            failures: 0,
            lastFailure: null,
            state: 'closed'
        };
        console.log('✓ Circuit breaker reset');
    }
}

module.exports = RetryManager;
