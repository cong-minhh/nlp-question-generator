// /**
//  * Server-Sent Events (SSE) Stream Handler
//  * Provides real-time streaming of generated questions
//  */
// class StreamHandler {
//     /**
//      * Initialize SSE response
//      * @param {Object} res - Express response object
//      */
//     static initializeStream(res) {
//         // Set SSE headers
//         res.setHeader('Content-Type', 'text/event-stream');
//         res.setHeader('Cache-Control', 'no-cache');
//         res.setHeader('Connection', 'keep-alive');
//         res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        
//         // Send initial connection message
//         this.sendEvent(res, 'connected', { message: 'Stream connected' });
        
//         return res;
//     }

//     /**
//      * Send SSE event
//      * @param {Object} res - Express response object
//      * @param {string} event - Event name
//      * @param {Object} data - Event data
//      */
//     static sendEvent(res, event, data) {
//         if (res.writableEnded) {
//             return false;
//         }

//         try {
//             res.write(`event: ${event}\n`);
//             res.write(`data: ${JSON.stringify(data)}\n\n`);
//             return true;
//         } catch (error) {
//             console.error('Stream write error:', error.message);
//             return false;
//         }
//     }

//     /**
//      * Send question event
//      * @param {Object} res - Express response object
//      * @param {Object} question - Question object
//      * @param {number} index - Question index
//      * @param {number} total - Total questions
//      */
//     static sendQuestion(res, question, index, total) {
//         return this.sendEvent(res, 'question', {
//             question,
//             index,
//             total,
//             progress: Math.round((index / total) * 100)
//         });
//     }

//     /**
//      * Send progress event
//      * @param {Object} res - Express response object
//      * @param {string} message - Progress message
//      * @param {number} progress - Progress percentage (0-100)
//      */
//     static sendProgress(res, message, progress = 0) {
//         return this.sendEvent(res, 'progress', {
//             message,
//             progress
//         });
//     }

//     /**
//      * Send error event
//      * @param {Object} res - Express response object
//      * @param {string} error - Error message
//      */
//     static sendError(res, error) {
//         return this.sendEvent(res, 'error', {
//             error,
//             timestamp: new Date().toISOString()
//         });
//     }

//     /**
//      * Send completion event
//      * @param {Object} res - Express response object
//      * @param {Object} metadata - Completion metadata
//      */
//     static sendComplete(res, metadata = {}) {
//         this.sendEvent(res, 'complete', {
//             ...metadata,
//             timestamp: new Date().toISOString()
//         });
        
//         // End the stream
//         if (!res.writableEnded) {
//             res.end();
//         }
//     }

//     /**
//      * Send metadata event
//      * @param {Object} res - Express response object
//      * @param {Object} metadata - Metadata object
//      */
//     static sendMetadata(res, metadata) {
//         return this.sendEvent(res, 'metadata', metadata);
//     }

//     /**
//      * Handle client disconnect
//      * @param {Object} res - Express response object
//      * @param {Function} cleanup - Cleanup function
//      */
//     static onDisconnect(res, cleanup) {
//         res.on('close', () => {
//             console.log('Client disconnected from stream');
//             if (cleanup && typeof cleanup === 'function') {
//                 cleanup();
//             }
//         });
//     }

//     /**
//      * Create a streaming wrapper for question generation
//      * @param {Object} res - Express response object
//      * @param {Function} generateFn - Async function that generates questions
//      * @param {Object} options - Options
//      */
//     static async streamGeneration(res, generateFn, options = {}) {
//         const { numQuestions = 10 } = options;
        
//         try {
//             // Initialize stream
//             this.initializeStream(res);
            
//             // Send initial progress
//             this.sendProgress(res, 'Starting question generation...', 0);
            
//             // Handle client disconnect
//             let cancelled = false;
//             this.onDisconnect(res, () => {
//                 cancelled = true;
//             });
            
//             // Generate questions
//             const result = await generateFn();
            
//             if (cancelled) {
//                 return;
//             }
            
//             // Stream questions one by one
//             if (result.questions && Array.isArray(result.questions)) {
//                 for (let i = 0; i < result.questions.length; i++) {
//                     if (cancelled) break;
                    
//                     const question = result.questions[i];
//                     this.sendQuestion(res, question, i + 1, result.questions.length);
                    
//                     // Small delay for better UX
//                     await new Promise(resolve => setTimeout(resolve, 100));
//                 }
//             }
            
//             if (!cancelled) {
//                 // Send metadata
//                 if (result.metadata) {
//                     this.sendMetadata(res, result.metadata);
//                 }
                
//                 // Send completion
//                 this.sendComplete(res, {
//                     totalQuestions: result.questions?.length || 0,
//                     cached: result.cached || false
//                 });
//             }
            
//         } catch (error) {
//             console.error('Streaming error:', error);
//             this.sendError(res, error.message);
//             this.sendComplete(res, { error: true });
//         }
//     }

//     /**
//      * Create a mock streaming response for testing
//      * @param {Object} res - Express response object
//      * @param {number} numQuestions - Number of questions to mock
//      */
//     static async mockStream(res, numQuestions = 5) {
//         this.initializeStream(res);
        
//         for (let i = 1; i <= numQuestions; i++) {
//             await new Promise(resolve => setTimeout(resolve, 1000));
            
//             this.sendQuestion(res, {
//                 questiontext: `Sample question ${i}?`,
//                 optiona: 'Option A',
//                 optionb: 'Option B',
//                 optionc: 'Option C',
//                 optiond: 'Option D',
//                 correctanswer: 'A',
//                 difficulty: 'medium',
//                 rationale: 'This is a sample rationale.'
//             }, i, numQuestions);
//         }
        
//         this.sendComplete(res, { totalQuestions: numQuestions });
//     }
// }

// module.exports = StreamHandler;
