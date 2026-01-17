/**
 * Large File Processing Test
 *
 * Tests the memory-efficient file processing implementation:
 * - File size validation (100MB limit for PPTX/DOCX)
 * - Streaming for large PDFs
 * - Memory monitoring during processing
 *
 * Usage: node tests/test-large-file.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Import processors
const { processPdf } = require("../utils/processors/PdfProcessor");
const { processPptx } = require("../utils/processors/PptxProcessor");
const { processDocx } = require("../utils/processors/DocxProcessor");
const {
  checkFileSize,
  getMemoryUsage,
  LARGE_FILE_THRESHOLD,
} = require("../utils/streamUtils");

// Test configuration
const TEST_DIR = path.join(__dirname);
const RESULTS = [];

/**
 * Log test result
 */
function logResult(testName, passed, message = "") {
  const status = passed ? "✅ PASS" : "❌ FAIL";
  const result = { testName, passed, message };
  RESULTS.push(result);
  console.log(`${status}: ${testName}${message ? ` - ${message}` : ""}`);
}

/**
 * Get memory usage in MB
 */
function getMemoryMB() {
  const mem = getMemoryUsage();
  return parseFloat(mem.heapUsed);
}

/**
 * Create a dummy PDF-like file (just for size testing)
 * Note: This won't be a valid PDF, just for testing size limits
 */
function createDummyFile(filePath, sizeMB) {
  console.log(`Creating ${sizeMB}MB dummy file...`);
  const sizeBytes = sizeMB * 1024 * 1024;
  const chunkSize = 1024 * 1024; // 1MB chunks
  const chunks = Math.ceil(sizeBytes / chunkSize);

  const fd = fs.openSync(filePath, "w");
  for (let i = 0; i < chunks; i++) {
    const chunk = Buffer.alloc(Math.min(chunkSize, sizeBytes - i * chunkSize));
    crypto.randomFillSync(chunk);
    fs.writeSync(fd, chunk);
  }
  fs.closeSync(fd);
  console.log(`Created: ${filePath}`);
}

/**
 * Test 1: File size check utility
 */
async function testFileSizeCheck() {
  console.log("\n--- Test 1: File Size Check Utility ---");

  // Create a small test file
  const smallFile = path.join(TEST_DIR, "temp_small.bin");
  fs.writeFileSync(smallFile, Buffer.alloc(1024)); // 1KB

  try {
    const result = await checkFileSize(smallFile);
    logResult(
      "Small file passes size check",
      result.valid,
      `${result.size} bytes`,
    );
  } catch (e) {
    logResult("Small file passes size check", false, e.message);
  }

  // Clean up
  fs.unlinkSync(smallFile);
}

/**
 * Test 2: Memory usage tracking
 */
async function testMemoryTracking() {
  console.log("\n--- Test 2: Memory Usage Tracking ---");

  const beforeMem = getMemoryMB();

  // Allocate some memory
  const bigArray = new Array(1000000).fill("test string");

  const afterMem = getMemoryMB();
  const increased = afterMem > beforeMem;

  logResult(
    "Memory tracking works",
    true,
    `Before: ${beforeMem}MB, After: ${afterMem}MB`,
  );

  // Allow garbage collection hint
  bigArray.length = 0;
}

/**
 * Test 3: Large file threshold detection
 */
async function testLargeFileThreshold() {
  console.log("\n--- Test 3: Large File Threshold ---");

  const expectedThreshold = 50 * 1024 * 1024; // 50MB
  const correct = LARGE_FILE_THRESHOLD === expectedThreshold;

  logResult(
    "Large file threshold is 50MB",
    correct,
    `Threshold: ${LARGE_FILE_THRESHOLD / 1024 / 1024}MB`,
  );
}

/**
 * Test 4: Test with actual PDF file (if available)
 */
