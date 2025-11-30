const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

/**
 * Job Queue Routes
 * Async job processing endpoints
 */

/**
 * POST /jobs
 * Submit a new job
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { text, numQuestions, difficulty, bloomLevel } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Text is required'
            });
        }

        const jobQueue = req.app.locals.jobQueue;
        if (!jobQueue) {
            return res.status(500).json({
                success: false,
                error: 'Job queue not initialized'
            });
        }

        const jobId = jobQueue.createJob({
            text,
            numQuestions: numQuestions || 10,
            difficulty: difficulty || 'mixed',
            bloomLevel: bloomLevel || 'apply'
        });

        res.status(202).json({
            success: true,
            jobId,
            message: 'Job queued for processing',
            statusUrl: `/api/jobs/${jobId}`
        });
    } catch (error) {
        console.error('Job submission error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /jobs/:id
 * Get job status
 */
router.get('/:id', (req, res) => {
    try {
        const jobQueue = req.app.locals.jobQueue;
        if (!jobQueue) {
            return res.status(500).json({
                success: false,
                error: 'Job queue not initialized'
            });
        }

        const job = jobQueue.getJob(req.params.id);
        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        res.json({
            success: true,
            job: {
                id: job.id,
                status: job.status,
                progress: job.progress,
                createdAt: new Date(job.createdAt).toISOString(),
                startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
                completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
                error: job.error
            }
        });
    } catch (error) {
        console.error('Job status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /jobs/:id/result
 * Get job result
 */
router.get('/:id/result', (req, res) => {
    try {
        const jobQueue = req.app.locals.jobQueue;
        if (!jobQueue) {
            return res.status(500).json({
                success: false,
                error: 'Job queue not initialized'
            });
        }

        const job = jobQueue.getJob(req.params.id);
        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        if (job.status !== 'completed') {
            return res.status(400).json({
                success: false,
                error: `Job is ${job.status}, not completed`,
                status: job.status,
                progress: job.progress
            });
        }

        res.json({
            success: true,
            result: job.result
        });
    } catch (error) {
        console.error('Job result error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /jobs
 * List all jobs
 */
router.get('/', (req, res) => {
    try {
        const jobQueue = req.app.locals.jobQueue;
        if (!jobQueue) {
            return res.status(500).json({
                success: false,
                error: 'Job queue not initialized'
            });
        }

        const status = req.query.status;
        const jobs = status 
            ? jobQueue.getJobsByStatus(status)
            : jobQueue.getAllJobs();

        res.json({
            success: true,
            jobs: jobs.map(job => ({
                id: job.id,
                status: job.status,
                progress: job.progress,
                createdAt: new Date(job.createdAt).toISOString(),
                completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null
            })),
            stats: jobQueue.getStats()
        });
    } catch (error) {
        console.error('Job list error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /jobs/:id
 * Cancel a job
 */
router.delete('/:id', authenticate, (req, res) => {
    try {
        const jobQueue = req.app.locals.jobQueue;
        if (!jobQueue) {
            return res.status(500).json({
                success: false,
                error: 'Job queue not initialized'
            });
        }

        const cancelled = jobQueue.cancelJob(req.params.id);
        
        if (cancelled) {
            res.json({
                success: true,
                message: 'Job cancelled'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Job cannot be cancelled (not found or already processing)'
            });
        }
    } catch (error) {
        console.error('Job cancel error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
