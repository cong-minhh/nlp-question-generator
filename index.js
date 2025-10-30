const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const officeParser = require('officeparser');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
        files: 10 // Max 10 files at once
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
            'application/msword', // doc
            'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
            'application/vnd.ms-powerpoint', // ppt
            'text/plain'
        ];
        
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not supported: ${file.originalname}. Allowed: PDF, DOC, DOCX, PPT, PPTX, TXT`));
        }
    }
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Extract text from a PDF file
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromPDF(filePath) {
    try {
        const dataBuffer = await fs.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
}

/**
 * Extract text from a DOCX file
 * @param {string} filePath - Path to the DOCX file
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromDOCX(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (error) {
        console.error('Error extracting text from DOCX:', error);
        throw new Error(`Failed to extract text from DOCX: ${error.message}`);
    }
}

/**
 * Extract text from PPTX, DOC, or other Office files
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromOffice(filePath) {
    try {
        const text = await officeParser.parseOfficeAsync(filePath);
        return text;
    } catch (error) {
        console.error('Error extracting text from Office file:', error);
        throw new Error(`Failed to extract text from Office file: ${error.message}`);
    }
}

/**
 * Extract text from a plain text file
 * @param {string} filePath - Path to the text file
 * @returns {Promise<string>} - File contents
 */
async function extractTextFromTXT(filePath) {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        console.error('Error reading text file:', error);
        throw new Error(`Failed to read text file: ${error.message}`);
    }
}

/**
 * Extract text from any supported file format
 * @param {string} filePath - Path to the file
 * @param {string} originalName - Original filename
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromFile(filePath, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    
    console.log(`Extracting text from ${originalName} (${ext})`);
    
    try {
        switch (ext) {
            case '.pdf':
                return await extractTextFromPDF(filePath);
            
            case '.docx':
                return await extractTextFromDOCX(filePath);
            
            case '.doc':
            case '.pptx':
            case '.ppt':
                return await extractTextFromOffice(filePath);
            
            case '.txt':
                return await extractTextFromTXT(filePath);
            
            default:
                // Try office parser as fallback
                return await extractTextFromOffice(filePath);
        }
    } catch (error) {
        throw new Error(`Failed to extract text from ${originalName}: ${error.message}`);
    }
}

/**
 * Clean up uploaded files
 * @param {Array} filePaths - Array of file paths to delete
 */
async function cleanupFiles(filePaths) {
    for (const filePath of filePaths) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            // Ignore ENOENT errors (file already deleted)
            if (error.code !== 'ENOENT') {
                console.error(`Failed to delete file ${filePath}:`, error.message);
            }
        }
    }
}

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate quiz questions from text using Gemini AI with retry logic
 * @param {string} text - The input text to generate questions from
 * @param {number} numQuestions - Number of questions to generate (default: 10)
 * @returns {Promise<Object>} - JSON response with questions array
 */
async function generateQuestions(text, numQuestions = 10) {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Use gemini-2.0-flash-exp model (free tier)
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const prompt = `You are an expert educator creating multiple choice quiz questions. 

Based on the following text, generate exactly ${numQuestions} multiple choice questions.

TEXT:
${text}

