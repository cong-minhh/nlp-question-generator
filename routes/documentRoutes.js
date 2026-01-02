const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const documentStorage = require('../services/storage/DocumentStorage');
const { processPdf } = require('../utils/processors/PdfProcessor');
const { processDocx } = require('../utils/processors/DocxProcessor');
const { processPptx } = require('../utils/processors/PptxProcessor');

// Temp upload for multer before moving to storage
const upload = multer({ dest: 'uploads/temp/' });

/**
 * Helper to get processor by extension
 */
function getProcessor(ext) {
    switch (ext.toLowerCase()) {
        case '.pdf': return processPdf;
        case '.docx': return processDocx;
        case '.pptx': return processPptx;
        default: throw new Error(`Unsupported file type: ${ext}`);
    }
}

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
        const ext = path.extname(metadata.originalName).toLowerCase();
        const processor = getProcessor(ext);
        const result = await processor(metadata.path);

        // 3. Cache Extraction Result (Save to storage dir)
        // This avoids re-processing on generate
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
        const { docId, options } = req.body; // options might contain { includeSlides: [1,2], includeImages: [] }
        
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
            // Fallback: Re-process if cache missing
            const ext = path.extname(metadata.originalName).toLowerCase();
            extractionData = await getProcessor(ext)(metadata.path);
        }

        // 3. Filter Content
        const filter = options || {};
        const includeSlides = filter.includeSlides ? new Set(filter.includeSlides.map(Number)) : null;
        
        // Logic:
        // - If includeSlides is set, only take text/images from those slides.
        // - If includeImages is set, we might filter images further?
        // - Let's verify what the user wants. "Pick which slides and also which images".
        // - So we need detailed filtering.
        
        let filteredTextPromise = [];
        let filteredImages = [];

        if (extractionData.pages) {
            extractionData.pages.forEach(page => {
                // Initial check: Is the PAGE included?
                // If includeSlides is null/undefined, include ALL.
                if (includeSlides && !includeSlides.has(page.page)) {
                    return; // Skip this page completely
                }

                // Page is included. Add text.
                filteredTextPromise.push(`--- Page/Slide ${page.page} ---\n${page.text}`);

                // Now check images on this page.
                if (page.images) {
                    page.images.forEach(img => {
                         // Filter images?
                         // If options.includeImages is provided, check if this img identifier is in it.
                         // Current image object doesn't have a stable ID, just source/data.
                         // But we returned the whole structure in /inspect.
                         // Let's assume client sends back a list of "source" strings or we assume if the slide is picked, 
                         // we pick all images unless specified otherwise.
                         
                         // For MVP/robustness: If `options.includeImages` exists, strict check.
                         // If not, include all images of the included slides.
                         
                         if (filter.includeImages) {
                             // This might be tricky matching "source" string exactly if it changes or is long.
                             // But let's rely on the client sending back what we sent them.
                             // Optimization: Use a simpler ID mechanism in future, but `source` is unique enough for now.
                             if (filter.includeImages.includes(img.source)) {
                                 filteredImages.push(img);
                             }
                         } else {
                             // Default: Include all images for this selected slide
                             filteredImages.push(img);
                         }
                    });
                }
            });
        } else {
            // Fallback for unstructured data (shouldn't happen with new processors)
            filteredTextPromise.push(extractionData.text);
            filteredImages = extractionData.images;
        }

        const finalInput = {
            text: filteredTextPromise.join('\n\n'),
            images: filteredImages
        };

        console.log(`[Document] Generating for ${docId}: Using ${filteredImages.length} images and ${finalInput.text.length} chars of text.`);

        // 4. Generate Questions
        const providerManager = req.app.locals.providerManager;
        const generator = req.app.locals.questionGenerator || 
                          // Fallback if not directly exposed, create temp one or use provider direct?
                          // Ideally reusable service. Let's look at `server.js` to see how it's exposed.
                          // It seems `server.js` might not expose `questionGenerator` in locals explicitly or I missed it.
                          // But `routes/api.js` likely uses it.
                          // I'll check `req.app.get('questionGenerator')` or similar.
                          // Checking `server.js` file content from earlier...
                          // "const questionGenerator = new MultiProviderQuestionGenerator(providerManager);"
                          // It is exported? No. 
                          // But `apiRoutes` uses it. 
                          // I'll try `req.app.locals.questionGenerator` assuming I'll update server.js to expose it.
                           req.app.locals.questionGenerator;

        if (!generator) {
            throw new Error('QuestionGenerator service not available');
        }

        // Generate!
        const result = await generator.generateQuestions(finalInput, {
            ...options, // Pass through other options like numQuestions, difficulty
            docId: docId // log context
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
