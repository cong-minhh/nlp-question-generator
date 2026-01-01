const fs = require('fs').promises;
const path = require('path');
const { PNG } = require('pngjs');

/**
 * Extract images from a PDF file
 * @param {string} filePath - Path to PDF
 * @returns {Promise<Array>} - Array of { type: 'base64', mediaType: 'image/png', data: '...' }
 */
async function extractImagesFromPDF(filePath) {
    let pdfjsLib;
    try {
        // Dynamic import for ESM module
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjsLib = pdfjs;
    } catch (e) {
        console.warn('Failed to load pdfjs-dist via import:', e.message);
        return [];
    }

    if (!pdfjsLib) {
        return [];
    }

    try {
        const dataBuffer = await fs.readFile(filePath);
        const data = new Uint8Array(dataBuffer);

        // Load document
        const loadingTask = pdfjsLib.getDocument({
            data: data,
            disableFontFace: true,
            verbosity: 0
        });

        const doc = await loadingTask.promise;
        const images = [];
        const seenImages = new Set(); 

        console.log(`Scanning PDF for images (${doc.numPages} pages)...`);

        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const ops = await page.getOperatorList();
            
            for (let j = 0; j < ops.fnArray.length; j++) {
                const fn = ops.fnArray[j];
                
                // Identify image painting operators
                if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
                    const arg = ops.argsArray[j][0]; // Name of image
                    
                    if (seenImages.has(arg)) continue;
                    seenImages.add(arg);

                    try {
                        const img = await page.objs.get(arg);
                        if (img && img.data) {
                            // Convert raw image data to PNG
                            const pngBuffer = await convertToPng(img);
                            if (pngBuffer) {
                                images.push({
                                    type: 'base64',
                                    mediaType: 'image/png',
                                    data: pngBuffer.toString('base64'),
                                    source: `page_${i}_img_${arg}`
                                });
                                process.stdout.write('.'); // Progress dot
                            }
                        }
                    } catch (err) {
                        // Ignore specific image errors
                    }
                }
            }
        }
        
        console.log(`\nFound ${images.length} images in PDF`);
        return images;
    } catch (error) {
        console.error('Error parsing PDF for images:', error.message);
        return [];
    }
}

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
            // handle 8-bit gray, 24-bit RGB, 32-bit RGBA
            // pdfjs often gives Uint8Array
            
            // Basic support for RGB and RGBA
            let kind = img.kind || 0; 
            // kind: 1=GRAYSCALE, 2=RGB, 3=RGBA (approx mapping in earlier pdfjs versions, checking typical data length)
            
            const png = new PNG({ width, height });
            // png.data is a buffer of RGBA (4 bytes per pixel)
            
            if (img.data.length === width * height * 4) {
               // RGBA likely
               // Copy directly? img.data might be Uint8ClampedArray
               for (let i = 0; i < img.data.length; i++) {
                   png.data[i] = img.data[i];
               }
            } else if (img.data.length === width * height * 3) {
               // RGB
               for (let i = 0, j = 0; i < width * height; i++) {
                   png.data[j++] = img.data[i * 3];     // R
                   png.data[j++] = img.data[i * 3 + 1]; // G
                   png.data[j++] = img.data[i * 3 + 2]; // B
                   png.data[j++] = 255;                 // Alpha
               }
            } else if (img.data.length === width * height) {
                // Grayscale
                for (let i = 0, j = 0; i < width * height; i++) {
                    const val = img.data[i];
                    png.data[j++] = val; // R
                    png.data[j++] = val; // G
                    png.data[j++] = val; // B
                    png.data[j++] = 255; // Alpha
                }
            } else {
                // Unsupported format (e.g. CMYK or different bit depth)
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

module.exports = { extractImagesFromPDF };
