const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const HashGenerator = require('./hash');

/**
 * Cache Manager using SQLite
 * Provides semantic caching for generated questions
 */
class CacheManager {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.ttlDays = config.ttlDays || 30;
        this.maxEntries = config.maxEntries || 1000;
        this.dbPath = config.dbPath || path.join(process.cwd(), 'data', 'nlp-generator.db');
        this.db = null;
    }

    /**
     * Initialize cache database
     */
    async initialize() {
        if (!this.enabled) {
            console.log('Cache is disabled');
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
                    reject(new Error(`Failed to open cache database: ${err.message}`));
                    return;
                }

                this.createTables()
                    .then(() => {
                        console.log('✓ Cache initialized');
                        resolve();
                    })
                    .catch(reject);
            });
        });
    }

    /**
     * Create cache tables and indexes
     */
    async createTables() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cache_key TEXT UNIQUE NOT NULL,
                text_hash TEXT NOT NULL,
                options_hash TEXT NOT NULL,
                questions TEXT NOT NULL,
                metadata TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                accessed_at INTEGER NOT NULL,
                access_count INTEGER DEFAULT 1
            )
        `;

        const createIndexes = [
            'CREATE INDEX IF NOT EXISTS idx_cache_key ON cache(cache_key)',
            'CREATE INDEX IF NOT EXISTS idx_created_at ON cache(created_at)'
        ];

        return new Promise((resolve, reject) => {
            // Create table first
            this.db.run(createTableSQL, (err) => {
                if (err) {
                    reject(new Error(`Failed to create cache table: ${err.message}`));
                    return;
                }

                // Create indexes
                let completed = 0;
                createIndexes.forEach(indexSQL => {
                    this.db.run(indexSQL, (err) => {
                        if (err) {
                            console.warn(`Index creation warning: ${err.message}`);
                        }
                        completed++;
                        if (completed === createIndexes.length) {
                            resolve();
                        }
                    });
                });
            });
        });
    }

    /**
     * Get cached result
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object|null>} - Cached result or null
     */
    async get(text, options = {}) {
        if (!this.enabled || !this.db) {
            return null;
        }

        const cacheKey = HashGenerator.generateCacheKey(text, options);
        const now = Date.now();
        const ttlMs = this.ttlDays * 24 * 60 * 60 * 1000;

        return new Promise((resolve, reject) => {
            const query = `
                SELECT questions, metadata, created_at, access_count
                FROM cache
                WHERE cache_key = ?
                AND (? - created_at) < ?
            `;

            this.db.get(query, [cacheKey, now, ttlMs], (err, row) => {
                if (err) {
                    console.error('Cache read error:', err.message);
                    resolve(null);
                    return;
                }

                if (!row) {
                    resolve(null);
                    return;
                }

                // Update access stats
                this.updateAccessStats(cacheKey).catch(console.error);

                try {
                    const result = {
                        questions: JSON.parse(row.questions),
                        metadata: JSON.parse(row.metadata),
                        cached: true,
                        cacheAge: Math.floor((now - row.created_at) / 1000 / 60), // minutes
                        accessCount: row.access_count + 1
                    };
                    resolve(result);
                } catch (parseError) {
                    console.error('Cache parse error:', parseError.message);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Store result in cache
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @param {Object} result - Generation result
     */
    async set(text, options = {}, result) {
        if (!this.enabled || !this.db) {
            return;
        }

        const cacheKey = HashGenerator.generateCacheKey(text, options);
        const textHash = HashGenerator.hashText(text);
        const optionsHash = HashGenerator.hashOptions(options);
        const now = Date.now();

        // Ensure we don't cache the 'cached' flag
        const cleanResult = { ...result };
        delete cleanResult.cached;
        delete cleanResult.cacheAge;
        delete cleanResult.accessCount;

        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO cache 
                (cache_key, text_hash, options_hash, questions, metadata, created_at, accessed_at, access_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `;

            const params = [
                cacheKey,
                textHash,
                optionsHash,
                JSON.stringify(cleanResult.questions || []),
                JSON.stringify(cleanResult.metadata || {}),
                now,
                now
            ];

            this.db.run(query, params, (err) => {
                if (err) {
                    console.error('Cache write error:', err.message);
                    resolve(); // Don't fail on cache errors
                    return;
                }

                // Cleanup old entries if needed
                this.cleanup().catch(console.error);
                resolve();
            });
        });
    }

    /**
     * Update access statistics
     */
    async updateAccessStats(cacheKey) {
        if (!this.db) return;

        const now = Date.now();
        const query = `
            UPDATE cache
            SET accessed_at = ?,
                access_count = access_count + 1
            WHERE cache_key = ?
        `;

        return new Promise((resolve) => {
            this.db.run(query, [now, cacheKey], () => {
                resolve(); // Ignore errors for stats
            });
        });
    }

    /**
     * Cleanup old cache entries
     */
    async cleanup() {
        if (!this.db) return;

        return new Promise((resolve) => {
            // First, check if we need cleanup
            this.db.get('SELECT COUNT(*) as count FROM cache', [], (err, row) => {
                if (err || !row || row.count <= this.maxEntries) {
                    resolve();
                    return;
                }

                // Delete oldest entries beyond max
                const deleteQuery = `
                    DELETE FROM cache
                    WHERE id IN (
                        SELECT id FROM cache
                        ORDER BY accessed_at ASC
                        LIMIT ?
                    )
                `;

                const deleteCount = row.count - this.maxEntries;
                this.db.run(deleteQuery, [deleteCount], () => {
                    console.log(`Cleaned up ${deleteCount} old cache entries`);
                    resolve();
                });
            });
        });
    }

    /**
     * Clear all cache
     */
    async clear() {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM cache', (err) => {
                if (err) {
                    reject(new Error(`Failed to clear cache: ${err.message}`));
                } else {
                    console.log('✓ Cache cleared');
                    resolve();
                }
            });
        });
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        if (!this.db) {
            return { enabled: false };
        }

        return new Promise((resolve) => {
            const query = `
                SELECT 
                    COUNT(*) as total_entries,
                    SUM(access_count) as total_accesses,
                    AVG(access_count) as avg_accesses,
                    MAX(accessed_at) as last_access,
                    MIN(created_at) as oldest_entry
                FROM cache
            `;

            this.db.get(query, [], (err, row) => {
                if (err) {
                    resolve({ enabled: true, error: err.message });
                    return;
                }

                const now = Date.now();
                resolve({
                    enabled: true,
                    totalEntries: row.total_entries || 0,
                    totalAccesses: row.total_accesses || 0,
                    avgAccesses: Math.round(row.avg_accesses || 0),
                    lastAccess: row.last_access ? new Date(row.last_access).toISOString() : null,
                    oldestEntry: row.oldest_entry ? new Date(row.oldest_entry).toISOString() : null,
                    maxEntries: this.maxEntries,
                    ttlDays: this.ttlDays
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
                console.log('✓ Cache closed');
                resolve();
            });
        });
    }
}

module.exports = CacheManager;
