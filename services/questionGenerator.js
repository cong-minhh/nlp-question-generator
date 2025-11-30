const ProviderManager = require('../providers/providerManager');
const CacheManager = require('../utils/cache');
const ParallelProcessor = require('../utils/parallelProcessor');
const QualityScorer = require('../utils/qualityScorer');
const Deduplicator = require('../utils/deduplicator');
const DifficultyBalancer = require('../utils/difficultyBalancer');

/**
 * Multi-Provider Question Generation Service
 * Supports multiple AI providers with caching, parallel processing, quality scoring, deduplication, and difficulty balancing
 */
class MultiProviderQuestionGenerator {
    constructor(config = {}) {
        this.providerManager = new ProviderManager(config);
        this.cacheManager = new CacheManager({
            enabled: process.env.CACHE_ENABLED !== 'false',
            ttlDays: parseInt(process.env.CACHE_TTL_DAYS) || 30,
            maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES) || 1000
        });
        this.parallelProcessor = new ParallelProcessor({
            enabled: process.env.PARALLEL_ENABLED !== 'false',
            chunkSize: parseInt(process.env.PARALLEL_CHUNK_SIZE) || 10,
            maxWorkers: parseInt(process.env.PARALLEL_MAX_WORKERS) || 5,
            threshold: 20
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
            await this.providerManager.initialize(config);
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
            console.log('✓ Multi-provider question generator initialized');
            if (this.qualityScorer.enabled) {
                console.log(`✓ Quality scoring enabled (min score: ${this.qualityScorer.minScore}, provider: ${scorerProviderName})`);
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
                    console.log(`✓ Cache hit (age: ${cached.cacheAge}min, uses: ${cached.accessCount})`);
                    return cached;
                }
            } catch (cacheError) {
                console.warn('Cache read error:', cacheError.message);
                // Continue to generation if cache fails
            }
        }

        // Use parallel processing for large batches
        if (useParallel) {
            try {
                const result = await this.parallelProcessor.generateParallel(
                    text,
                    numQuestions,
                    async (txt, opts) => {
                        return await this.providerManager.generateQuestions(txt, opts);
                    },
                    options
                );
                
                return result;
            } catch (error) {
                console.error('Parallel generation failed:', error.message);
                throw error;
            }
        }

        // Regular generation for small batches
        try {
            let result = await this.providerManager.generateQuestions(text, options);
            
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
                const dedupResult = this.deduplicator.deduplicate(
                    result.questions,
                    result.metadata?.qualityScoring?.statistics ? result.questions.map((_, i) => ({ score: 7 })) : null
                );

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
                    console.warn('Cache write error:', err.message);
                });
            }
            
            return result;
        } catch (error) {
            console.error('Question generation failed:', error.message);
            throw error;
        }
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
            console.log(`✓ Switched to ${providerName} provider`);
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

        if (trimmed.length > 50000) {
            return { valid: false, error: 'Text input is too long (max 50,000 characters)' };
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
        const TextExtractor = require('./textExtractor');
        const textExtractor = new TextExtractor();

        try {
            console.log('Extracting text from files...');
            const extractedText = await textExtractor.processFiles(filePaths);
            
            if (!extractedText.trim()) {
                throw new Error('No text could be extracted from the provided files');
            }

            console.log(`Extracted ${extractedText.length} characters of text`);
            
            const validation = this.validateInput(extractedText);
            if (!validation.valid) {
                throw new Error(`Invalid extracted text: ${validation.error}`);
            }

            return await this.generateQuestions(validation.text, options);
        } catch (error) {
            console.error('File processing failed:', error.message);
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
