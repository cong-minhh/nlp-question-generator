/**
 * Content Filter Utility
 * Handles logic for filtering structured document content based on user selection.
 */
const { logger } = require('./logger');

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
        const hasExplicitImageSelection = includeImages && Array.isArray(includeImages) && includeImages.length > 0;

        // logger.info('[ContentFilter] Options received:', {
        //     includeSlides: options.includeSlides,
        //     includeImages: options.includeImages,
        //     hasExplicitImageSelection
        // });

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
            // ========== TEXT: Based on slide selection ==========
            // If includeSlides is null/empty, include ALL pages' text
            // If includeSlides is specified, only include selected pages' text
            const isSlideSelected = !includeSlides || includeSlides.has(page.page);
            
            if (isSlideSelected && page.text && page.text.trim()) {
                filteredTextParts.push(`--- Page ${page.page} ---\n${page.text}`);
            }

            // ========== IMAGES: Completely independent of slide selection ==========
            if (page.images && Array.isArray(page.images)) {
                page.images.forEach(img => {
                    if (hasExplicitImageSelection) {
                        // User explicitly selected images - include only those
                        if (includeImages.includes(img.source)) {
                            filteredImages.push(img);
                        }
                    } 
                });
            }
        });

        logger.info(`[ContentFilter] Result: ${filteredImages.length} images, ${filteredTextParts.join('').length} chars`);

        return {
            text: filteredTextParts.join('\n\n'),
            images: filteredImages
        };
    }
}

module.exports = ContentFilter;
