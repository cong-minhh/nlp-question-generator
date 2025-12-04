const { v4: uuidv4 } = require('uuid');

/**
 * In-Memory Job Queue with SQLite Persistence
 * Manages async job processing with database backup
 */
class JobQueue {
    constructor(config = {}) {
        this.jobs = new Map(); // jobId -> job
        this.queue = []; // Array of jobIds waiting to be processed
        this.processing = new Set(); // Set of jobIds currently processing
        this.maxConcurrent = config.maxConcurrent || 3;
        this.enabled = config.enabled !== false;
        this.jobStore = config.jobStore || null; // Required for persistence
        this.jobProcessor = null;
    }

    /**
     * Restore pending jobs from store
     */
    async restore() {
        if (!this.enabled || !this.jobStore) return;

        try {
            console.log('Restoring pending jobs from database...');
            const pendingJobs = await this.jobStore.loadAllJobs({ status: 'pending' });

            for (const job of pendingJobs) {
                this.jobs.set(job.id, job);
                this.queue.push(job.id);
            }

            console.log(`Restored ${pendingJobs.length} pending jobs`);

            // Also load processing jobs (they were interrupted)
            const processingJobs = await this.jobStore.loadAllJobs({ status: 'processing' });
            for (const job of processingJobs) {
                // Reset status to pending to retry
                job.status = 'pending';
                job.startedAt = null;
                job.progress = 0;

                this.jobs.set(job.id, job);
                this.queue.push(job.id);

                // Update store to reflect reset
                await this.jobStore.saveJob(job);
            }

            if (processingJobs.length > 0) {
                console.log(`Reset ${processingJobs.length} interrupted jobs to pending`);
            }

            this.processQueue();
        } catch (error) {
            console.error('Failed to restore jobs:', error);
        }
    }

    /**
     * Create a new job
     * @param {Object} data - Job data
     * @returns {Promise<string>} - Job ID
     */
    async createJob(data) {
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

        // Save to store first
        if (this.jobStore) {
            await this.jobStore.saveJob(job);
        }

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
     * @returns {Promise<Object|null>} - Job object
     */
    async getJob(jobId) {
        // Check memory first
        if (this.jobs.has(jobId)) {
            return this.jobs.get(jobId);
        }

        // Check store
        if (this.jobStore) {
            const job = await this.jobStore.loadJob(jobId);
            if (job) {
                // Cache in memory if found? Maybe not to save RAM
                return job;
            }
        }

        return null;
    }

    /**
     * Get all jobs
     * @returns {Promise<Array>} - Array of jobs
     */
    async getAllJobs() {
        // Return in-memory jobs + recent from store?
        // For simplicity, let's ask the store for everything if available
        if (this.jobStore) {
            return await this.jobStore.loadAllJobs({ limit: 100 });
        }
        return Array.from(this.jobs.values());
    }

    /**
     * Get jobs by status
     * @param {string} status - Job status
     * @returns {Promise<Array>} - Array of jobs
     */
    async getJobsByStatus(status) {
        if (this.jobStore) {
            return await this.jobStore.loadAllJobs({ status, limit: 100 });
        }
        return Array.from(this.jobs.values()).filter(job => job.status === status);
    }

    /**
     * Update job status
     * @param {string} jobId - Job ID
     * @param {string} status - New status
     * @param {Object} updates - Additional updates
     */
    async updateJob(jobId, status, updates = {}) {
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

            // Optional: Remove from memory to save RAM, keep in store
            // this.jobs.delete(jobId); 
        }

        // Persist to database
        if (this.jobStore) {
            await this.jobStore.saveJob(job).catch(err => {
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
            await this.updateJob(jobId, 'processing');
            console.log(`Processing job: ${jobId}`);

            // Job processor should be set externally
            if (!this.jobProcessor) {
                throw new Error('Job processor not configured');
            }

            const result = await this.jobProcessor(job.data, async (progress) => {
                job.progress = progress;
                // Don't await every progress update to avoid DB bottleneck
                if (progress % 10 === 0) {
                    this.updateJob(jobId, 'processing', { progress }).catch(console.error);
                }
            });

            await this.updateJob(jobId, 'completed', { result, progress: 100 });
            console.log(`✓ Job completed: ${jobId}`);

        } catch (error) {
            await this.updateJob(jobId, 'failed', {
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
        if (this.enabled) {
            this.processQueue();
        }
    }

    /**
     * Cancel a job
     * @param {string} jobId - Job ID
     * @returns {Promise<boolean>} - Success
     */
    async cancelJob(jobId) {
        const job = this.jobs.get(jobId);

        // If not in memory, check store (might be pending but not loaded?)
        // For now assume active jobs are in memory

        if (!job) return false;

        if (job.status === 'pending') {
            // Remove from queue
            const index = this.queue.indexOf(jobId);
            if (index > -1) {
                this.queue.splice(index, 1);
            }
            await this.updateJob(jobId, 'cancelled');
            return true;
        }

        return false;
    }

    /**
     * Clear completed jobs
     * @param {number} olderThan - Clear jobs older than this (ms)
     */
    async clearCompleted(olderThan = 3600000) { // 1 hour default
        // Clear from store
        if (this.jobStore) {
            await this.jobStore.deleteOldJobs(olderThan);
        }

        // Clear from memory
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
    }

    /**
     * Get queue statistics
     * @returns {Promise<Object>} - Statistics
     */
    async getStats() {
        if (this.jobStore) {
            const stats = await this.jobStore.getStats();
            return {
                ...stats,
                queueLength: this.queue.length,
                maxConcurrent: this.maxConcurrent
            };
        }

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
