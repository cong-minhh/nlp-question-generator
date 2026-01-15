const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

const BASE_URL = "http://localhost:3000/api";

async function testImageAssets() {
  console.log("=== Testing Image Assets & Caching Implementation ===\n");

  // Find a test PDF - use project root
  const testFile = path.resolve(
    __dirname,
    "..",
    "Chapter 3 - Solving Problems by Searching.pdf"
  );
  if (!fs.existsSync(testFile)) {
    console.error("Test PDF not found at:", testFile);
    process.exit(1);
  }

  console.log("[1] Testing /api/documents/inspect (First Upload)...");
  const formData = new FormData();
  formData.append("file", fs.createReadStream(testFile));

  try {
    const startTime = Date.now();
    const res = await axios.post(BASE_URL + "/documents/inspect", formData, {
      headers: { ...formData.getHeaders() },
      timeout: 60000,
    });
    const duration1 = Date.now() - startTime;

    console.log("✓ Inspect returned successfully");
    console.log("  docId:", res.data.docId);
    console.log("  pages:", res.data.pages?.length || 0);
    console.log("  Duration:", duration1 + "ms");

    // Check docId format (should be doc_{hash})
    if (res.data.docId.startsWith("doc_")) {
      console.log("✓ DocId uses content-hash format (doc_xxx)");
    } else {
      console.log("⚠ DocId format:", res.data.docId);
    }

    // Check first page with images
    const pageWithImages = res.data.pages.find(
      (p) => p.images && p.images.length > 0
    );
    if (pageWithImages) {
      console.log(
        "\n[2] Checking image format (page " + pageWithImages.page + ")..."
      );
      const img = pageWithImages.images[0];
      console.log("  imageId:", img.imageId);
      console.log("  url:", img.url);
      console.log("  label:", img.label);
      console.log("  has base64 data:", !!img.data);

      // Check URL includes docId
      if (img.url && img.url.includes("docId=")) {
        console.log("✓ URL includes docId query param for fast lookup");
      } else if (img.url) {
        console.log("⚠ URL missing docId:", img.url);
      }

      if (img.url && !img.data) {
        console.log("✓ Images returned with URL, no Base64 - SUCCESS!");
      } else if (img.data) {
        console.log("⚠ Image still has Base64 data (legacy format)");
      }

      // Test asset endpoint
      if (img.imageId && res.data.docId) {
        console.log("\n[3] Testing /assets/:imageId endpoint...");
        try {
          const assetUrl =
            "http://localhost:3000/assets/" +
            img.imageId +
            "?docId=" +
            res.data.docId;
          console.log("  Fetching:", assetUrl);
          const assetRes = await axios.get(assetUrl, {
            responseType: "arraybuffer",
          });
          console.log(
            "✓ Asset endpoint returned",
            assetRes.data.length,
            "bytes"
          );
          console.log("  Content-Type:", assetRes.headers["content-type"]);
          console.log("  Cache-Control:", assetRes.headers["cache-control"]);
        } catch (e) {
          console.log("✗ Asset fetch failed:", e.message);
        }
      }
    } else {
      console.log("No pages with images found in document");
    }

    // [4] Test caching - upload same file again
    console.log("\n[4] Testing caching (Second Upload)...");
    const formData2 = new FormData();
    formData2.append("file", fs.createReadStream(testFile));

    const startTime2 = Date.now();
    const res2 = await axios.post(BASE_URL + "/documents/inspect", formData2, {
      headers: { ...formData2.getHeaders() },
      timeout: 60000,
    });
    const duration2 = Date.now() - startTime2;

    console.log("  docId:", res2.data.docId);
    console.log("  Duration:", duration2 + "ms");

    if (res.data.docId === res2.data.docId) {
      console.log("✓ Same docId returned (cache hit!)");
    } else {
      console.log(
        "✗ Different docId (cache miss):",
        res.data.docId,
        "vs",
        res2.data.docId
      );
    }

    if (duration2 < duration1 * 0.5) {
      console.log("✓ Second request was significantly faster (cache working)");
    } else {
      console.log(
        "⚠ Second request was not faster:",
        duration1 + "ms vs " + duration2 + "ms"
      );
    }

    console.log("\n=== Test Complete ===");
  } catch (e) {
    console.error("Test failed:", e.message);
    if (e.response) {
      console.error("Response status:", e.response.status);
      console.error("Response data:", e.response.data);
    }
  }
}

testImageAssets();
