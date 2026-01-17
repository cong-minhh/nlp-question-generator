/**
 * Stream Utilities for Memory-Efficient File Processing
 *
 * Provides utilities for handling large files without buffering
 * the entire content in memory at once.
 *
 * @module utils/streamUtils
 */

const fs = require("fs");
const fsPromises = require("fs").promises;
const { logger } = require("./logger");

// Default max file size (100MB)
const DEFAULT_MAX_FILE_SIZE =
  parseInt(process.env.MAX_FILE_SIZE_MB) * 1024 * 1024 || 100 * 1024 * 1024;

// Threshold for "large file" warnings (50MB)
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

/**
 * Stream file to buffer with progress logging for large files
 * Uses chunked reading to avoid blocking the event loop
 *
 * @param {string} filePath - Path to file
 * @param {number} [fileSize] - File size in bytes (optional, will be determined if not provided)
 * @returns {Promise<Buffer>} - File content as buffer
 */
async function streamFileToBuffer(filePath, fileSize = null) {
  // Get file size if not provided
  if (!fileSize) {
    const stats = await fsPromises.stat(filePath);
    fileSize = stats.size;
  }

  const isLarge = fileSize > LARGE_FILE_THRESHOLD;

  if (isLarge) {
    const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
    logger.info(
      `Processing large file (${sizeMB}MB). Using chunked reading...`,
    );
    logMemoryUsage("Before reading");
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytesRead = 0;
    let lastLoggedPercent = 0;

    const stream = fs.createReadStream(filePath, {
      highWaterMark: 64 * 1024, // 64KB chunks for balanced memory/performance
    });

    stream.on("data", (chunk) => {
      chunks.push(chunk);
      bytesRead += chunk.length;

      // Log progress every 10% for large files
      if (isLarge) {
        const percent = Math.floor((bytesRead / fileSize) * 100);
        if (percent >= lastLoggedPercent + 10) {
          lastLoggedPercent = percent;
          logger.debug(`File read progress: ${percent}%`);
        }
      }
    });

    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);

      if (isLarge) {
        logMemoryUsage("After reading");
        // Hint to GC that chunks array can be freed
        chunks.length = 0;
      }

      resolve(buffer);
    });

    stream.on("error", (err) => {
      logger.error(`Error reading file: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Check if file size is within acceptable limits
 *
 * @param {string} filePath - Path to file
 * @param {number} [maxSize] - Maximum allowed size in bytes
 * @returns {Promise<{valid: boolean, size: number, maxSize: number, message: string}>}
 */
async function checkFileSize(filePath, maxSize = DEFAULT_MAX_FILE_SIZE) {
  const stats = await fsPromises.stat(filePath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  const maxMB = (maxSize / 1024 / 1024).toFixed(0);

  if (stats.size > maxSize) {
    return {
      valid: false,
      size: stats.size,
      maxSize: maxSize,
      message: `File too large (${sizeMB}MB). Maximum allowed is ${maxMB}MB.`,
    };
  }

  if (stats.size > LARGE_FILE_THRESHOLD) {
    logger.warn(
      `Large file detected: ${sizeMB}MB. Processing may take longer.`,
    );
  }

  return {
    valid: true,
    size: stats.size,
    maxSize: maxSize,
    message: "OK",
  };
}

/**
 * Get memory usage stats
 *
 * @returns {Object} Memory usage in MB
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(1),
    heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(1),
    rss: (usage.rss / 1024 / 1024).toFixed(1),
    external: (usage.external / 1024 / 1024).toFixed(1),
  };
}

/**
 * Log current memory usage
 *
 * @param {string} [label] - Label for the log entry
 */
function logMemoryUsage(label = "Memory usage") {
  const mem = getMemoryUsage();
  logger.debug(
    `${label}: Heap ${mem.heapUsed}/${mem.heapTotal}MB, RSS ${mem.rss}MB`,
  );
}

/**
 * Suggest garbage collection if available
 * Note: Only works if Node is started with --expose-gc flag
 */
function suggestGC() {
  if (global.gc) {
    logger.debug("Running garbage collection...");
    global.gc();
  }
}

module.exports = {
  streamFileToBuffer,
  checkFileSize,
  getMemoryUsage,
  logMemoryUsage,
  suggestGC,
  LARGE_FILE_THRESHOLD,
  DEFAULT_MAX_FILE_SIZE,
};
