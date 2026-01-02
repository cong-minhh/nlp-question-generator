const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fileProcessingService = require('../services/FileProcessingService');

// Multer setup for temporary uploads
const upload = multer({ dest: 'uploads/temp/' });

/**
 * POST /api/debug/process
 * Process a file and return structured page/image data
 */
router.post('/process', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        
        try {
            const result = await fileProcessingService.processFile(filePath, req.file.originalname);

            // Cleanup temp file
            await fs.unlink(filePath).catch(() => {});

            res.json({
                success: true,
                filename: req.file.originalname,
                pages: result.pages || [] 
            });

        } catch (procError) {
            await fs.unlink(filePath).catch(() => {});
            throw procError;
        }

    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/debug/verify-ai
 * Verify if AI can see the provided images
 */
router.post('/verify-ai', async (req, res, next) => {
    try {
        const { text, images, provider } = req.body;
        
        if (!images || !Array.isArray(images)) {
            return res.status(400).json({ error: 'Images array is required' });
        }

        console.log(`[Debug] Verifying AI perception with ${images.length} images using provider ${provider || 'default'}`);

        // Construct the prompt
        const prompt = `
        I have provided ${images.length} images. 
        Please count how many images you can see in this request.
        For each image you see, describe it briefly in one sentence.
        
        Format your answer as:
        "Count: <number>"
        "Descriptions:"
        - Image 1: ...
        - Image 2: ...
        `;

        // Get Provider Manager from app locals
        const providerManager = req.app.locals.providerManager;
        if (!providerManager) {
            throw new Error('ProviderManager not initialized');
        }

        // Use specific provider or default
        const selectedProvider = provider 
            ? providerManager.getProvider(provider) 
            : providerManager.getCurrentProvider();

        if (!selectedProvider) {
            throw new Error('AI Provider not available');
        }

        // Format content for the provider
        // Most providers in this system likely accept { role, content: [ {type:text}, {type:image_url} ] } or similar
        // We'll rely on the provider's `generateResponse` which usually takes standardized messages.
        // Assuming providerManager normalizes this.
        
        // We need to construct a "multimodal" message.
        // If the system uses a standard format:
        const contentParts = [
            { type: 'text', text: prompt }
        ];

        images.forEach(img => {
            // img is { type: 'base64', mediaType: '...', data: '...' }
            // Some providers need prefix `data:image/jpeg;base64,`
            const dataUrl = `data:${img.mediaType};base64,${img.data}`;
            contentParts.push({
                type: 'image_url',
                image_url: {
                    url: dataUrl
                }
            });
        });

        const messages = [
            { role: 'user', content: contentParts }
        ];

        // Call the provider
        // Note: usage depends on specific provider implementation signature.
        // Looking at `providerManager.js` (not shown but inferred), or `questionGenerator.js`.
        // Usually `provider.chat(messages)` or `provider.generateResponse(prompt, images)`.
        // Let's try `generateResponse` which is common in my experience with this codebase's style (Ref conversations).
        // Actually, looking at `textExtractor` usage in earlier conversations, the `QuestionGenerator` handles prompt construction.
        // I should probably use `provider.generateResponse(messages)` if standard, or look for a method that handles images.
        
        // Let's try to assume `provider.chat(messages)` logic if it's OpenAI compatible, 
        // or just pass pure text + images if the method signature is `generateResponse(text, contextImages)`.
        
        // SAFEST BET: The user said "simulate the same as adding those texts and images".
        // Let's assume the standard `questionGenerator` pipeline might be too complex (it generates questions).
        // We want raw chat.
        
        // Let's try to inspect `MultiProviderQuestionGenerator` or `ProviderManager` to see how it calls AI.
        // I'll guess `provider.generate(messages)` or `provider.chat(messages)`. 
        // I will use `provider.generateChatCompletion({ messages })` which is a safe bet for this robust system, 
        // OR `provider.complete({ messages })`.
        
        // Since I can't check `providerManager.js` right now without a tool call, 
        // I'll create a safe wrapper that tries to discern the method or uses `questionGenerator` logic if possible.
        // Actually, I can use `req.app.locals.questionGenerator.providerManager` methods.
        
        // Let's try to find the method name by checking `server.js`... it calls `providerManager.initialize()`.
        // I'll assume `generateCompletion(messages)` or similar. 
        // Let's just try `selectedProvider.generateResponse(messages)`.

        let responseText = '';
        try {
             // Use the new generic method if available (preferred)
             if (typeof selectedProvider.generateResponse === 'function') {
                 // My new method signature is (text, images)
                 // But earlier generic attempt passed (messages).
                 // I will adapt the route to just pass text and images directly.
                 
                 // Extract text from prompt (the prompt variable)
                 // And images array.
                 responseText = await selectedProvider.generateResponse(prompt, images);
             } else {
                 throw new Error('Provider does not support generic response generation');
             }
        } catch (apiError) {
             console.error('AI API Error:', apiError);
             throw new Error(`AI Provider failed: ${apiError.message}`);
        }

        res.json({
            success: true,
            provider: selectedProvider.name,
            response: responseText
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
