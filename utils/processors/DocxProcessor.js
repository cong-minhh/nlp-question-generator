const mammoth = require("mammoth");
const AdmZip = require("adm-zip");
const path = require("path");
const crypto = require("crypto");
const { logger } = require("../logger");

/**
 * Extract text and images from a DOCX file
 * @param {string} filePath - Path to the DOCX file
 * @param {Object} options - Options
 * @param {string} options.docId - Document ID for storage
 * @param {Object} options.imageAssetStorage - ImageAssetStorage service
 * @returns {Promise<Object>} - { text: string, images: Array, pages: Array }
 */
async function processDocx(filePath, options = {}) {
  const { docId, imageAssetStorage } = options;
  const saveToStorage = docId && imageAssetStorage;

  try {
    const filename = path.basename(filePath);
    logger.info(`Processing DOCX: ${filename}`);

    // 1. Extract Text using Mammoth (best for preserving structure/readability)
    const textResult = await mammoth.extractRawText({ path: filePath });
    const text = textResult.value;

    // 2. Extract Images using AdmZip (DOCX is a ZIP)
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    const images = [];
    const seenHashes = new Set();
    let imageOrder = 0;

    for (const entry of zipEntries) {
      // Check for media files in word/media/
      if (
        entry.entryName.match(/word\/media\/.*\.(png|jpeg|jpg|gif|bmp|webp)$/i)
      ) {
        const buffer = entry.getData();

        // Deduplicate by hash
        const hash = crypto.createHash("md5").update(buffer).digest("hex");
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        imageOrder++;
        const ext = path
          .extname(entry.entryName)
          .toLowerCase()
          .replace(".", "");
        let mimeType = "image/jpeg";
        switch (ext) {
          case "png":
            mimeType = "image/png";
            break;
          case "webp":
            mimeType = "image/webp";
            break;
          case "gif":
            mimeType = "image/gif";
            break;
          case "bmp":
            mimeType = "image/bmp";
            break;
          case "jpg":
          case "jpeg":
            mimeType = "image/jpeg";
            break;
          default:
            continue;
        }

        if (saveToStorage) {
          // Save to storage and return metadata only
          const assetInfo = await imageAssetStorage.save(
            docId,
            1, // DOCX doesn't have pages, treat as page 1
            imageOrder,
            buffer,
            {
              label: `Document - Image ${imageOrder}`,
              originalName: path.basename(entry.entryName),
              extension: ext === "jpg" ? "jpeg" : ext,
            }
          );

          images.push({
            imageId: assetInfo.imageId,
            url: assetInfo.url,
            page: 1,
            order: imageOrder,
            label: `Document - Image ${imageOrder}`,
            source: `${filename} - ${path.basename(entry.entryName)}`,
          });
        } else {
          // Legacy: return base64
          images.push({
            type: "base64",
            mediaType: mimeType,
            data: buffer.toString("base64"),
            source: `${filename} - ${path.basename(entry.entryName)}`,
            page: 1,
            order: imageOrder,
          });
        }
      }
    }

    logger.info(
      `DOCX Extraction: ${text.length} chars, ${images.length} images${
        saveToStorage ? " (saved to storage)" : ""
      }.`
    );

    return {
      text,
      images,
      pages: [
        {
          page: 1,
          text: text,
          images: images,
        },
      ],
    };
  } catch (error) {
    logger.error("Error processing DOCX:", error);
    throw new Error(
      `Failed to process DOCX ${path.basename(filePath)}: ${error.message}`
    );
  }
}

module.exports = {
  processDocx,
};
