# 🎉 What's New in v2.0

## Major New Features

### 📁 File Upload Support

You can now upload files directly instead of just pasting text! The system automatically extracts text from:

- **PDF files** (.pdf)
- **Word documents** (.doc, .docx)
- **PowerPoint presentations** (.ppt, .pptx)
- **Plain text files** (.txt)

### 🔄 Multi-File Processing

Upload up to **10 files at once**! The system will:
1. Extract text from each file
2. Combine all the text
3. Generate questions based on all content
4. Report status for each file

### 🖥️ Beautiful Web Interface

A drag-and-drop web UI (`upload-test.html`) with:
- Drag & drop file upload
- Real-time file list
- Progress indicators
- Color-coded difficulty levels
- Professional, modern design

### 📊 Enhanced Response Metadata

Responses now include detailed information:
```json
{
  "questions": [...],
  "metadata": {
    "filesProcessed": 3,
    "filesWithText": 3,
    "totalTextLength": 12500,
    "files": [
      {
        "name": "lecture1.pdf",
        "size": 204800,
        "textLength": 5000,
        "status": "success"
      }
    ]
  }
}
```

## Technical Improvements

### New Dependencies
- `multer` - File upload handling
- `pdf-parse` - PDF text extraction
- `mammoth` - DOCX text extraction
- `officeparser` - PPT/PPTX/DOC support

### New Endpoints

**POST /generate-from-files**
- Accepts multipart/form-data
- Supports multiple files
- Returns enhanced metadata

### Automatic Cleanup
- Uploaded files are automatically deleted after processing
- No files persist on the server
- Secure and private

## How to Use

### Quick Test

**PowerShell:**
```powershell
.\test-upload-simple.ps1
```

**Web Browser:**
Open `upload-test.html` in any browser

### Command Line

```bash
curl -X POST http://localhost:3000/generate-from-files \
  -F "files=@document.pdf" \
  -F "num_questions=10"
```

### From Your Application

```javascript
const formData = new FormData();
formData.append('files', fileInput.files[0]);
formData.append('num_questions', 5);

const response = await fetch('http://localhost:3000/generate-from-files', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

## Compatibility

### Backward Compatible ✅
The original `/generate` endpoint still works exactly as before:

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d '{"text":"Your text here","num_questions":5}'
```

### Moodle Integration
Both endpoints work with Moodle:
- `/generate` - For extracted text (existing functionality)
- `/generate-from-files` - For direct file uploads (new!)

## File Processing Details

### PDF Files
- ✅ Text-based PDFs
- ✅ Multi-page documents
- ✅ Tables and structured content
- ❌ Scanned images (requires OCR - not included)

### Word Documents
- ✅ .docx (Office 2007+)
- ✅ .doc (Office 97-2003)
- ✅ Tables and lists
- ✅ Formatted text

### PowerPoint
- ✅ .pptx (Office 2007+)
- ✅ .ppt (Office 97-2003)
- ✅ Slide titles and content
- ✅ Notes sections

### Text Files
- ✅ UTF-8 encoding
- ✅ Any size
- ✅ Plain text

## Limits

- **File size:** 50MB per file
- **File count:** 10 files per request
- **Total processing time:** ~10-30 seconds depending on file size
- **API rate limit:** Same as before (60 requests/min on free tier)

## Files Added

### Core Files
- `index.js` - Updated with file upload support

### Testing
- `test-upload-simple.ps1` - Simple PowerShell test
- `test-file-upload.ps1` - Advanced PowerShell test
- `upload-test.html` - Beautiful web UI

### Documentation
- `FILE-UPLOAD-GUIDE.md` - Complete file upload guide
- `WHATS-NEW.md` - This file

### Configuration
- `package.json` - Updated dependencies
- `.gitignore` - Added uploads directory

## Examples

### Example 1: Single PDF

```bash
curl -X POST http://localhost:3000/generate-from-files \
  -F "files=@textbook-chapter3.pdf" \
  -F "num_questions=10"
```

### Example 2: Multiple Files

```bash
curl -X POST http://localhost:3000/generate-from-files \
  -F "files=@lecture1.pdf" \
  -F "files=@lecture2.pdf" \
  -F "files=@slides.pptx" \
  -F "num_questions=20"
```

### Example 3: Mixed Formats

```bash
curl -X POST http://localhost:3000/generate-from-files \
  -F "files=@notes.docx" \
  -F "files=@summary.txt" \
  -F "files=@presentation.pptx" \
  -F "num_questions=15"
```

## Upgrade Path

If you're upgrading from v1.0:

1. **Pull latest code**
2. **Install new dependencies:**
   ```bash
   npm install
   ```
3. **Restart server:**
   ```bash
   npm start
   ```
4. **Test file upload:**
   ```bash
   .\test-upload-simple.ps1
   ```

That's it! Your existing text-based endpoint continues to work.

## What's Next?

Future planned features:
- OCR support for scanned PDFs
- Image text extraction
- Excel/CSV support
- Markdown support
- URL/web page scraping
- Batch processing API
- Question templates
- Custom difficulty targeting

## Feedback

Found a bug? Have a feature request? Let us know!

---

**Version:** 2.0.0  
**Release Date:** October 29, 2025  
**License:** GPL-3.0