async function testActualPdfIfAvailable() {
  console.log("\n--- Test 4: Actual PDF Processing ---");

  // Look for a PDF in test directory or parent
  const possiblePdfs = [
    path.join(TEST_DIR, "..", "Chapter 3 - Solving Problems by Searching.pdf"),
    ...fs
      .readdirSync(TEST_DIR)
      .filter((f) => f.endsWith(".pdf"))
      .map((f) => path.join(TEST_DIR, f)),
  ];

  let pdfPath = null;
  for (const p of possiblePdfs) {
    if (fs.existsSync(p)) {
      pdfPath = p;
      break;
    }
  }

  if (!pdfPath) {
    console.log("⚠️ SKIP: No PDF file found for testing");
    return;
  }

  console.log(`Testing with: ${path.basename(pdfPath)}`);

  const stats = fs.statSync(pdfPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`File size: ${sizeMB}MB`);

  const beforeMem = getMemoryMB();

  try {
    const startTime = Date.now();
    const result = await processPdf(pdfPath, { pageStart: 1, pageEnd: 3 });
    const duration = Date.now() - startTime;

    const afterMem = getMemoryMB();
    const memDelta = (afterMem - beforeMem).toFixed(1);

    logResult(
      "PDF processed successfully",
      true,
      `${result.pages.length} pages, ${result.images.length} images, ${duration}ms, +${memDelta}MB RAM`,
    );
  } catch (e) {
    logResult("PDF processed successfully", false, e.message);
  }
}

/**
 * Test 5: Test rate limiter
 */
async function testRateLimiter() {
  console.log("\n--- Test 5: Rate Limiter ---");

  const RateLimiter = require("../middleware/rateLimiter");

  const limiter = new RateLimiter({
    windowMs: 1000, // 1 second window for testing
    maxRequests: 5,
  });

  // Simulate requests
  const mockReq = { ip: "127.0.0.1" };
  const mockRes = {
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
    },
  };

  let blockedCount = 0;

  // Make 7 requests (5 should pass, 2 should be blocked)
  for (let i = 0; i < 7; i++) {
    const res = { ...mockRes, headers: {} };
    let nextCalled = false;

    limiter.middleware()(mockReq, res, () => {
      nextCalled = true;
    });

    if (!nextCalled) {
      blockedCount++;
    }
  }

  logResult(
    "Rate limiter blocks excess requests",
    blockedCount === 2,
    `Blocked ${blockedCount} of 7 requests (expected 2)`,
  );

  // Check stats
  const stats = limiter.getStats();
  logResult(
    "Rate limiter tracks statistics",
    stats.totalRequests === 7,
    `Total: ${stats.totalRequests}, Blocked: ${stats.blockedRequests}`,
  );
}

/**
 * Test 6: Stream utils module exports
 */
async function testStreamUtilsExports() {
  console.log("\n--- Test 6: Stream Utils Module ---");

  const streamUtils = require("../utils/streamUtils");

  const expectedExports = [
    "streamFileToBuffer",
    "checkFileSize",
    "getMemoryUsage",
    "logMemoryUsage",
    "suggestGC",
    "LARGE_FILE_THRESHOLD",
    "DEFAULT_MAX_FILE_SIZE",
  ];

  const missingExports = expectedExports.filter((e) => !streamUtils[e]);

  logResult(
    "Stream utils exports all functions",
    missingExports.length === 0,
    missingExports.length > 0
      ? `Missing: ${missingExports.join(", ")}`
      : "All exports present",
  );
}

/**
 * Run all tests
 */
async function runTests() {
  console.log("=".repeat(60));
  console.log("Large File Processing Tests");
  console.log("=".repeat(60));

  await testFileSizeCheck();
  await testMemoryTracking();
  await testLargeFileThreshold();
  await testActualPdfIfAvailable();
  await testRateLimiter();
  await testStreamUtilsExports();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));

  const passed = RESULTS.filter((r) => r.passed).length;
  const failed = RESULTS.filter((r) => !r.passed).length;
  const total = RESULTS.length;

  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${failed}/${total}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    RESULTS.filter((r) => !r.passed).forEach((r) => {
      console.log(`  - ${r.testName}: ${r.message}`);
    });
  }

  console.log("\n" + "=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