REQUIREMENTS:
- Generate exactly ${numQuestions} questions
- Each question must have 4 options (A, B, C, D)
- Mark the correct answer as A, B, C, or D
- Assign difficulty level as "easy", "medium", or "hard"
- Questions should test understanding, not just recall
- Options should be plausible and well-distributed

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks, just raw JSON):
{
  "questions": [
    {
      "questiontext": "What is...?",
      "optiona": "First option",
      "optionb": "Second option",
      "optionc": "Third option",
      "optiond": "Fourth option",
      "correctanswer": "A",
      "difficulty": "medium"
    }
  ]
}`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const generatedText = response.text();

            // Clean the response - remove markdown code blocks if present
            let cleanedText = generatedText.trim();
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
            }

            // Parse JSON response
            const parsedResponse = JSON.parse(cleanedText);

            // Validate response structure
            if (!parsedResponse.questions || !Array.isArray(parsedResponse.questions)) {
                throw new Error('Invalid response structure: missing questions array');
            }

            // Validate each question has required fields
            parsedResponse.questions.forEach((q, index) => {
                const requiredFields = ['questiontext', 'optiona', 'optionb', 'optionc', 'optiond', 'correctanswer', 'difficulty'];
                requiredFields.forEach(field => {
                    if (!q[field]) {
                        throw new Error(`Question ${index + 1} missing required field: ${field}`);
                    }
                });

                // Validate correctanswer is A, B, C, or D
                if (!['A', 'B', 'C', 'D'].includes(q.correctanswer.toUpperCase())) {
                    throw new Error(`Question ${index + 1} has invalid correct answer: ${q.correctanswer}`);
                }

                // Normalize correctanswer to uppercase
                q.correctanswer = q.correctanswer.toUpperCase();

                // Validate difficulty
                if (!['easy', 'medium', 'hard'].includes(q.difficulty.toLowerCase())) {
                    q.difficulty = 'medium'; // Default to medium if invalid
                }
                q.difficulty = q.difficulty.toLowerCase();
            });

            // Success! Return the questions
            return parsedResponse;
            
        } catch (error) {
            const isLastAttempt = attempt === maxRetries;
            
            // Check if it's a 503 error (service overloaded)
            if (error.message && error.message.includes('503')) {
                const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                console.log(`Attempt ${attempt}/${maxRetries} failed: Service overloaded. ${isLastAttempt ? 'No more retries.' : `Retrying in ${delay/1000}s...`}`);
                
                if (!isLastAttempt) {
                    await sleep(delay);
                    continue; // Retry
                }
            }
            
            // For other errors or last attempt, throw
            console.error('Error generating questions:', error.message);
            throw error;
        }
    }
    
    // Should never reach here, but just in case
    throw new Error('Failed to generate questions after all retries');
}

/**
 * POST endpoint to generate questions
 * Body: { text: string, num_questions?: number }
 */
app.post('/generate', async (req, res) => {
    try {
        const { text, num_questions = 10 } = req.body;

        // Validate input
        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                error: 'Invalid input: text field is required and must be a string'
            });
        }

        if (text.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid input: text cannot be empty'
            });
        }

        const numQuestions = parseInt(num_questions, 10);
        if (isNaN(numQuestions) || numQuestions < 1 || numQuestions > 50) {
            return res.status(400).json({
                error: 'Invalid input: num_questions must be between 1 and 50'
            });
        }

        // Generate questions
        const result = await generateQuestions(text, numQuestions);

        // Return response
        res.json(result);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            error: 'Failed to generate questions',
            message: error.message
        });
    }
});

/**
 * POST endpoint to generate questions from uploaded files
 * Body: files (multipart/form-data), num_questions (optional)
 */
app.post('/generate-from-files', upload.array('files', 10), async (req, res) => {
    const uploadedFiles = req.files || [];
    
    try {
        // Validate files were uploaded
        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json({
                error: 'No files uploaded',
                message: 'Please upload at least one file (PDF, DOC, DOCX, PPT, PPTX, or TXT)'
            });
        }

        const numQuestions = parseInt(req.body.num_questions || 10, 10);
        if (isNaN(numQuestions) || numQuestions < 1 || numQuestions > 50) {
            await cleanupFiles(uploadedFiles.map(f => f.path));
            return res.status(400).json({
                error: 'Invalid input: num_questions must be between 1 and 50'
            });
        }

        console.log(`Processing ${uploadedFiles.length} file(s)...`);

        // Extract text from all files
        const extractedTexts = [];
        const fileInfo = [];

        for (const file of uploadedFiles) {
            try {
                console.log(`Processing: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
                const text = await extractTextFromFile(file.path, file.originalname);
                
                if (text && text.trim().length > 0) {
                    extractedTexts.push(text);
                    fileInfo.push({
                        name: file.originalname,
                        size: file.size,
                        textLength: text.length,
                        status: 'success'
                    });
                    console.log(`✓ Extracted ${text.length} characters from ${file.originalname}`);
                } else {
                    fileInfo.push({
                        name: file.originalname,
                        size: file.size,
                        status: 'warning',
                        message: 'No text extracted'
                    });
                    console.warn(`⚠ No text extracted from ${file.originalname}`);
                }
            } catch (error) {
                console.error(`✗ Error processing ${file.originalname}:`, error);
                fileInfo.push({
                    name: file.originalname,
                    size: file.size,
                    status: 'error',
                    message: error.message
                });
            }
        }

        // Cleanup uploaded files
        await cleanupFiles(uploadedFiles.map(f => f.path));

        // Check if we have any text
        if (extractedTexts.length === 0) {
            return res.status(400).json({
                error: 'No text extracted',
                message: 'Could not extract text from any of the uploaded files',
                files: fileInfo
            });
        }

        // Combine all extracted text
        const combinedText = extractedTexts.join('\n\n');
        console.log(`Total extracted text: ${combinedText.length} characters from ${extractedTexts.length} file(s)`);

        // Generate questions
        const result = await generateQuestions(combinedText, numQuestions);

        // Return response with file info
        res.json({
            ...result,
            metadata: {
                filesProcessed: uploadedFiles.length,
                filesWithText: extractedTexts.length,
                totalTextLength: combinedText.length,
                files: fileInfo
            }
        });
    } catch (error) {
        // Cleanup files in case of error
        if (uploadedFiles.length > 0) {
            await cleanupFiles(uploadedFiles.map(f => f.path));
        }
        
        console.error('API Error:', error);
        res.status(500).json({
            error: 'Failed to generate questions from files',
            message: error.message
        });
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'NLP Question Generator',
        version: '2.0.0',
        features: ['text-input', 'file-upload', 'multi-file']
    });
});

/**
 * Root endpoint with API documentation
 */
app.get('/', (req, res) => {
    res.json({
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
    });
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Start server
app.listen(PORT, () => {
    console.log(`NLP Question Generator API v2.0 running on port ${PORT}`);
    console.log(`API Key configured: ${process.env.GEMINI_API_KEY ? 'Yes' : 'No'}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  http://localhost:${PORT}/`);
    console.log(`  GET  http://localhost:${PORT}/health`);
    console.log(`  POST http://localhost:${PORT}/generate (text input)`);
    console.log(`  POST http://localhost:${PORT}/generate-from-files (file upload)`);
    console.log(`\nSupported file formats: PDF, DOC, DOCX, PPT, PPTX, TXT`);
});

module.exports = app;

