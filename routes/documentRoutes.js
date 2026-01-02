const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const documentStorage = require('../services/storage/DocumentStorage');
const fileProcessingService = require('../services/FileProcessingService');
const ContentFilter = require('../utils/ContentFilter');

// Temp upload for multer before moving to storage
const upload = multer({ dest: 'uploads/temp/' });

/**
 * POST /api/documents/inspect
 * Uploads a file and returns its structured content (slides/images).
 */
router.post('/inspect', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // 1. Save to Storage
        const docId = await documentStorage.save(req.file);
        const metadata = await documentStorage.get(docId);
        
        console.log(`[Document] Inspected new document: ${docId} (${metadata.originalName})`);

        // 2. Process File
        const result = await fileProcessingService.processFile(metadata.path, metadata.originalName);

        // 3. Cache Extraction Result
        const extractionPath = path.join(path.dirname(metadata.path), 'extraction.json');
        await fs.writeFile(extractionPath, JSON.stringify(result));

        // 4. Return Catalog
        res.json({
            success: true,
            docId: docId,
            filename: metadata.originalName,
            pages: result.pages || []
        });

    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/documents/generate
 * Generates questions based on selected content from a previously uploaded document.
 */
router.post('/generate', async (req, res, next) => {
    try {
        const { docId, options } = req.body; 
        
        if (!docId) return res.status(400).json({ error: 'docId is required' });

        // 1. Retrieve Document Info
        const metadata = await documentStorage.get(docId);
        
        // 2. Load Extraction Result
        const extractionPath = path.join(path.dirname(metadata.path), 'extraction.json');
        let extractionData;
        
        try {
            const data = await fs.readFile(extractionPath, 'utf8');
            extractionData = JSON.parse(data);
        } catch (e) {
            // Fallback: Re-process
            extractionData = await fileProcessingService.processFile(metadata.path, metadata.originalName);
        }

        // 3. Filter Content (Business Logic via Utility)
        const finalInput = ContentFilter.apply(extractionData, options || {});

        console.log(`[Document] Generating for ${docId}: Using ${finalInput.images.length} images and ${finalInput.text.length} chars of text.`);

        // 4. Generate Questions
        const generator = req.app.locals.questionGenerator;
        if (!generator) throw new Error('QuestionGenerator service not available');

        const result = await generator.generateQuestions(finalInput, {
            ...options,
            docId: docId
        });

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
