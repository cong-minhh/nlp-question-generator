/**
 * Content Filter Utility
 * Handles logic for filtering structured document content based on user selection.
 * Supports both URL-based image metadata and legacy Base64 images.
 */
const { logger } = require("./logger");
const fs = require("fs").promises;

class ContentFilter {
  /**
   * Filter extraction data based on options
   * @param {Object} extractionData - Result from FileProcessingService/UnifiedProcessor ({ text, images, pages })
   * @param {Object} options - Filter options ({ includeSlides: [], includeImages: [], docId, imageAssetStorage })
   * @returns {Object} - { text: string, images: Array, imageMetadata: Array }
   */
  static async apply(extractionData, options = {}) {
    const includeSlides = options.includeSlides
      ? new Set(options.includeSlides.map(Number))
      : null;
    const includeImages = options.includeImages; // Array of imageIds
    const hasExplicitImageSelection =
      includeImages && Array.isArray(includeImages) && includeImages.length > 0;
    const { docId, imageAssetStorage } = options;

    // If no pages structure (legacy), return as is
    if (!extractionData.pages || !Array.isArray(extractionData.pages)) {
      return {
        text: extractionData.text || "",
        images: extractionData.images || [],
        imageMetadata: [],
      };
    }

    let filteredTextParts = [];
    let filteredImages = [];
    let imageMetadata = []; // Metadata for source tracking

    for (const page of extractionData.pages) {
      // ========== TEXT: Based on slide selection ==========
      const isSlideSelected = !includeSlides || includeSlides.has(page.page);

      if (isSlideSelected && page.text && page.text.trim()) {
        filteredTextParts.push(`--- Page ${page.page} ---\n${page.text}`);
      }

      // ========== IMAGES: Completely independent of slide selection ==========
      if (page.images && Array.isArray(page.images)) {
        for (const img of page.images) {
          if (hasExplicitImageSelection) {
            // User explicitly selected images by imageId
            const isSelected = img.imageId
              ? includeImages.includes(img.imageId)
              : includeImages.includes(img.source); // Fallback to source for legacy

            if (isSelected) {
              // Check if this is a URL-based image (needs loading for AI)
              if (img.imageId && !img.data && docId && imageAssetStorage) {
                try {
                  const buffer = await imageAssetStorage.getBuffer(
                    docId,
                    img.imageId
                  );
                  if (buffer) {
                    // Add base64 data for AI processing
                    filteredImages.push({
                      type: "base64",
                      mediaType: "image/png",
                      data: buffer.toString("base64"),
                      source: img.source || img.label,
                    });
                    // Keep metadata for response
                    imageMetadata.push({
                      imageId: img.imageId,
                      url: img.url,
                      label: img.label,
                      page: img.page,
                      order: img.order,
                    });
                  }
                } catch (e) {
                  logger.warn(
                    `[ContentFilter] Failed to load image ${img.imageId}:`,
                    e.message
                  );
                }
              } else if (img.data) {
                // Legacy Base64 image
                filteredImages.push(img);
                if (img.source) {
                  imageMetadata.push({
                    source: img.source,
                    page: img.page,
                    order: img.order,
                  });
                }
              }
            }
          }
          // If no explicit selection, don't include any images (user must select)
        }
      }
    }

    logger.info(
      `[ContentFilter] Result: ${filteredImages.length} images, ${
        filteredTextParts.join("").length
      } chars`
    );

    return {
      text: filteredTextParts.join("\n\n"),
      images: filteredImages,
      imageMetadata,
    };
  }
}

module.exports = ContentFilter;
