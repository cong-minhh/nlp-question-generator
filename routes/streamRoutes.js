// const express = require('express');
// const router = express.Router();
// const StreamHandler = require('../utils/streamHandler');
// const { authenticate } = require('../middleware/auth');
// const { validateTextInput, validateNumQuestions } = require('../utils/fileUtils');

// /**
//  * Streaming Question Generation Routes
//  * Uses Server-Sent Events (SSE) for real-time streaming
//  */

// /**
//  * POST /stream/generate
//  * Stream questions as they are generated
//  * Body: { text: string, num_questions?: number, bloomLevel?: string, difficulty?: string }
//  */
// router.post('/generate', authenticate, async (req, res) => {
//     try {
//         const { text, num_questions, numQuestions, bloomLevel, difficulty, noCache } = req.body;
//         const requestedQuestions = num_questions || numQuestions || 10;

//         // Validate input
//         const textValidation = validateTextInput(text);
//         if (!textValidation.valid) {
//             // For streaming, we need to initialize stream first, then send error
//             StreamHandler.initializeStream(res);
//             StreamHandler.sendError(res, textValidation.error);
//             StreamHandler.sendComplete(res, { error: true });
//             return;
//         }

//         const questionsValidation = validateNumQuestions(requestedQuestions);
//         if (!questionsValidation.valid) {
//             StreamHandler.initializeStream(res);
//             StreamHandler.sendError(res, questionsValidation.error);
//             StreamHandler.sendComplete(res, { error: true });
//             return;
//         }

//         const generator = req.app.locals.questionGenerator;
//         if (!generator) {
//             StreamHandler.initializeStream(res);
//             StreamHandler.sendError(res, 'Question generator not initialized');
//             StreamHandler.sendComplete(res, { error: true });
//             return;
//         }

//         // Build options
//         const options = {
//             numQuestions: requestedQuestions,
//             noCache: noCache === true
//         };

//         if (bloomLevel) {
//             options.bloomLevel = bloomLevel;
//         }

//         if (difficulty) {
//             options.difficulty = difficulty;
//         }

//         // Check if parallel processing will be used
//         const numQuestions = requestedQuestions;
//         const useParallel = numQuestions >= 20;

//         if (useParallel) {
//             // Use parallel generation with progress streaming
//             StreamHandler.initializeStream(res);
//             StreamHandler.sendProgress(res, `Using parallel processing for ${numQuestions} questions...`, 0);

//             try {
//                 const result = await generator.generateQuestionsWithProgress(
//                     textValidation.text,
//                     options,
//                     (progress) => {
//                         if (progress.type === 'chunk_complete') {
//                             // Stream questions from completed chunk
//                             if (progress.questions) {
//                                 progress.questions.forEach((q, idx) => {
//                                     StreamHandler.sendQuestion(res, q, idx + 1, numQuestions);
//                                 });
//                             }
//                             StreamHandler.sendProgress(
//                                 res,
//                                 `Completed chunk ${progress.completedChunks}/${progress.totalChunks}`,
//                                 progress.progress
//                             );
//                         }
//                     }
//                 );

//                 // Send metadata and complete
//                 if (result.metadata) {
//                     StreamHandler.sendMetadata(res, result.metadata);
//                 }
//                 StreamHandler.sendComplete(res, {
//                     totalQuestions: result.questions.length,
//                     parallel: true
//                 });
//             } catch (error) {
//                 StreamHandler.sendError(res, error.message);
//                 StreamHandler.sendComplete(res, { error: true });
//             }
//         } else {
//             // Regular streaming for small batches
//             await StreamHandler.streamGeneration(
//                 res,
//                 async () => {
//                     return await generator.generateQuestions(textValidation.text, options);
//                 },
//                 options
//             );
//         }

//     } catch (error) {
//         console.error('Stream generation error:', error);
        
//         // If stream not started, send error response
//         if (!res.headersSent) {
//             StreamHandler.initializeStream(res);
//         }
        
//         StreamHandler.sendError(res, error.message);
//         StreamHandler.sendComplete(res, { error: true });
//     }
// });

// /**
//  * POST /stream/generate-from-files
//  * Stream questions from uploaded files
//  */
// router.post('/generate-from-files', authenticate, async (req, res) => {
//     try {
//         const { filePaths, num_questions, numQuestions, bloomLevel, difficulty } = req.body;
//         const requestedQuestions = num_questions || numQuestions || 10;

//         if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
//             StreamHandler.initializeStream(res);
//             StreamHandler.sendError(res, 'No file paths provided');
//             StreamHandler.sendComplete(res, { error: true });
//             return;
//         }

//         const generator = req.app.locals.questionGenerator;
//         if (!generator) {
//             StreamHandler.initializeStream(res);
//             StreamHandler.sendError(res, 'Question generator not initialized');
//             StreamHandler.sendComplete(res, { error: true });
//             return;
//         }

//         // Build options
//         const options = {
//             numQuestions: requestedQuestions
//         };

//         if (bloomLevel) {
//             options.bloomLevel = bloomLevel;
//         }

//         if (difficulty) {
//             options.difficulty = difficulty;
//         }

//         // Initialize stream
//         StreamHandler.initializeStream(res);
//         StreamHandler.sendProgress(res, 'Extracting text from files...', 10);

//         // Stream the generation
//         await StreamHandler.streamGeneration(
//             res,
//             async () => {
//                 return await generator.generateFromFiles(filePaths, options);
//             },
//             options
//         );

//     } catch (error) {
//         console.error('Stream file generation error:', error);
        
//         if (!res.headersSent) {
//             StreamHandler.initializeStream(res);
//         }
        
//         StreamHandler.sendError(res, error.message);
//         StreamHandler.sendComplete(res, { error: true });
//     }
// });

// /**
//  * GET /stream/test
//  * Test streaming endpoint with mock data
//  */
// router.get('/test', (req, res) => {
//     const numQuestions = parseInt(req.query.num) || 5;
//     StreamHandler.mockStream(res, numQuestions);
// });

// /**
//  * GET /stream/health
//  * Check if streaming is available
//  */
// router.get('/health', (req, res) => {
//     res.json({
//         success: true,
//         streaming: true,
//         message: 'Streaming endpoints are available'
//     });
// });

// module.exports = router;
