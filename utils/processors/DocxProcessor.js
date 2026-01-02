const mammoth = require('mammoth');
const AdmZip = require('adm-zip');
const path = require('path');

/**
 * Extract text and images from a DOCX file
 * @param {string} filePath - Path to the DOCX file
 * @returns {Promise<Object>} - { text: string, images: Array, pages: Array }
 */
async function processDocx(filePath) {
    try {
        const filename = path.basename(filePath);
        console.log(`Processing DOCX: ${filename}`);

        // 1. Extract Text using Mammoth (best for preserving structure/readability)
        const textResult = await mammoth.extractRawText({ path: filePath });
        const text = textResult.value;

        // 2. Extract Images using AdmZip (DOCX is a ZIP)
        // Images are stored in word/media/
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        const images = [];

        for (const entry of zipEntries) {
            // Check for media files in word/media/
            if (entry.entryName.match(/word\/media\/.*\.(png|jpeg|jpg|gif|bmp|webp)$/i)) {
                
                const ext = path.extname(entry.entryName).toLowerCase();
                let mimeType = 'image/jpeg';
                switch (ext) {
                    case '.png': mimeType = 'image/png'; break;
                    case '.webp': mimeType = 'image/webp'; break;
                    case '.gif': mimeType = 'image/gif'; break;
                    case '.bmp': mimeType = 'image/bmp'; break;
                    case '.jpg': 
                    case '.jpeg': mimeType = 'image/jpeg'; break;
                    default: continue; 
                }

                const buffer = entry.getData();
                
                images.push({
                    type: 'base64',
                    mediaType: mimeType,
                    data: buffer.toString('base64'),
                    source: `${filename} - ${path.basename(entry.entryName)}`
                });
            }
        }

        console.log(`DOCX Extraction: ${text.length} chars, ${images.length} images.`);
        
        return {
            text,
            images,
            pages: [{
                page: 1,
                text: text,
                images: images
            }]
        };

    } catch (error) {
        console.error('Error processing DOCX:', error);
        throw new Error(`Failed to process DOCX ${path.basename(filePath)}: ${error.message}`);
    }
}

module.exports = {
    processDocx
};
