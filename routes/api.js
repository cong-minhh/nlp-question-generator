const express = require('express');
const upload = require('../config/upload');
const { processFiles } = require('../services/textExtractor');
const { cleanupFiles } = require('../utils/fileUtils');
const GeminiQuestionGenerator = require('../services/questionGenerator');
const {
    validateTextInput,
    validateNumQuestions,
    createErrorResponse,
    createSuccessResponse
} = require('../utils/fileUtils');

const router = express.Router();

// Initialize Gemini question generator
const questionGenerator = new GeminiQuestionGenerator();

/**
 * POST endpoint to generate questions
 * Body: { text: string, num_questions?: number }
 */
router.post('/generate', async (req, res) => {
    try {
        const { text, num_questions = 10 } = req.body;

        // Validate input
        const textValidation = validateTextInput(text);
        if (!textValidation.valid) {
            return res.status(400).json(createErrorResponse(textValidation.error, 400));
        }

        const numQuestionsValidation = validateNumQuestions(num_questions);
        if (!numQuestionsValidation.valid) {
            return res.status(400).json(createErrorResponse(numQuestionsValidation.error, 400));
        }

        // Generate questions
        const result = await questionGenerator.generateQuestions(text, numQuestionsValidation.value);

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
 */
router.post('/generate-from-files', upload.array('files', 10), async (req, res) => {
    const uploadedFiles = req.files || [];
    
    try {
        // Validate files were uploaded
        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json(createErrorResponse(
                'No files uploaded. Please upload at least one file (PDF, DOC, DOCX, PPT, PPTX, or TXT)',
                400
            ));
        }

        const numQuestionsValidation = validateNumQuestions(req.body.num_questions || 10);
        if (!numQuestionsValidation.valid) {
            await cleanupFiles(uploadedFiles.map(f => f.path));
            return res.status(400).json(createErrorResponse(numQuestionsValidation.error, 400));
        }

        console.log(`Processing ${uploadedFiles.length} file(s)...`);

        // Process files and extract text
        const { extractedTexts, fileInfo, combinedText, totalTextLength } = await processFiles(uploadedFiles);

        // Cleanup uploaded files
        await cleanupFiles(uploadedFiles.map(f => f.path));

        // Check if we have any text
        if (extractedTexts.length === 0) {
            return res.status(400).json(createErrorResponse(
                'No text extracted. Could not extract text from any of the uploaded files',
                400
            ));
        }

        console.log(`Total extracted text: ${combinedText.length} characters from ${extractedTexts.length} file(s)`);

        // Generate questions
        const result = await questionGenerator.generateQuestions(combinedText, numQuestionsValidation.value);

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
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.json(createSuccessResponse({ 
        status: 'healthy',
        service: 'NLP Question Generator',
        version: '2.0.0',
        features: ['text-input', 'file-upload', 'multi-file']
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
                    num_questions: 'number (optional) - Number of questions to generate (default: 10, max: 50)'
                },
                supportedFormats: ['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX', 'TXT'],
                features: [
                    'Multi-file upload',
                    'Automatic text extraction',
                    'Combined question generation',
                    'Per-file status reporting'
                ]
            },
            'GET /health': {
                description: 'Check service health and available features'
            }
        }
    }));
});

module.exports = router;