const crypto = require('crypto');
const AdmZip = require('adm-zip');
const path = require('path');

/**
 * Extract text and images from a PPTX file, with support for slide ranges.
 * 
 * @param {string} filePath - Path to the PPTX file
 * @param {Object} options - Options
 * @param {number} options.pageStart - Start slide (1-based)
 * @param {number} options.pageEnd - End slide (inclusive)
 * @returns {Promise<Object>} - { text: string, images: Array, pages: Array }
 */
async function processPptx(filePath, options = {}) {
    try {
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        const filename = path.basename(filePath);
        
        // 1. Map slides to their XML files
        // Slides are typically named ppt/slides/slide1.xml, slide2.xml etc.
        // We need to sort them numerically to ensure correct order
        const slideEntries = zipEntries
            .filter(entry => entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
            .sort((a, b) => {
                const numA = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1]);
                const numB = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1]);
                return numA - numB;
            });

        const totalSlides = slideEntries.length;
        const startSlide = options.pageStart || 1;
        const endSlide = options.pageEnd || totalSlides;

        console.log(`PPTX Extraction: Found ${totalSlides} slides. Requesting ${startSlide}-${endSlide}.`);

        let extractedText = '';
        const extractedImages = [];
        const seenHashes = new Set();
        let duplicateCount = 0;
        let smallCount = 0;
        const structuredPages = []; 

        // 2. Iterate through requested slides
        for (let i = 0; i < totalSlides; i++) {
            const slideNum = i + 1;
            if (slideNum < startSlide || slideNum > endSlide) continue;

            const slideEntry = slideEntries[i];
            const slideContent = slideEntry.getData().toString('utf8');

            // --- Extract Text ---
            // Remove all XML tags <...>
            // This is a naive but fast method for "just get the text"
            // More robust would be to look for <a:t> tags which contain the actual text in DrawingML
            
            // Regex to find text inside <a:t>...</a:t> (standard PowerPoint text tag)
            const textMatches = slideContent.match(/<a:t>(.*?)<\/a:t>/g);
            let slideText = '';
            
            if (textMatches) {
                slideText = textMatches
                    .map(tag => tag.replace(/<\/?a:t>/g, ''))
                    .join(' ')
                    .replace(/\s+/g, ' ') // Collapse whitespace
                    .trim();
            } else {
                // Fallback: Strip all tags if <a:t> not found (rare)
                slideText = slideContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }

            extractedText += `--- Slide ${slideNum} ---\n${slideText}\n\n`;

            // --- Extract Images ---
            const relsEntryName = `ppt/slides/_rels/${path.basename(slideEntry.entryName)}.rels`;
            const relsEntry = zip.getEntry(relsEntryName);
            const slideImages = [];

            if (relsEntry) {
                const relsContent = relsEntry.getData().toString('utf8');
                // Find relationships of type image
                // Format: <Relationship Id="rId2" Type=".../image" Target="../media/image1.png" />
                // Note: Target might be relative like "../media/image1.jpeg"
                
                const imageRels = [];
                // Regex to capture Target of images. 
                // We assume Type contains "image".
                const relRegex = /<Relationship[^>]*?Type="[^"]*?image"[^>]*?Target="([^"]*?)"[^>]*?\/?>/g;
                let match;
                while ((match = relRegex.exec(relsContent)) !== null) {
                    imageRels.push(match[1]);
                }

                for (const target of imageRels) {
                    // Resolve path. Usually target is "../media/imageX.png"
                    // We need to normalize it to the zip entry path "ppt/media/imageX.png"
                    const normalizedTarget = target.replace('../', 'ppt/');
                    
                    const imageEntry = zip.getEntry(normalizedTarget);
                    if (imageEntry) {
                        const buffer = imageEntry.getData();
                        
                        // FILTER 1: Size Check (ignore < 3KB, usually icons/bullets)
                        if (buffer.length < 3072) {
                            smallCount++;
                            continue;
                        }

                        // FILTER 2: Deduplication (MD5 Hash)
                        const hash = crypto.createHash('md5').update(buffer).digest('hex');
                        if (seenHashes.has(hash)) {
                            duplicateCount++;
                            continue;
                        }
                        seenHashes.add(hash);

                        const ext = path.extname(normalizedTarget).toLowerCase();
                        let mimeType = 'image/jpeg';
                        if (ext === '.png') mimeType = 'image/png';
                        else if (ext === '.gif') mimeType = 'image/gif';
                        else if (ext === '.bmp') mimeType = 'image/bmp';
                        else if (ext === '.webp') mimeType = 'image/webp';

                        slideImages.push({
                            type: 'base64',
                            mediaType: mimeType,
                            data: buffer.toString('base64'),
                            source: `${filename} - Slide ${slideNum} (${path.basename(normalizedTarget)})`
                        });
                    } else {
                        console.warn(`Warning: Image target ${normalizedTarget} not found in zip.`);
                    }
                }
            }
            // --- Store structured page data ---
            structuredPages.push({
                page: slideNum,
                text: slideText,
                images: slideImages // These are the images for JUST this slide
            });

            // Add to global lists
            extractedImages.push(...slideImages);
        }

        console.log(`PPTX Extraction Complete: ${extractedText.length} chars, ${extractedImages.length} images.`);
        console.log(`Optimization: Skipped ${duplicateCount} duplicates and ${smallCount} tiny images.`);
        return {
            text: extractedText,
            images: extractedImages,
            pages: structuredPages
        };

    } catch (error) {
        console.error('Error extracting from PPTX:', error);
        throw error;
    }
}

module.exports = {
    processPptx
};
