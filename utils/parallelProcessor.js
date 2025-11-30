/**
 * Parallel Question Generation Processor
 * Splits large requests into chunks and processes them in parallel
 */
class ParallelProcessor {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.chunkSize = config.chunkSize || 10;
        this.maxWorkers = config.maxWorkers || 5;
        this.threshold = config.threshold || 20; // Minimum questions to trigger parallel
    }

    /**
     * Check if parallel processing should be used
     * @param {number} numQuestions - Number of questions requested
     * @returns {boolean}
     */
    shouldUseParallel(numQuestions) {
        return this.enabled && numQuestions >= this.threshold;
    }

    /**
     * Split questions into chunks for parallel processing
     * @param {number} totalQuestions - Total number of questions
     * @returns {Array<number>} - Array of chunk sizes
     */
    calculateChunks(totalQuestions) {
        const chunks = [];
        let remaining = totalQuestions;

        while (remaining > 0) {
            const chunkSize = Math.min(this.chunkSize, remaining);
            chunks.push(chunkSize);
            remaining -= chunkSize;
        }

        return chunks;
    }

    /**
     * Process chunks in parallel with concurrency limit
     * @param {Array} chunks - Array of chunk sizes
     * @param {Function} processFn - Async function to process each chunk
     * @returns {Promise<Array>} - Array of results
     */
    async processInParallel(chunks, processFn) {
        const results = [];
        const executing = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunkSize = chunks[i];
            const chunkIndex = i;

            // Create promise for this chunk
            const promise = processFn(chunkSize, chunkIndex)
                .then(result => {
                    results[chunkIndex] = result;
                    return result;
                })
                .catch(error => {
                    console.error(`Chunk ${chunkIndex} failed:`, error.message);
                    results[chunkIndex] = {
                        success: false,
                        error: error.message,
                        questions: []
                    };
                    return results[chunkIndex];
                });

            executing.push(promise);

            // Limit concurrency
            if (executing.length >= this.maxWorkers) {
                await Promise.race(executing);
                // Remove completed promises
                executing.splice(0, executing.findIndex(p => p === promise) + 1);
            }
        }

        // Wait for remaining promises
        await Promise.all(executing);

        return results;
    }

    /**
     * Generate questions in parallel
     * @param {string} text - Input text
     * @param {number} totalQuestions - Total questions to generate
     * @param {Function} generateFn - Function to generate questions
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Combined results
     */
    async generateParallel(text, totalQuestions, generateFn, options = {}) {
        if (!this.shouldUseParallel(totalQuestions)) {
            // Use regular generation for small batches
            return await generateFn(text, { ...options, numQuestions: totalQuestions });
        }

        console.log(`🔄 Using parallel generation for ${totalQuestions} questions`);
        
        const chunks = this.calculateChunks(totalQuestions);
        console.log(`📦 Split into ${chunks.length} chunks: [${chunks.join(', ')}]`);

        const startTime = Date.now();

        // Process chunks in parallel
        const results = await this.processInParallel(chunks, async (chunkSize, chunkIndex) => {
            console.log(`⚙️  Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunkSize} questions)`);
            
            try {
                const result = await generateFn(text, {
                    ...options,
                    numQuestions: chunkSize,
                    noCache: options.noCache || false // Allow caching per chunk
                });

                console.log(`✓ Chunk ${chunkIndex + 1} complete (${result.questions?.length || 0} questions)`);
                
                return {
                    success: true,
                    questions: result.questions || [],
                    metadata: result.metadata || {}
                };
            } catch (error) {
                console.error(`✗ Chunk ${chunkIndex + 1} failed:`, error.message);
                throw error;
            }
        });

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        // Combine results
        const combined = this.combineResults(results, totalQuestions, duration);
        
        console.log(`✓ Parallel generation complete: ${combined.questions.length} questions in ${duration}s`);
        
        return combined;
    }

    /**
     * Combine results from parallel chunks
     * @param {Array} results - Array of chunk results
     * @param {number} expectedTotal - Expected total questions
     * @param {string} duration - Generation duration
     * @returns {Object} - Combined result
     */
    combineResults(results, expectedTotal, duration) {
        const allQuestions = [];
        const errors = [];
        let totalGenerated = 0;

        // Collect all questions and errors
        results.forEach((result, index) => {
            if (result.success && result.questions) {
                allQuestions.push(...result.questions);
                totalGenerated += result.questions.length;
            } else {
                errors.push({
                    chunk: index,
                    error: result.error
                });
            }
        });

        // Get metadata from first successful result
        const firstSuccess = results.find(r => r.success && r.metadata);
        const baseMetadata = firstSuccess?.metadata || {};

        return {
            questions: allQuestions,
            metadata: {
                ...baseMetadata,
                num_questions: allQuestions.length,
                expected_questions: expectedTotal,
                parallel: true,
                chunks: results.length,
                duration_seconds: parseFloat(duration),
                errors: errors.length > 0 ? errors : undefined,
                generated_at: new Date().toISOString()
            },
            parallel: true
        };
    }

    /**
     * Generate questions in parallel with streaming support
     * @param {string} text - Input text
     * @param {number} totalQuestions - Total questions
     * @param {Function} generateFn - Generation function
     * @param {Object} options - Options
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Object>}
     */
    async generateParallelWithProgress(text, totalQuestions, generateFn, options = {}, onProgress = null) {
        if (!this.shouldUseParallel(totalQuestions)) {
            return await generateFn(text, { ...options, numQuestions: totalQuestions });
        }

        const chunks = this.calculateChunks(totalQuestions);
        const startTime = Date.now();
        let completedChunks = 0;

        if (onProgress) {
            onProgress({
                type: 'start',
                totalChunks: chunks.length,
                totalQuestions
            });
        }

        const results = await this.processInParallel(chunks, async (chunkSize, chunkIndex) => {
            try {
                const result = await generateFn(text, {
                    ...options,
                    numQuestions: chunkSize
                });

                completedChunks++;
                
                if (onProgress) {
                    onProgress({
                        type: 'chunk_complete',
                        chunkIndex,
                        totalChunks: chunks.length,
                        completedChunks,
                        questions: result.questions,
                        progress: Math.round((completedChunks / chunks.length) * 100)
                    });
                }

                return {
                    success: true,
                    questions: result.questions || [],
                    metadata: result.metadata || {}
                };
            } catch (error) {
                if (onProgress) {
                    onProgress({
                        type: 'chunk_error',
                        chunkIndex,
                        error: error.message
                    });
                }
                throw error;
            }
        });

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        const combined = this.combineResults(results, totalQuestions, duration);

        if (onProgress) {
            onProgress({
                type: 'complete',
                totalQuestions: combined.questions.length,
                duration
            });
        }

        return combined;
    }

    /**
     * Estimate time savings from parallel processing
     * @param {number} numQuestions - Number of questions
     * @param {number} avgTimePerQuestion - Average time per question (seconds)
     * @returns {Object} - Time estimates
     */
    estimateTimeSavings(numQuestions, avgTimePerQuestion = 3) {
        const sequentialTime = numQuestions * avgTimePerQuestion;
        
        if (!this.shouldUseParallel(numQuestions)) {
            return {
                sequential: sequentialTime,
                parallel: sequentialTime,
                savings: 0,
                speedup: 1
            };
        }

        const chunks = this.calculateChunks(numQuestions);
        const parallelTime = Math.ceil(chunks.length / this.maxWorkers) * this.chunkSize * avgTimePerQuestion;

        return {
            sequential: sequentialTime,
            parallel: parallelTime,
            savings: sequentialTime - parallelTime,
            speedup: (sequentialTime / parallelTime).toFixed(2)
        };
    }

    /**
     * Get processor configuration
     * @returns {Object}
     */
    getConfig() {
        return {
            enabled: this.enabled,
            chunkSize: this.chunkSize,
            maxWorkers: this.maxWorkers,
            threshold: this.threshold
        };
    }
}

module.exports = ParallelProcessor;
