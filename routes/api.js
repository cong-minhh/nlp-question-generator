const express = require('express');
const { logger } = require('../utils/logger');
const upload = require('../config/upload');
const fileProcessingService = require('../services/FileProcessingService');
const { cleanupFiles } = require('../utils/fileUtils');
const GeminiQuestionGenerator = require('../services/questionGenerator');
const { authenticate, optionalAuth } = require('../middleware/auth');
const SessionAnalyzer = require('../services/sessionAnalyzer');
const {
    validateTextInput,
    validateNumQuestions,
    createErrorResponse,
    createSuccessResponse
} = require('../utils/fileUtils');

const router = express.Router();

/**
 * POST endpoint to generate questions
 * Body: { text: string, numQuestions?: number }
 * Requires authentication in private mode
 */
router.post('/generate', authenticate, async (req, res) => {
    try {
        // Get question generator from app.locals (initialized in server.js)
        const questionGenerator = req.app.locals.questionGenerator;

        const { text, numQuestions } = req.body;
        const requestedQuestions = numQuestions || 10;

        // Validate input
        const textValidation = validateTextInput(text);
        if (!textValidation.valid) {
            return res.status(400).json(createErrorResponse(textValidation.error, 400));
        }

        const numQuestionsValidation = validateNumQuestions(requestedQuestions);
        if (!numQuestionsValidation.valid) {
            return res.status(400).json(createErrorResponse(numQuestionsValidation.error, 400));
        }

        // Generate questions
        const result = await questionGenerator.generateQuestions(text, { numQuestions: numQuestionsValidation.value });

        // Return success response
        res.json(createSuccessResponse(result));
    } catch (error) {


        logger.error('API Error', error);
        res.status(500).json(createErrorResponse(`Failed to generate questions: ${error.message}`, 500));
    }
});


/**
 * POST endpoint to analyze session data
 * Body: { session_data: Object, options: Object }
 */
router.post('/analyze-session', authenticate, async (req, res) => {
    try {
        const { session_data, options } = req.body;

        if (!session_data) {
            return res.status(400).json(createErrorResponse('Missing session_data', 400));
        }

        const providerManager = req.app.locals.providerManager;
        const sessionAnalyzer = new SessionAnalyzer(providerManager);

        const analysis = await sessionAnalyzer.analyzeSession(session_data, options);

        res.json(createSuccessResponse(analysis));
    } catch (error) {
        logger.error('Analysis Error', error);
        res.status(500).json(createErrorResponse(`Failed to analyze session: ${error.message}`, 500));
    }
});

/**
 * GET endpoint to list available providers
 */
router.get('/providers', async (req, res) => {
    try {
        const providerManager = req.app.locals.providerManager;
        const providers = providerManager.listProviders();
        const currentProvider = providerManager.currentProvider;

        res.json(createSuccessResponse({
            currentProvider,
            providers: providers.map(p => ({
                name: p.name,
                description: p.description,
                configured: p.configured,
                available: p.available,
                isCurrent: p.name === currentProvider
            }))
        }));
    } catch (error) {
        logger.error('Failed to list providers', error);
        res.status(500).json(createErrorResponse(`Failed to list providers: ${error.message}`, 500));
    }
});

/**
 * GET endpoint to get current provider info
 */
router.get('/current-provider', async (req, res) => {
    try {
        const providerManager = req.app.locals.providerManager;
        const provider = providerManager.getCurrentProvider();

        res.json(createSuccessResponse({
            name: provider.name,
            description: provider.description,
            model: provider.currentModel || provider.config.model,
            configured: provider.isConfigured()
        }));
    } catch (error) {
        logger.error('Failed to get current provider', error);
        res.status(500).json(createErrorResponse(`Failed to get current provider: ${error.message}`, 500));
    }
});

/**
 * POST endpoint to switch AI provider
 * Body: { provider: string }
 * Requires authentication in private mode
 */
router.post('/switch-provider', authenticate, async (req, res) => {
    try {
        const { provider } = req.body;

        if (!provider) {
            return res.status(400).json(createErrorResponse('Provider name is required', 400));
        }

        const providerManager = req.app.locals.providerManager;

        // Check if provider is available
        if (!providerManager.hasProvider(provider)) {
            return res.status(400).json(createErrorResponse(
                `Provider '${provider}' is not available or not configured. Available providers: ${providerManager.listProviders()
                    .filter(p => p.configured)
                    .map(p => p.name)
                    .join(', ')
                }`,
                400
            ));
        }

        // Switch provider
        providerManager.switchProvider(provider);

        res.json(createSuccessResponse({
            message: `Switched to ${provider} provider`,
            currentProvider: provider
        }));
    } catch (error) {
        logger.error('Failed to switch provider', error);
        res.status(500).json(createErrorResponse(`Failed to switch provider: ${error.message}`, 500));
    }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.json(createSuccessResponse({
        status: 'healthy',
        service: 'NLP Question Generator',
        version: '2.0.0',
        features: ['text-input', 'file-upload', 'multi-file', 'multi-provider']
    }));
});

/**
 * Root endpoint with API documentation
 */
router.get('/', (req, res) => {
    res.json(createSuccessResponse({
        service: 'NLP Question Generator API',
        version: '2.0.0',
        endpoints: {
            'POST /generate': {
                description: 'Generate quiz questions from text input',
                contentType: 'application/json',
                body: {
                    text: 'string (required) - The text to generate questions from',
                    numQuestions: 'number (optional) - Number of questions to generate (default: 10, max: 50)'
                },
                example: {
                    text: 'The mitochondria is the powerhouse of the cell...',
                    numQuestions: 5
                }
            },
            'GET /providers': {
                description: 'List all available AI providers and their status'
            },
            'GET /current-provider': {
                description: 'Get information about the currently active provider'
            },
            'POST /switch-provider': {
                description: 'Switch to a different AI provider',
                contentType: 'application/json',
                body: {
                    provider: 'string (required) - Provider name (gemini, openai, anthropic, deepseek)'
                },
                example: {
                    provider: 'deepseek'
                }
            },
            'GET /health': {
                description: 'Check service health and available features'
            }
        }
    }));
});

// Cache routes
const cacheRoutes = require('./cacheRoutes');
router.use('/cache', cacheRoutes);

/**
 * GET /parallel/config
 * Get parallel processing configuration
 */
router.get('/parallel/config', (req, res) => {
    try {
        const generator = req.app.locals.questionGenerator;
        const config = generator.getParallelConfig();

        res.json({
            success: true,
            config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /parallel/estimate
 * Estimate time savings for parallel processing
 * Query: ?numQuestions=30
 */
router.get('/parallel/estimate', (req, res) => {
    try {
        const numQuestions = parseInt(req.query.numQuestions) || 30;
        const generator = req.app.locals.questionGenerator;
        const estimate = generator.estimateParallelTimeSavings(numQuestions);

        res.json({
            success: true,
            numQuestions,
            estimate
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;