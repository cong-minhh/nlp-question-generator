const crypto = require("crypto");
const AdmZip = require("adm-zip");
const path = require("path");
const { logger } = require("../logger");

/**
 * Extract text and images from a PPTX file, with support for slide ranges.
 *
 * @param {string} filePath - Path to the PPTX file
 * @param {Object} options - Options
 * @param {number} options.pageStart - Start slide (1-based)
 * @param {number} options.pageEnd - End slide (inclusive)
 * @param {string} options.docId - Document ID for storage
 * @param {Object} options.imageAssetStorage - ImageAssetStorage service
 * @returns {Promise<Object>} - { text: string, images: Array, pages: Array }
 */
async function processPptx(filePath, options = {}) {
  const { docId, imageAssetStorage } = options;
  const saveToStorage = docId && imageAssetStorage;

  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    const filename = path.basename(filePath);

    // 1. Map slides to their XML files
    const slideEntries = zipEntries
      .filter((entry) => entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1]);
        const numB = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1]);
        return numA - numB;
      });

    const totalSlides = slideEntries.length;
    const startSlide = options.pageStart || 1;
    const endSlide = options.pageEnd || totalSlides;

    logger.info(
      `PPTX Extraction: Found ${totalSlides} slides. Requesting ${startSlide}-${endSlide}.`
    );

    let extractedText = "";
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
      const slideContent = slideEntry.getData().toString("utf8");

      // --- Extract Text ---
      const textMatches = slideContent.match(/<a:t>(.*?)<\/a:t>/g);
      let slideText = "";

      if (textMatches) {
        slideText = textMatches
          .map((tag) => tag.replace(/<\/?a:t>/g, ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        slideText = slideContent
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const extractedItem = `--- Slide ${slideNum} ---\n${slideText}\n\n`;
      extractedText += extractedItem;

      // --- Extract Images ---
      const relsEntryName = `ppt/slides/_rels/${path.basename(
        slideEntry.entryName
      )}.rels`;
      const relsEntry = zip.getEntry(relsEntryName);
      const slideImages = [];
      let slideImageOrder = 0;

      if (relsEntry) {
        const relsContent = relsEntry.getData().toString("utf8");

        const imageRels = [];
        const relRegex =
          /<Relationship[^>]*?Type="[^"]*?image"[^>]*?Target="([^"]*?)"[^>]*?\/?>/g;
        let match;
        while ((match = relRegex.exec(relsContent)) !== null) {
          imageRels.push(match[1]);
        }

        for (const target of imageRels) {
          const normalizedTarget = target.replace("../", "ppt/");

          const imageEntry = zip.getEntry(normalizedTarget);
          if (imageEntry) {
            const buffer = imageEntry.getData();

            // FILTER 1: Size Check (ignore < 3KB, usually icons/bullets)
            if (buffer.length < 3072) {
              smallCount++;
              continue;
            }

            // FILTER 2: Deduplication (MD5 Hash)
            const hash = crypto.createHash("md5").update(buffer).digest("hex");
            if (seenHashes.has(hash)) {
              duplicateCount++;
              continue;
            }
            seenHashes.add(hash);

            slideImageOrder++;
            const ext = path
              .extname(normalizedTarget)
              .toLowerCase()
              .replace(".", "");
            let mimeType = "image/jpeg";
            if (ext === "png") mimeType = "image/png";
            else if (ext === "gif") mimeType = "image/gif";
            else if (ext === "bmp") mimeType = "image/bmp";
            else if (ext === "webp") mimeType = "image/webp";

            if (saveToStorage) {
              // Save to storage and return metadata only
              const assetInfo = await imageAssetStorage.save(
                docId,
                slideNum,
                slideImageOrder,
                buffer,
                {
                  width: null, // PPTX doesn't easily expose dimensions without parsing
                  height: null,
                  label: `Slide ${slideNum} - Image ${slideImageOrder}`,
                  originalName: path.basename(normalizedTarget),
                  extension: ext === "jpg" ? "jpeg" : ext,
                }
              );

              slideImages.push({
                imageId: assetInfo.imageId,
                url: assetInfo.url,
                page: slideNum,
                order: slideImageOrder,
                label: `Slide ${slideNum} - Image ${slideImageOrder}`,
                source: `${filename} - Slide ${slideNum} (${path.basename(
                  normalizedTarget
                )})`,
              });
            } else {
              // Legacy: return base64
              slideImages.push({
                type: "base64",
                mediaType: mimeType,
                data: buffer.toString("base64"),
                source: `${filename} - Slide ${slideNum} (${path.basename(
                  normalizedTarget
                )})`,
                page: slideNum,
                order: slideImageOrder,
              });
            }
          } else {
            logger.warn(
              `Warning: Image target ${normalizedTarget} not found in zip.`
            );
          }
        }
      }

      // --- Store structured page data ---
      structuredPages.push({
        page: slideNum,
        text: slideText,
        images: slideImages,
      });

      // Add to global lists
      extractedImages.push(...slideImages);
    }

    logger.info(
      `PPTX Extraction Complete: ${extractedText.length} chars, ${
        extractedImages.length
      } images${saveToStorage ? " (saved to storage)" : ""}.`
    );
    logger.info(
      `Optimization: Skipped ${duplicateCount} duplicates and ${smallCount} tiny images.`
    );
    return {
      text: extractedText,
      images: extractedImages,
      pages: structuredPages,
    };
  } catch (error) {
    logger.error("Error extracting from PPTX:", error);
    throw error;
  }
}

module.exports = {
  processPptx,
};
