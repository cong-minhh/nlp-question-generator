require('dotenv').config();
const assert = require('assert');
const { logger } = require('../utils/logger');

// Import Utils
const CacheManager = require('../utils/cache');
const JobQueue = require('../utils/jobQueue');
const ParallelProcessor = require('../utils/parallelProcessor');
const QualityScorer = require('../utils/qualityScorer');
const Deduplicator = require('../utils/deduplicator');
const DifficultyBalancer = require('../utils/difficultyBalancer');
const RetryManager = require('../utils/retryManager');

async function verifyConfig() {
    logger.info('Verifying Utils Configuration...');
    let passed = 0;
    let failed = 0;

    const check = (name, actual, expected, description) => {
        try {
            // loose equality for string/number Configs from env
            if (actual != expected) {
                 // Special handling for boolean strings "true"/"false" vs booleans
                if (typeof actual === 'boolean' && (expected === 'true' || expected === 'false')) {
                     if (String(actual) !== expected) {
                        throw new Error(`Expected ${expected} but got ${actual}`);
                     }
                } else {
                     throw new Error(`Expected ${expected} but got ${actual}`);
                }
            }
            console.log(`✓ ${name}: ${description} (${actual})`);
            passed++;
        } catch (e) {
            console.error(`✗ ${name}: ${description} - ${e.message}`);
            failed++;
        }
    };

    // 1. CacheManager
    const cache = new CacheManager();
    check('CacheManager', cache.enabled, process.env.CACHE_ENABLED !== 'false', 'enabled');
    check('CacheManager', cache.ttlDays, process.env.CACHE_TTL_DAYS, 'ttlDays');
    check('CacheManager', cache.maxEntries, process.env.CACHE_MAX_ENTRIES, 'maxEntries');

    // 2. JobQueue
    const queue = new JobQueue();
    check('JobQueue', queue.enabled, process.env.QUEUE_ENABLED !== 'false', 'enabled');
    check('JobQueue', queue.maxConcurrent, process.env.QUEUE_WORKERS, 'maxConcurrent');

    // 3. ParallelProcessor
    const parallel = new ParallelProcessor();
    check('ParallelProcessor', parallel.enabled, process.env.PARALLEL_ENABLED !== 'false', 'enabled');
    check('ParallelProcessor', parallel.chunkSize, process.env.PARALLEL_CHUNK_SIZE, 'chunkSize');
    check('ParallelProcessor', parallel.maxWorkers, process.env.PARALLEL_MAX_WORKERS, 'maxWorkers');
    check('ParallelProcessor', parallel.threshold, process.env.PARALLEL_THRESHOLD, 'threshold');

    // 4. QualityScorer
    const scorer = new QualityScorer();
    check('QualityScorer', scorer.enabled, process.env.QUALITY_SCORING_ENABLED !== 'false', 'enabled');
    check('QualityScorer', scorer.minScore, process.env.QUALITY_MIN_SCORE, 'minScore');
    check('QualityScorer', scorer.maxRetries, process.env.QUALITY_MAX_RETRIES, 'maxRetries');
    check('QualityScorer', scorer.useQuickScore, process.env.QUALITY_QUICK_SCORE === 'true', 'useQuickScore');
    
    // 5. Deduplicator
    const dedup = new Deduplicator();
    check('Deduplicator', dedup.enabled, process.env.DEDUP_ENABLED !== 'false', 'enabled');
    check('Deduplicator', dedup.threshold, process.env.DEDUP_THRESHOLD, 'threshold');
    check('Deduplicator', dedup.compareOptions, process.env.DEDUP_COMPARE_OPTIONS !== 'false', 'compareOptions');
    check('Deduplicator', dedup.keepBest, process.env.DEDUP_KEEP_BEST !== 'false', 'keepBest');

    // 6. DifficultyBalancer
    const balancer = new DifficultyBalancer();
    check('DifficultyBalancer', balancer.enabled, process.env.DIFFICULTY_BALANCE_ENABLED !== 'false', 'enabled');
    check('DifficultyBalancer', balancer.tolerance, process.env.DIFFICULTY_BALANCE_TOLERANCE, 'tolerance');
    check('DifficultyBalancer', balancer.maxRetries, process.env.DIFFICULTY_BALANCE_MAX_RETRIES, 'maxRetries');

    // 7. RetryManager
    const retry = new RetryManager();
    check('RetryManager', retry.maxRetries, process.env.ERROR_MAX_RETRIES, 'maxRetries');
    check('RetryManager', retry.baseDelay, process.env.ERROR_BASE_DELAY, 'baseDelay');
    check('RetryManager', retry.maxDelay, process.env.ERROR_MAX_DELAY, 'maxDelay');
    // Note: process.env.ERROR_CIRCUIT_BREAKER_THRESHOLD is not standard in RetryManager usually, checking if I added it in plan

    console.log(`\nVerification Complete: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

verifyConfig().catch(console.error);
