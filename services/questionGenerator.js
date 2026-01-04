const ProviderManager = require('../providers/providerManager');
const CacheManager = require('../utils/cache');
const ParallelProcessor = require('../utils/parallelProcessor');
const QualityScorer = require('../utils/qualityScorer');
const Deduplicator = require('../utils/deduplicator');
const DifficultyBalancer = require('../utils/difficultyBalancer');
const { logger } = require('../utils/logger');

/**
 * Multi-Provider Question Generation Service
 * Supports multiple AI providers with caching, parallel processing, quality scoring, deduplication, and difficulty balancing
 */
class MultiProviderQuestionGenerator {
    constructor(providerManagerOrConfig) {
        // Accept either a ProviderManager instance or a config object
        if (providerManagerOrConfig instanceof ProviderManager) {
            // Direct ProviderManager instance passed
            this.providerManager = providerManagerOrConfig;
        } else if (providerManagerOrConfig && providerManagerOrConfig.providerManager) {
            // Config object with providerManager property
            this.providerManager = providerManagerOrConfig.providerManager;
        } else if (providerManagerOrConfig && Object.keys(providerManagerOrConfig).length > 0) {
            // Create new ProviderManager only if config has properties
            this.providerManager = new ProviderManager(providerManagerOrConfig);
        }
        // If providerManager is not set, it will be set manually later
        this.cacheManager = new CacheManager({
            enabled: process.env.CACHE_ENABLED !== 'false',
            ttlDays: parseInt(process.env.CACHE_TTL_DAYS) || 30,
            maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES) || 1000
        });
        this.parallelProcessor = new ParallelProcessor({
            enabled: process.env.PARALLEL_ENABLED !== 'false',
            chunkSize: parseInt(process.env.PARALLEL_CHUNK_SIZE) || 10,
            maxWorkers: parseInt(process.env.PARALLEL_MAX_WORKERS) || 5,
            threshold: parseInt(process.env.PARALLEL_THRESHOLD) || 20
        });
        this.qualityScorer = null; // Initialized later with provider
        this.deduplicator = new Deduplicator({
            enabled: process.env.DEDUP_ENABLED !== 'false',
            threshold: parseInt(process.env.DEDUP_THRESHOLD) || 85,
            compareOptions: process.env.DEDUP_COMPARE_OPTIONS !== 'false',
            keepBest: process.env.DEDUP_KEEP_BEST !== 'false'
        });
        this.difficultyBalancer = new DifficultyBalancer({
            enabled: process.env.DIFFICULTY_BALANCE_ENABLED !== 'false',
            tolerance: parseFloat(process.env.DIFFICULTY_BALANCE_TOLERANCE) || 0.10,
            maxRetries: parseInt(process.env.DIFFICULTY_BALANCE_MAX_RETRIES) || 2
        });
        this.initialized = false;
    }

    /**
     * Initialize the provider manager, cache, and quality scorer
     */
    async initialize(config = {}) {
        if (this.initialized) {
            return;
        }

        try {
            // Only initialize provider manager if not already initialized
            if (!this.providerManager.initialized) {
                await this.providerManager.initialize(config);
            }
            await this.cacheManager.initialize();

            // Initialize quality scorer with a provider (use cheapest/fastest)
            const scorerProviderName = process.env.QUALITY_SCORER_PROVIDER || 'gemini';
            let scorerProvider = null;

            if (this.providerManager.hasProvider(scorerProviderName)) {
                scorerProvider = this.providerManager.getProvider(scorerProviderName);
            } else {
                // Fall back to current provider
                scorerProvider = this.providerManager.getCurrentProvider();
            }

            this.qualityScorer = new QualityScorer({
                enabled: process.env.QUALITY_SCORING_ENABLED !== 'false',
                minScore: parseInt(process.env.QUALITY_MIN_SCORE) || 6,
                maxRetries: parseInt(process.env.QUALITY_MAX_RETRIES) || 2,
                scorerProvider: scorerProvider,
                useQuickScore: process.env.QUALITY_QUICK_SCORE === 'true'
            });

            this.initialized = true;
            this.initialized = true;
            logger.info('Multi-provider question generator initialized');
            if (this.qualityScorer.enabled) {
                logger.info(`Quality scoring enabled`, { minScore: this.qualityScorer.minScore, provider: scorerProviderName });
            }
        } catch (error) {
            throw new Error(`Failed to initialize question generator: ${error.message}`);
        }
    }

    /**
     * Generate questions using current provider with caching and parallel processing
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Generated questions
     */
    async generateQuestions(text, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        const numQuestions = options.numQuestions || 10;

        // Advanced Distribution Logic
        if (options.difficultyDistribution || options.bloomDistribution) {
            return this.generateDistributedQuestions(text, options);
        }

        // Check if text is too large for model context
        // Default to 1,000,000 characters (~250k tokens) if not set in env
        // This is safe for Gemini 1.5 but prevents massive memory abuse
        const MAX_TEXT_CHARS = parseInt(process.env.MAX_TEXT_LENGTH) || 1000000;
        
        if (text.length > MAX_TEXT_CHARS) {
            logger.warn(`Text too large (${text.length} chars). Truncating to ${MAX_TEXT_CHARS} chars.`);
            text = text.substring(0, MAX_TEXT_CHARS);
        }

        const useParallel = options.parallel !== false && this.parallelProcessor.shouldUseParallel(numQuestions);

        // Add provider to cache key
        const currentProvider = this.providerManager.getCurrentProvider();
        const cacheOptions = {
            ...options,
            provider: currentProvider?.name || 'unknown'
        };

        // Check cache first (unless explicitly disabled)
        if (options.noCache !== true && !useParallel) {
            try {
                const cached = await this.cacheManager.get(text, cacheOptions);
                if (cached) {
                    logger.info(`Cache hit`, { ageMin: cached.cacheAge, uses: cached.accessCount });
                    return cached;
                }
            } catch (cacheError) {
                logger.warn('Cache read error', { error: cacheError.message });
                // Continue to generation if cache fails
            }
        }

        // Use parallel processing for large batches
        let result;
        if (useParallel) {
            try {
                result = await this.parallelProcessor.generateParallel(
                    text,
                    numQuestions,
                    async (txt, opts) => {
                        return await this.providerManager.generateQuestions(txt, opts);
                    },
                    options
                );

                logger.info(`Parallel generation completed`, { count: result.questions.length });
            } catch (error) {
                logger.error('Parallel generation failed', error);
                throw error;
            }
        } else {
            // Regular generation for small batches
            if (options.parallel !== false && this.parallelProcessor.enabled) {
                logger.debug(`Parallel generation skipped (requested ${numQuestions} < threshold ${this.parallelProcessor.threshold})`);
            }
            result = await this.providerManager.generateQuestions(text, options);
        }

        // Apply post-processing to all results (parallel and non-parallel)
        try {

            // Apply quality scoring if enabled and not disabled for this request
            if (options.qualityCheck !== false && this.qualityScorer && this.qualityScorer.enabled) {
                const scoringResult = await this.qualityScorer.scoreAndImprove(
                    result.questions,
                    async (count) => {
                        // Regenerate function for low-quality questions
                        const regenResult = await this.providerManager.generateQuestions(text, {
                            ...options,
                            numQuestions: count
                        });
                        return regenResult.questions;
                    }
                );

                // Update result with scored questions
                result = {
                    ...result,
                    questions: scoringResult.questions,
                    metadata: {
                        ...result.metadata,
                        qualityScoring: {
                            enabled: true,
                            allPassed: scoringResult.allPassed,
                            rejected: scoringResult.rejected || 0,
                            regenerated: scoringResult.regenerated || 0,
                            attempts: scoringResult.attempts || 1,
                            statistics: this.qualityScorer.getStatistics(scoringResult.scores)
                        }
                    }
                };
            }

            // Apply deduplication if enabled and not disabled for this request
            if (options.deduplicate !== false && this.deduplicator && this.deduplicator.enabled) {
                let dedupResult = this.deduplicator.deduplicate(
                    result.questions,
                    result.metadata?.qualityScoring?.statistics ? result.questions.map((_, i) => ({ score: 7 })) : null
                );

                // Update result with initial deduplication
                result = {
                    ...result,
                    questions: dedupResult.questions,
                    metadata: {
                        ...result.metadata,
                        deduplication: {
                            enabled: true,
                            duplicatesFound: dedupResult.duplicatesFound,
                            duplicatesRemoved: dedupResult.duplicatesRemoved,
                            kept: dedupResult.kept,
                            duplicateRate: dedupResult.duplicatesRemoved > 0
                                ? ((dedupResult.duplicatesRemoved / (dedupResult.kept + dedupResult.duplicatesRemoved)) * 100).toFixed(1) + '%'
                                : '0%',
                            groups: dedupResult.groups.length
                        }
                    }
                };

                // Replenish missing questions if count dropped below requested
                if (result.questions.length < numQuestions) {
                    const missingCount = numQuestions - result.questions.length;
                    logger.warn(`Deduplication removed ${missingCount} questions. Replenishing...`);

                    let currentQuestions = [...result.questions];
                    let attempts = 0;
                    const MAX_REPLENISH_ATTEMPTS = 3;

                    while (currentQuestions.length < numQuestions && attempts < MAX_REPLENISH_ATTEMPTS) {
                        attempts++;
                        const needed = numQuestions - currentQuestions.length;
                        // Request slightly more to account for potential new duplicates
                        const toGenerate = Math.ceil(needed * 1.5);

                        logger.info(`Replenishment attempt ${attempts}/${MAX_REPLENISH_ATTEMPTS}: Generating ${toGenerate} questions...`);

                        try {
                            const replenishResult = await this.providerManager.generateQuestions(text, {
                                ...options,
                                numQuestions: toGenerate,
                                qualityCheck: false, // Skip quality check for speed during replenishment
                                deduplicate: false // We'll dedup manually
                            });

                            if (replenishResult.questions && replenishResult.questions.length > 0) {
                                // Add new questions
                                const combined = [...currentQuestions, ...replenishResult.questions];

                                // Re-run deduplication on combined set
                                const newDedupResult = this.deduplicator.deduplicate(combined);
                                currentQuestions = newDedupResult.questions;

                                logger.info(`Replenishment attempt ${attempts} result: Total now ${currentQuestions.length}/${numQuestions}`);
                            }
                        } catch (err) {
                            logger.warn(`Replenishment attempt ${attempts} failed`, { error: err.message });
                        }
                    }

                    // Update final result
                    result.questions = currentQuestions;
                    result.metadata.deduplication.replenished = true;
                    result.metadata.deduplication.replenishAttempts = attempts;
                    result.metadata.deduplication.finalCount = currentQuestions.length;

                    if (currentQuestions.length < numQuestions) {
                        logger.warn(`Could not fully replenish questions. Got ${currentQuestions.length}/${numQuestions}`);
                    } else {
                        logger.info(`Successfully replenished to ${currentQuestions.length} questions`);
                    }
                }
            }

            // Apply difficulty balancing if enabled and difficulty is 'mixed'
            const requestedDifficulty = options.difficulty || 'mixed';


            if (options.balanceDifficulty !== false &&
                this.difficultyBalancer &&
                this.difficultyBalancer.enabled &&
                requestedDifficulty === 'mixed') {


                const balanceResult = await this.difficultyBalancer.balance(
                    result.questions,
                    async (count, difficulty) => {
                        // Regenerate function for specific difficulty
                        const regenResult = await this.providerManager.generateQuestions(text, {
                            ...options,
                            numQuestions: count,
                            difficulty: difficulty,
                            qualityCheck: false, // Skip quality check for rebalancing
                            deduplicate: false // Skip dedup for rebalancing
                        });
                        return regenResult.questions;
                    }
                );


                result = {
                    ...result,
                    questions: balanceResult.questions,
                    metadata: {
                        ...result.metadata,
                        difficultyBalancing: {
                            enabled: true,
                            balanced: balanceResult.balanced,
                            attempts: balanceResult.attempts || 1,
                            distribution: {
                                easy: balanceResult.distribution.easy,
                                medium: balanceResult.distribution.medium,
                                hard: balanceResult.distribution.hard,
                                percentages: {
                                    easy: (balanceResult.distribution.percentages.easy * 100).toFixed(1) + '%',
                                    medium: (balanceResult.distribution.percentages.medium * 100).toFixed(1) + '%',
                                    hard: (balanceResult.distribution.percentages.hard * 100).toFixed(1) + '%'
                                }
                            }
                        }
                    }
                };
            }

            // Store in cache (fire and forget)
            if (options.noCache !== true) {
                this.cacheManager.set(text, cacheOptions, result).catch(err => {
                    logger.warn('Cache write error', { error: err.message });
                });
            }


            return result;
        } catch (error) {
            logger.error('Question generation failed', error);
            throw error;
        }
    }
    /**
     * Generate questions with specific distributions
     */
    async generateDistributedQuestions(text, options) {
        const numQuestions = options.numQuestions || 10;
        const diffDist = options.difficultyDistribution || {};
        const bloomDist = options.bloomDistribution || {};

        // 1. Create Execution Plan
        // We map N slots to (Difficulty, Bloom) pairs
        let slots = [];
        for (let i = 0; i < numQuestions; i++) slots.push({});

        // Fill Difficulty
        if (options.difficultyDistribution) {
            let current = 0;
            for (const [key, count] of Object.entries(diffDist)) {
                for (let c = 0; c < count; c++) {
                    if (slots[current]) slots[current].difficulty = key;
                    current++;
                }
            }
        }

        // Fill Bloom (Shuffle first to distribute evenly across difficulties)
        if (options.bloomDistribution) {
            let bloomList = [];
            for (const [key, count] of Object.entries(bloomDist)) {
                for (let c = 0; c < count; c++) bloomList.push(key);
            }
            // Shuffle bloom list
            bloomList.sort(() => Math.random() - 0.5);

            bloomList.forEach((bloom, index) => {
                if (slots[index]) slots[index].bloomLevel = bloom;
            });
        }

        // 2. Group by unique configuration for prompt construction
        const distributionPlan = {
            total: numQuestions,
            breakdown: []
        };
        
        const counts = {};
        slots.forEach(slot => {
            const diff = slot.difficulty || options.difficulty || 'medium';
            const bloom = slot.bloomLevel || options.bloomLevel || 'apply';
            const key = `${diff}|${bloom}`;

            if (!counts[key]) {
                counts[key] = { difficulty: diff, bloomLevel: bloom, count: 0 };
            }
            counts[key].count++;
        });

        // Convert map to array for the provider
        distributionPlan.breakdown = Object.values(counts);

        distributionPlan.breakdown = Object.values(counts);

        logger.info('Generating with single request distribution plan', { plan: distributionPlan });

        // 3. Execute Single Request
        const singleRequestOptions = {
            ...options,
            numQuestions: numQuestions,
            distributionPlan: distributionPlan, // Pass the full plan
            difficultyDistribution: null, // Clear to prevent recursion
            bloomDistribution: null
        };

        const result = await this.generateQuestions(text, singleRequestOptions);

        // 4. Return Result
        return {
            ...result,
            metadata: {
                ...result.metadata,
                distribution_mode: 'advanced_single_request',
                plan: counts
            }
        };
    }

    /**
     * Generate questions with parallel processing and progress callback
     * @param {string} text - Input text
     * @param {Object} options - Generation options
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Object>}
     */
    async generateQuestionsWithProgress(text, options = {}, onProgress = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        const numQuestions = options.numQuestions || 10;
        const useParallel = options.parallel !== false && this.parallelProcessor.shouldUseParallel(numQuestions);

        if (!useParallel) {
            // Regular generation without progress
            return await this.generateQuestions(text, options);
        }

        // Parallel generation with progress
        return await this.parallelProcessor.generateParallelWithProgress(
            text,
            numQuestions,
            async (txt, opts) => {
                return await this.providerManager.generateQuestions(txt, opts);
            },
            options,
            onProgress
        );
    }

    /**
     * Switch to a different AI provider
     * @param {string} providerName - Name of the provider to switch to
     */
    switchProvider(providerName) {
        if (!this.initialized) {
            throw new Error('Provider manager not initialized. Call initialize() first.');
        }

        try {
            this.providerManager.switchProvider(providerName);
            logger.info(`Switched to ${providerName} provider`);
        } catch (error) {
            throw new Error(`Failed to switch provider: ${error.message}`);
        }
    }

    /**
     * Get current provider information
     * @returns {Object} - Current provider details
     */
    getCurrentProvider() {
        if (!this.initialized) {
            throw new Error('Provider manager not initialized. Call initialize() first.');
        }

        const provider = this.providerManager.getCurrentProvider();
        return {
            name: provider.name,
            description: provider.description,
            configured: provider.isConfigured(),
            model: provider.config.model
        };
    }

    /**
     * List all available providers
     * @returns {Array} - Array of provider information
     */
    listProviders() {
        if (!this.initialized) {
            throw new Error('Provider manager not initialized. Call initialize() first.');
        }

        return this.providerManager.listProviders();
    }

    /**
     * Test provider connections
     * @returns {Promise<Object>} - Test results
     */
    async testConnections() {
        if (!this.initialized) {
            await this.initialize();
        }

        return await this.providerManager.testAllProviders();
    }

    /**
     * Get service status
     * @returns {Object} - Service status information
     */
    getStatus() {
        if (!this.initialized) {
            return {
                initialized: false,
                currentProvider: null,
                availableProviders: []
            };
        }

        return {
            initialized: true,
            currentProvider: this.providerManager.currentProvider,
            availableProviders: this.providerManager.listProviders()
                .filter(p => p.available && p.configured)
                .map(p => p.name)
        };
    }

    /**
     * Validate text input for question generation
     * @param {string} text - Input text to validate
     * @returns {Object} - Validation result
     */
    validateInput(text) {
        if (!text || typeof text !== 'string') {
            return { valid: false, error: 'Text input is required and must be a string' };
        }

        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: 'Text input cannot be empty' };
        }

        if (trimmed.length < 50) {
            return { valid: false, error: 'Text input must be at least 50 characters long' };
        }

        const MAX_TEXT_CHARS = parseInt(process.env.MAX_TEXT_LENGTH) || 1000000;
        if (trimmed.length > MAX_TEXT_CHARS) {
            return { valid: false, error: `Text input is too long (max ${MAX_TEXT_CHARS} characters)` };
        }

        return { valid: true, text: trimmed };
    }

    /**
     * Generate questions from files
     * @param {Array} filePaths - Array of file paths
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} - Generated questions
     */
    async generateFromFiles(filePaths, options = {}) {
        const { processFiles } = require('./textExtractor');
        const path = require('path');
        const fs = require('fs');

        try {
            logger.info('Processing files for extraction...');

            // Map file paths to the structure expected by processFiles
            const files = filePaths.map(filePath => ({
                path: filePath,
                originalname: path.basename(filePath),
                size: fs.statSync(filePath).size
            }));

            const extractionResult = await processFiles(files);
            const extractedText = extractionResult.combinedText;
            const extractedImages = extractionResult.extractedImages || [];

            // If we have images, we can proceed even with empty text (assuming the provider supports it)
            // But we should warn if NO content at all
            if (!extractedText.trim() && extractedImages.length === 0) {
                throw new Error('No text or images could be extracted from the provided files');
            }

            logger.info(`Extracted content`, { chars: extractedText.length, images: extractedImages.length });

            // If we have images, we skip the text validation that requires 50 chars minimum
            // Because the text might just be "Analyze this image"
            if (extractedImages.length === 0) {
                const validation = this.validateInput(extractedText);
                if (!validation.valid) {
                    throw new Error(`Invalid extracted text: ${validation.error}`);
                }
            }

            // Construct payload: plain text OR object with text+images
            const payload = extractedImages.length > 0 
                ? { text: extractedText || "Analyze these images and generate questions based on them.", images: extractedImages }
                : extractedText;

            return await this.generateQuestions(payload, options);
        } catch (error) {
            logger.error('File processing failed', error);
            throw error;
        }
    }

    /**
     * Batch generate questions from multiple texts
     * @param {Array} texts - Array of input texts
     * @param {Object} options - Generation options
     * @returns {Promise<Array>} - Array of generation results
     */
    async batchGenerate(texts, options = {}) {
        if (!Array.isArray(texts)) {
            throw new Error('Texts must be an array');
        }

        const results = [];

        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const validation = this.validateInput(text);

            if (!validation.valid) {
                results.push({
                    success: false,
                    error: validation.error,
                    index: i
                });
                continue;
            }

            try {
                const result = await this.generateQuestions(validation.text, options);
                results.push({
                    success: true,
                    result: result,
                    index: i
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    index: i
                });
            }

            // Add delay between requests to avoid rate limiting
            if (i < texts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    /**
     * Clear cache
     */
    async clearCache() {
        if (!this.initialized) {
            await this.initialize();
        }
        return await this.cacheManager.clear();
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        if (!this.initialized) {
            await this.initialize();
        }
        return await this.cacheManager.getStats();
    }

    /**
     * Get parallel processor configuration
     */
    getParallelConfig() {
        return this.parallelProcessor.getConfig();
    }

    /**
     * Estimate time savings for parallel processing
     * @param {number} numQuestions - Number of questions
     * @returns {Object} - Time estimates
     */
    estimateParallelTimeSavings(numQuestions) {
        return this.parallelProcessor.estimateTimeSavings(numQuestions);
    }

    /**
     * Get smart routing statistics
     */
    getRoutingStats() {
        return this.providerManager.getRoutingStats();
    }

    /**
     * Set routing strategy
     * @param {string} strategy - Routing strategy
     */
    setRoutingStrategy(strategy) {
        this.providerManager.setRoutingStrategy(strategy);
    }

    /**
     * Reset routing statistics
     */
    resetRoutingStats() {
        this.providerManager.resetRoutingStats();
    }
}

// Legacy compatibility wrapper for backward compatibility
class GeminiQuestionGenerator {
    constructor() {
        this.multiProvider = new MultiProviderQuestionGenerator();
        this.currentProvider = 'gemini';
    }

    async initialize() {
        await this.multiProvider.initialize();

        // Set to Gemini by default for backward compatibility
        if (this.multiProvider.providerManager.hasProvider('gemini')) {
            this.multiProvider.switchProvider('gemini');
        }
    }

    async generateQuestions(text, numQuestions = 10) {
        const options = { numQuestions };
        const result = await this.multiProvider.generateQuestions(text, options);
        return result;
    }

    async validateResponse(parsedResponse) {
        // Simple validation for backward compatibility
        if (!parsedResponse.questions || !Array.isArray(parsedResponse.questions)) {
            throw new Error('Invalid response structure: missing questions array');
        }
        return parsedResponse;
    }

    async cleanAIResponse(generatedText) {
        let cleanedText = generatedText.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }
        return cleanedText;
    }
}

// Export both classes - default is the legacy wrapper for backward compatibility
module.exports = GeminiQuestionGenerator;
module.exports.MultiProviderQuestionGenerator = MultiProviderQuestionGenerator;
module.exports.GeminiQuestionGenerator = GeminiQuestionGenerator;
