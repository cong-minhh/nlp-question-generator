const fs = require('fs').promises;
const path = require('path');
const officeParser = require('officeparser'); // Keep for generic fallback

// Unified Processors
const { processPdf } = require('../utils/processors/PdfProcessor');
const { processPptx } = require('../utils/processors/PptxProcessor');
const { processDocx } = require('../utils/processors/DocxProcessor');

/**
 * Extract text (and ignore images for backward compat/legacy calls)
 * Note: New code should prefer using specific processors directly if it wants images.
 * This function persists for simple "just give me text" calls.
 */
async function extractTextFromFile(filePath, originalName, options = {}) {
    const ext = path.extname(originalName).toLowerCase();
    
    console.log(`Extracting text from ${originalName} (${ext})`);
    
    try {
        let result = { text: '', images: [] };

        switch (ext) {
            case '.pdf':
                result = await processPdf(filePath, options);
                return result.text;
            
            case '.docx':
                result = await processDocx(filePath);
                return result.text;
            
            case '.pptx':
                result = await processPptx(filePath, options);
                return result.text;

            case '.txt':
                return await fs.readFile(filePath, 'utf-8');
            
            case '.doc':
            case '.ppt':
            default:
                // Fallback for older formats or unsupported types
                return await officeParser.parseOfficeAsync(filePath);
        }
    } catch (error) {
        throw new Error(`Failed to extract text from ${originalName}: ${error.message}`);
    }
}


/**
 * Extract base64 image data from an image file
 */
async function extractImageFromFile(filePath) {
    try {
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'image/jpeg';
        
        switch (ext) {
            case '.png': mimeType = 'image/png'; break;
            case '.webp': mimeType = 'image/webp'; break;
            case '.gif': mimeType = 'image/gif'; break;
            // default jpeg
        }
        
        const dataBuffer = await fs.readFile(filePath);
        const base64Data = dataBuffer.toString('base64');
        
        return {
            type: 'base64',
            mediaType: mimeType,
            data: base64Data
        };
    } catch (error) {
        console.error('Error reading image file:', error);
        throw new Error(`Failed to read image file: ${error.message}`);
    }
}

/**
 * Process multiple files and extract text and images
 * Refactored to use Unified Processors.
 */
async function processFiles(files, options = {}) {
    const extractedTexts = [];
    const extractedImages = [];
    const fileInfo = [];

    for (const file of files) {
        try {
            console.log(`Processing: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
            const ext = path.extname(file.originalname).toLowerCase();
            
            // Check if it's an image file
            if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
                const imageData = await extractImageFromFile(file.path);
                
                extractedImages.push({
                    ...imageData,
                    source: file.originalname
                });
                
                fileInfo.push({
                    name: file.originalname,
                    size: file.size,
                    type: 'image',
                    status: 'success'
                });
                console.log(`✓ Validated image: ${file.originalname}`);
                
            } else {
                // Document Processing
                let text = '';
                let images = [];
                let processorName = 'legacy';

                try {
                    if (ext === '.pdf') {
                        const result = await processPdf(file.path, options);
                        text = result.text;
                        images = result.images;
                        processorName = 'PDF';
                    } else if (ext === '.pptx') {
                        const result = await processPptx(file.path, options);
                        text = result.text;
                        images = result.images;
                        processorName = 'PPTX';
                    } else if (ext === '.docx') {
                        const result = await processDocx(file.path);
                        text = result.text;
                        images = result.images;
                        processorName = 'DOCX';
                    } else if (ext === '.txt') {
                        text = await fs.readFile(file.path, 'utf-8');
                        processorName = 'TXT';
                    } else {
                        // Fallback
                         text = await officeParser.parseOfficeAsync(file.path);
                         processorName = 'Fallback';
                    }

                    // Collect Images
                    if (images && images.length > 0) {
                        extractedImages.push(...images);
                        console.log(`✓ Extracted ${images.length} images from ${processorName}: ${file.originalname}`);
                    }

                    // Collect Text
                    if (text && text.trim().length > 0) {
                        extractedTexts.push(text);
                        fileInfo.push({
                            name: file.originalname,
                            size: file.size,
                            textLength: text.length,
                            type: 'text',
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

                } catch (docErr) {
                     console.error(`Failed to process document ${file.originalname}:`, docErr.message);
                     throw docErr; // Re-throw to catch block below
                }
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

    return {
        extractedTexts,
        extractedImages,
        fileInfo,
        combinedText: extractedTexts.join('\n\n'),
        totalTextLength: extractedTexts.reduce((sum, text) => sum + text.length, 0)
    };
}

module.exports = {
    extractTextFromFile, // Exported for backward compatibility if used elsewhere
    processFiles
};