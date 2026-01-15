const fs = require("fs").promises;
const path = require("path");
const officeParser = require("officeparser");
const { logger } = require("../utils/logger");

// Unified Processors
const { processPdf } = require("../utils/processors/PdfProcessor");
const { processPptx } = require("../utils/processors/PptxProcessor");
const { processDocx } = require("../utils/processors/DocxProcessor");

// Image Asset Storage
const imageAssetStorage = require("./storage/ImageAssetStorage");

class FileProcessingService {
  /**
   * Process a single file and return structured content
   * @param {string} filePath
   * @param {string} originalName
   * @param {Object} options - Options including docId for storage
   */
  async processFile(filePath, originalName, options = {}) {
    const ext = path.extname(originalName).toLowerCase();
    const { docId } = options;

    logger.info(
      `[FileProcessingService] Processing ${originalName} (${ext})${
        docId ? ` [docId: ${docId}]` : ""
      }`
    );

    let result = { text: "", images: [], pages: [] };

    // Build processor options with image storage if docId provided
    const processorOptions = {
      ...options,
      docId: docId,
      imageAssetStorage: docId ? imageAssetStorage : null,
    };

    try {
      switch (ext) {
        // Unified Processors (return { text, images, pages })
        case ".pdf":
          result = await processPdf(filePath, processorOptions);
          break;
        case ".docx":
          result = await processDocx(filePath, processorOptions);
          break;
        case ".pptx":
          result = await processPptx(filePath, processorOptions);
          break;

        // Legacy / Simple Text Formats
        case ".txt":
          const text = await fs.readFile(filePath, "utf-8");
          result = { text, images: [], pages: [{ page: 1, text }] };
          break;

        case ".png":
        case ".jpg":
        case ".jpeg":
        case ".webp":
        case ".gif":
          // Image only file - save to storage if docId provided
          if (docId) {
            const buffer = await fs.readFile(filePath);
            const imgExt = ext.replace(".", "");
            const assetInfo = await imageAssetStorage.save(
              docId,
              1,
              1,
              buffer,
              {
                label: originalName,
                originalName,
                extension: imgExt === "jpg" ? "jpeg" : imgExt,
              }
            );
            result = {
              text: "",
              images: [
                {
                  imageId: assetInfo.imageId,
                  url: assetInfo.url,
                  page: 1,
                  order: 1,
                  label: originalName,
                  source: originalName,
                },
              ],
              pages: [
                {
                  page: 1,
                  text: "",
                  images: [
                    {
                      imageId: assetInfo.imageId,
                      url: assetInfo.url,
                      page: 1,
                      order: 1,
                      label: originalName,
                      source: originalName,
                    },
                  ],
                },
              ],
            };
          } else {
            const imgData = await this.readImageFile(filePath);
            result = {
              text: "",
              images: [{ ...imgData, source: originalName }],
              pages: [
                {
                  page: 1,
                  text: "",
                  images: [{ ...imgData, source: originalName }],
                },
              ],
            };
          }
          break;

        default:
          // Fallback (text only)
          const fallbackText = await officeParser.parseOfficeAsync(filePath);
          result = {
            text: fallbackText,
            images: [],
            pages: [{ page: 1, text: fallbackText }],
          };
      }

      return {
        filename: originalName,
        ...result,
      };
    } catch (error) {
      logger.error(`Error processing ${originalName}:`, error);
      throw new Error(`Failed to process ${originalName}: ${error.message}`);
    }
  }

  /**
   * Process multiple files
   * @param {Array} files - Array of multer file objects
   * @param {Object} options
   */
  async processFiles(files, options = {}) {
    const results = {
      extractedTexts: [],
      extractedImages: [],
      fileInfo: [],
      combinedText: "",
    };

    for (const file of files) {
      try {
        const result = await this.processFile(
          file.path,
          file.originalname,
          options
        );

        // Aggregate Text
        if (result.text && result.text.trim()) {
          results.extractedTexts.push(result.text);
          results.fileInfo.push({
            name: file.originalname,
            size: file.size,
            textLength: result.text.length,
            type: "text",
            status: "success",
          });
        }

        // Aggregate Images
        if (result.images && result.images.length > 0) {
          results.extractedImages.push(...result.images);
        }

        if (!result.text && (!result.images || result.images.length === 0)) {
          results.fileInfo.push({
            name: file.originalname,
            size: file.size,
            status: "warning",
            message: "No content extracted",
          });
        }
      } catch (error) {
        results.fileInfo.push({
          name: file.originalname,
          size: file.size,
          status: "error",
          message: error.message,
        });
      }
    }

    results.combinedText = results.extractedTexts.join("\n\n");
    results.totalTextLength = results.combinedText.length;

    return results;
  }

  /**
   * Helper to read image file to base64 (legacy support)
   */
  async readImageFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = "image/jpeg";
    if (ext === ".png") mimeType = "image/png";
    if (ext === ".webp") mimeType = "image/webp";
    if (ext === ".gif") mimeType = "image/gif";

    const dataBuffer = await fs.readFile(filePath);
    return {
      mediaType: mimeType,
      data: dataBuffer.toString("base64"),
    };
  }
}

module.exports = new FileProcessingService();
