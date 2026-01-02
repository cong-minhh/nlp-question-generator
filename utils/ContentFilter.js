/**
 * Content Filter Utility
 * Handles logic for filtering structured document content based on user selection.
 */
class ContentFilter {
    /**
     * Filter extraction data based on options
     * @param {Object} extractionData - Result from FileProcessingService/UnifiedProcessor ({ text, images, pages })
     * @param {Object} options - Filter options ({ includeSlides: [], includeImages: [] })
     * @returns {Object} - { text: string, images: Array }
     */
    static apply(extractionData, options = {}) {
        const includeSlides = options.includeSlides ? new Set(options.includeSlides.map(Number)) : null;
        const includeImages = options.includeImages; // Array of strings (source IDs)

        // If no pages structure (legacy), return as is
        if (!extractionData.pages || !Array.isArray(extractionData.pages)) {
            return {
                text: extractionData.text || '',
                images: extractionData.images || []
            };
        }

        let filteredTextParts = [];
        let filteredImages = [];

        extractionData.pages.forEach(page => {
            // 1. Check Slide/Page Inclusion
            // If includeSlides is null, we include ALL pages.
            // If includeSlides is set, we ONLY include matching pages.
            const isPageIncluded = !includeSlides || includeSlides.has(page.page);

            if (!isPageIncluded) {
                return; // Skip entire page
            }

            // 2. Add Text
            if (page.text && page.text.trim()) {
                filteredTextParts.push(`--- Page ${page.page} ---\n${page.text}`);
            }

            // 3. Add Images
            if (page.images && Array.isArray(page.images)) {
                page.images.forEach(img => {
                    // Logic: 
                    // - If includeImages is provided, strict match on source.
                    // - If includeImages is NOT provided, include all images from this INCLUDED page.
                    
                    if (includeImages && Array.isArray(includeImages)) {
                         if (includeImages.includes(img.source)) {
                             filteredImages.push(img);
                         }
                    } else {
                        // Default: Include
                        filteredImages.push(img);
                    }
                });
            }
        });

        return {
            text: filteredTextParts.join('\n\n'),
            images: filteredImages
        };
    }
}

module.exports = ContentFilter;
