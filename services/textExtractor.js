const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const officeParser = require('officeparser');

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
 * Extract base64 image data from an image file
 * @param {string} filePath - Path to the image file
 * @returns {Promise<Object>} - Image data object
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
 * @param {Array} files - Array of uploaded file objects
 * @returns {Promise<Object>} - Object with extracted texts, images, and file information
 */
async function processFiles(files) {
    const extractedTexts = [];
    const extractedImages = [];
    const fileInfo = [];

    for (const file of files) {
        try {
            console.log(`Processing: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
            const ext = path.extname(file.originalname).toLowerCase();
            
            // Check if it's an image
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
                // Treat as text document
                const text = await extractTextFromFile(file.path, file.originalname);
                
                // If it's a PDF, also try to extract images
                if (ext === '.pdf') {
                    try {
                        const { extractImagesFromPDF } = require('../utils/pdfImageExtractor');
                        const pdfImages = await extractImagesFromPDF(file.path);
                        if (pdfImages.length > 0) {
                            extractedImages.push(...pdfImages);
                            console.log(`✓ Extracted ${pdfImages.length} images from PDF: ${file.originalname}`);
                        }
                    } catch (imgError) {
                        console.warn(`Warning: Failed to extract images from PDF ${file.originalname}:`, imgError.message);
                    }
                }
                
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
    extractTextFromFile,
    processFiles
};