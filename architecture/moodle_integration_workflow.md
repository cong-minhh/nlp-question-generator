# Moodle Integration Architecture: Granular Content Selection

## Executive Summary
To allow Moodle users to select specific slides and images for question generation, we recommend an **"Inspect -> Select -> Generate"** workflow. This approach delegates heavy file processing to the Node.js service while keeping the Moodle backend lightweight.

## The Workflow

### Phase 1: Inspection (The Cataloging Step)
**Goal:** Convert the opaque file (PPTX/PDF) into a structured catalog of content that Moodle can display.

1.  **User Action:** User uploads a file in the Moodle Plugin.
2.  **Moodle Backend:** Sends the file to Node.js endpoint: `POST /api/documents/inspect`.
3.  **Node.js Service:**
    *   Uses the Unified Processors (`PptxProcessor`, `PdfProcessor`).
    *   Extracts **Structured Data**:
        ```json
        {
          "documentId": "temp_12345", // Optional: if caching on Node side
          "metadata": { "filename": "lecture.pptx", "totalSlides": 20 },
          "items": [
            {
              "id": "slide_1",
              "type": "slide",
              "label": "Slide 1",
              "textPreview": "Introduction to AI...",
              "thumbnail": "data:image/png;base64,..." // Low-res for UI
            },
            {
              "id": "img_1_1",
              "type": "image",
              "parentId": "slide_1",
              "thumbnail": "data:image/jpeg;base64,..." 
            }
          ]
        }
        ```
    *   *Note:* The structure I implemented in `pages: []` for the Debug tool is 90% of the way there.

### Phase 2: Selection (The User Interface)
**Goal:** Allow the user to curate the context.

1.  **Moodle Frontend:**
    *   Displays the content in a "Select Content" modal.
    *   Shows text previews and image thumbnails.
    *   User checkboxes specific slides or images they want to *include* or *exclude*.
2.  **Output:** A selection object, e.g., `selectedIds: ['slide_1', 'slide_3', 'img_3_1']`.

### Phase 3: Generation (The Action)
**Goal:** Generate questions using ONLY the selected context.

1.  **Moodle Backend:** Sends a generation request: `POST /api/generate/questions`.
    *   **Payload Option A (Stateless - Robuster):** Re-sends the file + a `filter` object.
        ```json
        {
          "file": (binary),
          "options": {
             "mode": "granular",
             "includeSlides": [1, 3], // 1-based indices
             "includeImages": ["slide1_img1.png", ...]
          }
        }
        ```
    *   **Payload Option B (Stateful - Faster):** Sends `documentId` + `filter`.
        *   *Requires Node.js to implement a cache/storage layer (Redis/S3).*
        *   *Better for large files to avoid re-uploading.*

## Recommended Implementation Path

1.  **Leverage Existing Processors:** The `pages` array we just added to `DocxProcessor`, `PdfProcessor`, and `PptxProcessor` is the perfect data source for Phase 1.
2.  **Refine the API:**
    *   Create a dedicated `/api/documents/inspect` endpoint (similar to `/debug/process` but optimized for JSON response size, perhaps resizing thumbnails).
3.  **Update Generation Logic:**
    *   Modify `QuestionGenerator` to accept a `contextFilter`.
    *   When processing the file, filtered out content is simply ignored before being sent to the AI.

## Enterprise Considerations
*   **Security:** Ensure the `inspect` endpoint doesn't leak sensitive server info.
*   **Performance:** For thumbnails, generate small, highly compressed JPEGs (~10KB) to keep the JSON response light.
*   **Scalability:** Stateless (Option A) is easier to scale (no shared cache needed between Node instances), but eats more bandwidth. For a Moodle plugin, **Stateless** is usually preferred for simplicity unless files are massive (>50MB).
