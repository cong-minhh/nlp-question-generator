const express = require('express');
const upload = require('../config/upload');
const fileProcessingService = require('../services/FileProcessingService');
const { cleanupFiles } = require('../utils/fileUtils');
const GeminiQuestionGenerator = require('../services/questionGenerator');
const { authenticate, optionalAuth } = require('../middleware/auth');
const {
    validateTextInput,
    validateNumQuestions,
    createErrorResponse,
    createSuccessResponse
} = require('../utils/fileUtils');

const router = express.Router();

/**
 * POST endpoint to generate questions
 * Body: { text: string, num_questions?: number }
 * Requires authentication in private mode
 */
router.post('/generate', authenticate, async (req, res) => {
    try {
        // Get question generator from app.locals (initialized in server.js)
        const questionGenerator = req.app.locals.questionGenerator;

        // Accept both num_questions and numQuestions for flexibility
        const { text, num_questions, numQuestions } = req.body;
        const requestedQuestions = num_questions || numQuestions || 10;

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
        console.error('API Error:', error);
        res.status(500).json(createErrorResponse(`Failed to generate questions: ${error.message}`, 500));
    }
});

/**
 * POST endpoint to generate questions from uploaded files
 * Body: files (multipart/form-data), num_questions (optional)
 * Requires authentication in private mode
 */
router.post('/generate-from-files', authenticate, upload.array('files', 10), async (req, res) => {
    const uploadedFiles = req.files || [];

    try {
        // Get question generator from app.locals (initialized in server.js)
        const questionGenerator = req.app.locals.questionGenerator;

        // Validate files were uploaded
        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json(createErrorResponse(
                'No files uploaded. Please upload at least one file (PDF, DOC, DOCX, PPT, PPTX, or TXT)',
                400
            ));
        }

        // Accept both num_questions and numQuestions for flexibility
        console.log('DEBUG: req.body:', JSON.stringify(req.body, null, 2));
        const requestedQuestions = req.body.num_questions || req.body.numQuestions || 10;
        const numQuestionsValidation = validateNumQuestions(requestedQuestions);
        if (!numQuestionsValidation.valid) {
            await cleanupFiles(uploadedFiles.map(f => f.path));
            return res.status(400).json(createErrorResponse(numQuestionsValidation.error, 400));
        }

        console.log(`Processing ${uploadedFiles.length} file(s)...`);

        // Process files and extract text
        const pageStart = req.body.page_start || req.body.pageStart ? parseInt(req.body.page_start || req.body.pageStart) : undefined;
        const pageEnd = req.body.page_end || req.body.pageEnd ? parseInt(req.body.page_end || req.body.pageEnd) : undefined;
        
        console.log(`Processing with options: pageStart=${pageStart}, pageEnd=${pageEnd}`);
        
        const { extractedTexts, extractedImages, fileInfo, combinedText, totalTextLength } = await fileProcessingService.processFiles(uploadedFiles, { pageStart, pageEnd });

        // Cleanup uploaded files
        await cleanupFiles(uploadedFiles.map(f => f.path));

        // Check if we have any text or images
        if (extractedTexts.length === 0 && extractedImages.length === 0) {
            return res.status(400).json(createErrorResponse(
                'No content extracted. Could not extract text or images from any of the uploaded files',
                400
            ));
        }

        console.log(`Total extracted text: ${combinedText.length} characters from ${extractedTexts.length} file(s)`);
        if (extractedImages.length > 0) {
            console.log(`Total extracted images: ${extractedImages.length}`);
        }

        // Generate questions
        // Construct payload: plain text OR object with text+images
        const payload = extractedImages.length > 0 
            ? { text: combinedText || "Analyze these images and generate questions based on them.", images: extractedImages }
            : combinedText;

        const result = await questionGenerator.generateQuestions(payload, { numQuestions: numQuestionsValidation.value });

        // Return response with file info
        res.json(createSuccessResponse(result, {
            filesProcessed: uploadedFiles.length,
            filesWithText: extractedTexts.length,
            totalTextLength,
            files: fileInfo
        }));
    } catch (error) {
        // Cleanup files in case of error
        if (uploadedFiles.length > 0) {
            await cleanupFiles(uploadedFiles.map(f => f.path));
        }

        console.error('API Error:', error);
        res.status(500).json(createErrorResponse(`Failed to generate questions from files: ${error.message}`, 500));
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
        console.error('API Error:', error);
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
        console.error('API Error:', error);
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
        console.error('API Error:', error);
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
                    num_questions: 'number (optional) - Number of questions to generate (default: 10, max: 50)'
                },
                example: {
                    text: 'The mitochondria is the powerhouse of the cell...',
                    num_questions: 5
                }
            },
            'POST /generate-from-files': {
                description: 'Generate quiz questions from uploaded files (PDF, DOC, DOCX, PPT, PPTX, TXT)',
                contentType: 'multipart/form-data',
                body: {
                    files: 'file[] (required) - One or more files to extract text from (max 10 files, 50MB each)',
                    num_questions: 'number (optional) - Number of questions to generate (default: 10, max: 50)',
                    page_start: 'number (optional) - Start page for PDF extraction (1-based)',
                    page_end: 'number (optional) - End page for PDF extraction (inclusive)'
                },
                supportedFormats: ['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX', 'TXT'],
                features: [
                    'Multi-file upload',
                    'Automatic text extraction',
                    'Combined question generation',
                    'Per-file status reporting'
                ]
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