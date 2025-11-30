const { v4: uuidv4 } = require('uuid');

/**
 * In-Memory Job Queue with Optional Persistence
 * Manages async job processing without external dependencies
 */
class JobQueue {
    constructor(config = {}) {
        this.jobs = new Map(); // jobId -> job
        this.queue = []; // Array of jobIds waiting to be processed
        this.processing = new Set(); // Set of jobIds currently processing
        this.maxConcurrent = config.maxConcurrent || 3;
        this.enabled = config.enabled !== false;
        this.workers = [];
        this.jobStore = config.jobStore || null; // Optional persistence
    }

    /**
     * Create a new job
     * @param {Object} data - Job data
     * @returns {string} - Job ID
     */
    createJob(data) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            status: 'pending',
            data,
            result: null,
            error: null,
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            progress: 0
        };

        this.jobs.set(jobId, job);
        this.queue.push(jobId);

        console.log(`Job created: ${jobId}`);
        
        // Start processing if not already running
        this.processQueue();

        return jobId;
    }

    /**
     * Get job by ID
     * @param {string} jobId - Job ID
     * @returns {Object|null} - Job object
     */
    getJob(jobId) {
        return this.jobs.get(jobId) || null;
    }

    /**
     * Get all jobs
     * @returns {Array} - Array of jobs
     */
    getAllJobs() {
        return Array.from(this.jobs.values());
    }

    /**
     * Get jobs by status
     * @param {string} status - Job status
     * @returns {Array} - Array of jobs
     */
    getJobsByStatus(status) {
        return this.getAllJobs().filter(job => job.status === status);
    }

    /**
     * Update job status
     * @param {string} jobId - Job ID
     * @param {string} status - New status
     * @param {Object} updates - Additional updates
     */
    updateJob(jobId, status, updates = {}) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.status = status;
        Object.assign(job, updates);

        if (status === 'processing' && !job.startedAt) {
            job.startedAt = Date.now();
        }

        if (status === 'completed' || status === 'failed') {
            job.completedAt = Date.now();
            this.processing.delete(jobId);
        }

        // Persist to database if available
        if (this.jobStore) {
            this.jobStore.saveJob(job).catch(err => {
                console.warn('Job persistence error:', err.message);
            });
        }
    }

    /**
     * Process the queue
     */
    async processQueue() {
        if (!this.enabled) return;

        // Start workers if needed
        while (this.processing.size < this.maxConcurrent && this.queue.length > 0) {
            const jobId = this.queue.shift();
            if (!jobId) continue;

            this.processing.add(jobId);
            this.processJob(jobId).catch(error => {
                console.error(`Job ${jobId} processing error:`, error);
            });
        }
    }

    /**
     * Process a single job
     * @param {string} jobId - Job ID
     */
    async processJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        try {
            this.updateJob(jobId, 'processing');
            console.log(`Processing job: ${jobId}`);

            // Job processor should be set externally
            if (!this.jobProcessor) {
                throw new Error('Job processor not configured');
            }

            const result = await this.jobProcessor(job.data, (progress) => {
                job.progress = progress;
            });

            this.updateJob(jobId, 'completed', { result, progress: 100 });
            console.log(`✓ Job completed: ${jobId}`);

        } catch (error) {
            this.updateJob(jobId, 'failed', { 
                error: error.message,
                progress: job.progress 
            });
            console.error(`✗ Job failed: ${jobId} - ${error.message}`);
        } finally {
            // Process next job in queue
            this.processQueue();
        }
    }

    /**
     * Set job processor function
     * @param {Function} processor - Async function to process jobs
     */
    setProcessor(processor) {
        this.jobProcessor = processor;
    }

    /**
     * Cancel a job
     * @param {string} jobId - Job ID
     * @returns {boolean} - Success
     */
    cancelJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return false;

        if (job.status === 'pending') {
            // Remove from queue
            const index = this.queue.indexOf(jobId);
            if (index > -1) {
                this.queue.splice(index, 1);
            }
            this.updateJob(jobId, 'cancelled');
            return true;
        }

        if (job.status === 'processing') {
            // Can't cancel processing jobs easily
            return false;
        }

        return false;
    }

    /**
     * Clear completed jobs
     * @param {number} olderThan - Clear jobs older than this (ms)
     */
    clearCompleted(olderThan = 3600000) { // 1 hour default
        const now = Date.now();
        const toDelete = [];

        this.jobs.forEach((job, jobId) => {
            if ((job.status === 'completed' || job.status === 'failed') &&
                job.completedAt &&
                (now - job.completedAt) > olderThan) {
                toDelete.push(jobId);
            }
        });

        toDelete.forEach(jobId => this.jobs.delete(jobId));
        
        if (toDelete.length > 0) {
            console.log(`Cleared ${toDelete.length} old jobs`);
        }
    }

    /**
     * Get queue statistics
     * @returns {Object} - Statistics
     */
    getStats() {
        const stats = {
            total: this.jobs.size,
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            queueLength: this.queue.length,
            maxConcurrent: this.maxConcurrent
        };

        this.jobs.forEach(job => {
            stats[job.status]++;
        });

        return stats;
    }

    /**
     * Stop processing
     */
    stop() {
        this.enabled = false;
        console.log('Job queue stopped');
    }

    /**
     * Start processing
     */
    start() {
        this.enabled = true;
        console.log('Job queue started');
        this.processQueue();
    }
}

module.exports = JobQueue;
