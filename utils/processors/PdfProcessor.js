const fs = require('fs').promises;
const { PNG } = require('pngjs');
const pdfParse = require('pdf-parse'); // Fallback

/**
 * Convert PDF image object to PNG buffer
 * @param {Object} img - Image object from pdfjs
 * @returns {Promise<Buffer|null>}
 */
function convertToPng(img) {
    return new Promise((resolve) => {
        try {
            const width = img.width;
            const height = img.height;
            const png = new PNG({ width, height });
            
            // Handle different image kinds (1=GRAYSCALE, 2=RGB, 3=RGBA typically)
            if (img.data.length === width * height * 4) {
               // RGBA
               for (let i = 0; i < img.data.length; i++) png.data[i] = img.data[i];
            } else if (img.data.length === width * height * 3) {
               // RGB
               for (let i = 0, j = 0; i < width * height; i++) {
                   png.data[j++] = img.data[i * 3];     
                   png.data[j++] = img.data[i * 3 + 1]; 
                   png.data[j++] = img.data[i * 3 + 2]; 
                   png.data[j++] = 255;                 
               }
            } else if (img.data.length === width * height) {
                // Grayscale
                for (let i = 0, j = 0; i < width * height; i++) {
                    const val = img.data[i];
                    png.data[j++] = val; 
                    png.data[j++] = val; 
                    png.data[j++] = val; 
                    png.data[j++] = 255; 
                }
            } else {
                resolve(null);
                return;
            }
            
            const buffer = PNG.sync.write(png);
            resolve(buffer);
        } catch (e) {
            console.warn('PNG conversion error:', e.message);
            resolve(null);
        }
    });
}

/**
 * Process PDF file to extract text and images
 * @param {string} filePath - Path to PDF
 * @param {Object} [options] - Options (pageStart, pageEnd)
 * @returns {Promise<Object>} - { text: string, images: Array, pages: Array }
 */
async function processPdf(filePath, options = {}) {
    let pdfjsLib;
    try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjsLib = pdfjs;
    } catch (e) {
        console.warn('Failed to load pdfjs-dist via import, images will be skipped, text via fallback:', e.message);
        // Fallback for text only
        try {
            const dataBuffer = await fs.readFile(filePath);
            const data = await pdfParse(dataBuffer);
            return { text: data.text, images: [] };
        } catch (err) {
             throw new Error(`Failed to process PDF (fallback): ${err.message}`);
        }
    }

    try {
        const dataBuffer = await fs.readFile(filePath);
        const data = new Uint8Array(dataBuffer);

        const loadingTask = pdfjsLib.getDocument({
            data: data,
            disableFontFace: true,
            verbosity: 0
        });

        const doc = await loadingTask.promise;
        const startPage = options.pageStart || 1;
        const endPage = options.pageEnd || doc.numPages;

        console.log(`Processing PDF (Pages ${startPage}-${endPage} of ${doc.numPages})...`);

        let collectedText = [];
        let collectedImages = [];
        const seenImages = new Set();
        let totalPagesProcessed = 0;
        let lineFrequencies = new Map();

        for (let i = startPage; i <= Math.min(endPage, doc.numPages); i++) {
            const page = await doc.getPage(i);
            
            // --- Text Extraction ---
            const content = await page.getTextContent();
            // Simple join for now, similar to previous logic
            const items = content.items.map(item => item.str.trim()).filter(s => s.length > 0);
            
            // HEURISTIC: Collect frequency for header/footer detection later
            items.forEach(line => {
                lineFrequencies.set(line, (lineFrequencies.get(line) || 0) + 1);
            });

            collectedText.push({
                pageNumber: i,
                items: items
            });
            totalPagesProcessed++;

            // --- Image Extraction ---
            try {
                const ops = await page.getOperatorList();
                for (let j = 0; j < ops.fnArray.length; j++) {
                    const fn = ops.fnArray[j];
                    if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
                        const arg = ops.argsArray[j][0];
                        
                        // Local dedupe per page execution? Or global? 
                        // PDF images are XObjects and might be shared across pages.
                        // Let's use a composite key if we want to know *where* it is, 
                        // OR if we just want unique images.
                        // The previous logic used `seenImages.add(arg)`, `arg` is the name on the page (e.g. "Img1").
                        // Warning: "Img1" on Page 1 might be different from "Img1" on Page 2 in some PDFs, 
                        // but usually XObjects share names if they are the same resource.
                        // Ideally we check object reference.
                        // For simplicity, we'll assume uniqueness per file for now based on name,
                        // BUT if we want context (Page X), we shouldn't dedupe strictly if it appears on multiple pages?
                        // Let's keep strict deduping for now to save space, but maybe append page info?
                        // Actually, previous logic deduped gloablly. I'll stick to that.
                        
                        if (seenImages.has(arg)) continue;
                        seenImages.add(arg);

                        const img = await page.objs.get(arg);
                        if (img && img.data) {
                            const pngBuffer = await convertToPng(img);
                            if (pngBuffer) {
                                collectedImages.push({
                                    type: 'base64',
                                    mediaType: 'image/png',
                                    data: pngBuffer.toString('base64'),
                                    source: `Page ${i} - ${arg}`
                                });
                            }
                        }
                    }
                }
            } catch (imgErr) {
                // Ignore image extraction errors on specific page
            }
        }

        // --- Post-Processing Text (Header/Footer Removal) ---
        const IGNORE_THRESHOLD = Math.max(2, Math.ceil(totalPagesProcessed * 0.3));

        const cleanPages = [];
        const structuredPages = [];

        // Build structured page data
        for (const page of collectedText) {
            // Find images for this page
            // Note: collectedImages has `source` like "Page X - ImgY". 
            // We can match by checking if source starts with "Page {i} -"
            const pageImages = collectedImages.filter(img => img.source.startsWith(`Page ${page.pageNumber} -`));

            const cleanItems = page.items.filter(item => {
                if (lineFrequencies.get(item) >= IGNORE_THRESHOLD) return false; // Header/Footer
                if (/^\d+$/.test(item)) return false; // Page numbers
                if (item.length === 1 && !/[a-zA-Z0-9]/.test(item)) return false; // Junk
                return true;
            });
            
            const pageText = cleanItems.join(' ');

            if (cleanItems.length > 0 || pageImages.length > 0) {
                 if (cleanItems.length > 0) {
                     cleanPages.push(`--- Page ${page.pageNumber} ---\n${pageText}\n`);
                 }
                
                structuredPages.push({
                    page: page.pageNumber,
                    text: pageText,
                    images: pageImages
                });
            }
        }

        console.log(`PDF Extraction: ${cleanPages.join('').length} chars, ${collectedImages.length} images.`);

        return {
            text: cleanPages.join('\n'),
            images: collectedImages,
            pages: structuredPages
        };

    } catch (error) {
        console.error('Error processing PDF:', error);
        throw new Error(`Failed to process PDF: ${error.message}`);
    }
}

module.exports = { processPdf };
