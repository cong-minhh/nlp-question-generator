/**
 * Background Job Processor
 * Processes jobs from the queue in the background
 */
class JobProcessor {
    constructor(jobQueue, questionGenerator) {
        this.jobQueue = jobQueue;
        this.questionGenerator = questionGenerator;
        this.running = false;
    }

    /**
     * Start processing jobs
     */
    start() {
        if (this.running) {
            console.log('Job processor already running');
            return;
        }

        this.running = true;
        console.log('Job processor started');

        // Set the processor function on the queue
        this.jobQueue.setProcessor(async (data, onProgress) => {
            return await this.processJob(data, onProgress);
        });
    }

    /**
     * Stop processing jobs
     */
    stop() {
        this.running = false;
        this.jobQueue.stop();
        console.log('Job processor stopped');
    }

    /**
     * Process a single job
     * @param {Object} data - Job data
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Object>} - Job result
     */
    async processJob(data, onProgress) {
        try {
            // Initial progress
            onProgress(5);

            // Validate input
            if (!data.text || data.text.trim().length === 0) {
                throw new Error('Text is required');
            }

            onProgress(10);

            // Generate questions
            const result = await this.questionGenerator.generateQuestions(data.text, {
                numQuestions: data.numQuestions || 10,
                difficulty: data.difficulty || 'mixed',
                bloomLevel: data.bloomLevel || 'apply'
            });

            onProgress(90);

            // Format result
            const formattedResult = {
                questions: result.questions,
                metadata: {
                    ...result.metadata,
                    processedAt: new Date().toISOString(),
                    jobProcessing: true
                }
            };

            onProgress(100);

            return formattedResult;

        } catch (error) {
            console.error('Job processing error:', error);
            throw error;
        }
    }

    /**
     * Get processor status
     * @returns {Object}
     */
    getStatus() {
        return {
            running: this.running,
            queueStats: this.jobQueue.getStats()
        };
    }
}

module.exports = JobProcessor;
