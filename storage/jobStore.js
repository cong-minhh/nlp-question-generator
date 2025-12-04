const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/**
 * Job Store with SQLite Persistence
 * Stores job data and results in database
 */
class JobStore {
    constructor(config = {}) {
        this.dbPath = config.dbPath || path.join(process.cwd(), 'data', 'nlp-generator.db');
        this.db = null;
        this.enabled = config.enabled !== false;
    }

    /**
     * Initialize database
     */
    async initialize() {
        if (!this.enabled) {
            console.log('Job store is disabled');
            return;
        }

        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(new Error(`Failed to open job database: ${err.message}`));
                    return;
                }

                this.createTables()
                    .then(() => {
                        console.log('✓ Job store initialized');
                        resolve();
                    })
                    .catch(reject);
            });
        });
    }

    /**
     * Create jobs table
     */
    async createTables() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                input_text TEXT NOT NULL,
                options TEXT NOT NULL,
                result TEXT,
                error TEXT,
                progress INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                started_at INTEGER,
                completed_at INTEGER
            )
        `;

        const createIndexSQL = 'CREATE INDEX IF NOT EXISTS idx_status ON jobs(status)';

        return new Promise((resolve, reject) => {
            this.db.run(createTableSQL, (err) => {
                if (err) {
                    reject(new Error(`Failed to create jobs table: ${err.message}`));
                    return;
                }

                this.db.run(createIndexSQL, (err) => {
                    if (err) {
                        console.warn('Index creation warning:', err.message);
                    }
                    resolve();
                });
            });
        });
    }

    /**
     * Save job to database
     * @param {Object} job - Job object
     */
    async saveJob(job) {
        if (!this.enabled || !this.db) {
            return;
        }

        const query = `
            INSERT OR REPLACE INTO jobs 
            (id, status, input_text, options, result, error, progress, created_at, started_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            job.id,
            job.status,
            job.data?.text || '',
            JSON.stringify(job.data || {}),
            job.result ? JSON.stringify(job.result) : null,
            job.error || null,
            job.progress || 0,
            job.createdAt,
            job.startedAt || null,
            job.completedAt || null
        ];

        return new Promise((resolve, reject) => {
            this.db.run(query, params, (err) => {
                if (err) {
                    console.error('Job save error:', err.message);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Load job from database
     * @param {string} jobId - Job ID
     * @returns {Promise<Object|null>}
     */
    async loadJob(jobId) {
        if (!this.enabled || !this.db) {
            return null;
        }

        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM jobs WHERE id = ?';
            
            this.db.get(query, [jobId], (err, row) => {
                if (err) {
                    console.error('Job load error:', err.message);
                    reject(err);
                    return;
                }

                if (!row) {
                    resolve(null);
                    return;
                }

                try {
                    const job = {
                        id: row.id,
                        status: row.status,
                        data: JSON.parse(row.options),
                        result: row.result ? JSON.parse(row.result) : null,
                        error: row.error,
                        progress: row.progress,
                        createdAt: row.created_at,
                        startedAt: row.started_at,
                        completedAt: row.completed_at
                    };
                    resolve(job);
                } catch (parseError) {
                    console.error('Job parse error:', parseError.message);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Load all jobs
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>}
     */
    async loadAllJobs(filters = {}) {
        if (!this.enabled || !this.db) {
            return [];
        }

        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM jobs';
            const params = [];

            if (filters.status) {
                query += ' WHERE status = ?';
                params.push(filters.status);
            }

            query += ' ORDER BY created_at DESC';

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(filters.limit);
            }

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    console.error('Jobs load error:', err.message);
                    reject(err);
                    return;
                }

                const jobs = rows.map(row => {
                    try {
                        return {
                            id: row.id,
                            status: row.status,
                            data: JSON.parse(row.options),
                            result: row.result ? JSON.parse(row.result) : null,
                            error: row.error,
                            progress: row.progress,
                            createdAt: row.created_at,
                            startedAt: row.started_at,
                            completedAt: row.completed_at
                        };
                    } catch (parseError) {
                        console.error('Job parse error:', parseError.message);
                        return null;
                    }
                }).filter(job => job !== null);

                resolve(jobs);
            });
        });
    }

    /**
     * Delete old jobs
     * @param {number} olderThan - Delete jobs older than this (ms)
     */
    async deleteOldJobs(olderThan = 86400000) { // 24 hours default
        if (!this.enabled || !this.db) {
            return;
        }

        const cutoff = Date.now() - olderThan;

        return new Promise((resolve, reject) => {
            const query = `
                DELETE FROM jobs 
                WHERE (status = 'completed' OR status = 'failed')
                AND completed_at < ?
            `;

            this.db.run(query, [cutoff], function(err) {
                if (err) {
                    console.error('Job cleanup error:', err.message);
                    reject(err);
                } else {
                    if (this.changes > 0) {
                        console.log(`Deleted ${this.changes} old jobs`);
                    }
                    resolve(this.changes);
                }
            });
        });
    }

    /**
     * Get job statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        if (!this.enabled || !this.db) {
            return { enabled: false };
        }

        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
                FROM jobs
            `;

            this.db.get(query, [], (err, row) => {
                if (err) {
                    console.error('Stats error:', err.message);
                    reject(err);
                    return;
                }

                resolve({
                    enabled: true,
                    total: row.total || 0,
                    pending: row.pending || 0,
                    processing: row.processing || 0,
                    completed: row.completed || 0,
                    failed: row.failed || 0
                });
            });
        });
    }

    /**
     * Close database connection
     */
    async close() {
        if (!this.db) return;

        return new Promise((resolve) => {
            this.db.close(() => {
                console.log('✓ Job store closed');
                resolve();
            });
        });
    }
}

module.exports = JobStore;
