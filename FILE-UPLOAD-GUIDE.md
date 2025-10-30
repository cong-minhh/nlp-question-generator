# File Upload Feature Guide

## 📁 Overview

The NLP Question Generator now supports **automatic text extraction** from multiple file formats! Upload your documents and get questions generated automatically.

## 🎯 Supported File Formats

- **PDF** (.pdf) - Portable Document Format
- **Word Documents** (.doc, .docx) - Microsoft Word
- **PowerPoint** (.ppt, .pptx) - Microsoft PowerPoint presentations
- **Text Files** (.txt) - Plain text

## 🚀 How to Use

### Method 1: Web Interface (Easiest)

1. **Start the server:**
```bash
npm start
```

2. **Open the upload page:**
   - Open `upload-test.html` in your browser
   - Or visit: `file:///C:/Users/danielle/Documents/nlp/upload-test.html`

3. **Upload files:**
   - Click the upload area or drag & drop files
   - Select multiple files at once (up to 10 files)
   - Set the number of questions you want
   - Click "Generate Questions"

4. **View results:**
   - See processing summary
   - Review generated questions
   - Questions are color-coded by difficulty

### Method 2: PowerShell Script

```powershell
# Test with a single file
.\test-file-upload.ps1 -FilePath "path\to\your\file.pdf" -NumQuestions 5

# Test with auto-generated sample
.\test-file-upload.ps1
```

### Method 3: curl/HTTP Request

```bash
curl -X POST http://localhost:3000/generate-from-files \
  -F "files=@document.pdf" \
  -F "files=@presentation.pptx" \
  -F "num_questions=10"
```

### Method 4: PowerShell (Direct HTTP)

```powershell
# Create multipart form data
$filePath = "C:\path\to\document.pdf"
$uri = "http://localhost:3000/generate-from-files"

# Use .NET HttpClient for proper multipart upload
Add-Type -AssemblyName System.Net.Http
$httpClient = New-Object System.Net.Http.HttpClient
$content = New-Object System.Net.Http.MultipartFormDataContent

# Add file
$fileStream = [System.IO.File]::OpenRead($filePath)
$fileContent = New-Object System.Net.Http.StreamContent($fileStream)
$content.Add($fileContent, "files", [System.IO.Path]::GetFileName($filePath))

# Add parameters
$numQuestions = New-Object System.Net.Http.StringContent("5")
$content.Add($numQuestions, "num_questions")

# Send request
$response = $httpClient.PostAsync($uri, $content).Result
$result = $response.Content.ReadAsStringAsync().Result | ConvertFrom-Json

# Display results
$result.questions
```

## 📋 API Reference

### Endpoint: POST /generate-from-files

**Request:**
- **Content-Type:** `multipart/form-data`
- **Body Parameters:**
  - `files` (required): One or more file uploads
  - `num_questions` (optional): Number of questions (1-50, default: 10)

**Response:**
```json
{
  "questions": [
    {
      "questiontext": "What is...?",
      "optiona": "Option A",
      "optionb": "Option B",
      "optionc": "Option C",
      "optiond": "Option D",
      "correctanswer": "A",
      "difficulty": "medium"
    }
  ],
  "metadata": {
    "filesProcessed": 2,
    "filesWithText": 2,
    "totalTextLength": 5432,
    "files": [
      {
        "name": "document.pdf",
        "size": 102400,
        "textLength": 3000,
        "status": "success"
      },
      {
        "name": "presentation.pptx",
        "size": 204800,
        "textLength": 2432,
        "status": "success"
      }
    ]
  }
}
```

## 🔧 How It Works

1. **File Upload:** Files are uploaded to the server via multipart/form-data
2. **Text Extraction:** 
   - PDF files → `pdf-parse` library
   - DOCX files → `mammoth` library
   - DOC/PPT/PPTX → `officeparser` library
   - TXT files → Direct file read
3. **Text Combination:** All extracted text is combined
4. **Question Generation:** Combined text is sent to Gemini API
5. **Cleanup:** Uploaded files are automatically deleted

## 📊 File Processing Details

### PDF Files
- Extracts all text content
- Preserves paragraph structure
- Works with text-based PDFs (not scanned images)

### Word Documents (.docx)
- Extracts body text
- Preserves formatting context
- Handles tables and lists

### PowerPoint (.pptx, .ppt)
- Extracts text from all slides
- Includes slide titles and content
- Processes notes (if any)

### Plain Text (.txt)
- Direct content read
- UTF-8 encoding support

## ⚙️ Limitations

### File Size
- **Maximum per file:** 50 MB
- **Maximum files per request:** 10 files

### Processing Time
- Small files (<1MB): ~5-10 seconds
- Medium files (1-10MB): ~10-20 seconds
- Large files (10-50MB): ~20-30 seconds

### Text Extraction
- **Scanned PDFs:** Text extraction won't work (requires OCR)
- **Complex formatting:** May lose some formatting nuances
- **Images:** Text in images is not extracted
- **Password-protected:** Not supported

## 🎨 Moodle Integration with File Upload

### Option 1: Pre-process Files Server-Side

Modify your Moodle plugin to send extracted text from slides:

```php
protected function call_nlp_service($text, $classengageid, $slideid, $numquestions) {
    $nlpendpoint = get_config('mod_classengage', 'nlpendpoint');
    
    // Use the text-based endpoint (existing functionality)
    $data = array(
        'text' => $text,
        'num_questions' => $numquestions
    );
    
    $options = array(
        'CURLOPT_RETURNTRANSFER' => true,
        'CURLOPT_TIMEOUT' => 60,
        'CURLOPT_HTTPHEADER' => array('Content-Type: application/json'),
    );
    
    $curl = new \curl();
    $response = $curl->post($nlpendpoint, json_encode($data), $options);
    
    // ... rest of processing
}
```

### Option 2: Upload Files Directly from Moodle

If you want to upload files directly from Moodle:

```php
protected function call_nlp_service_with_file($filepath, $classengageid, $slideid, $numquestions) {
    $nlpendpoint = 'http://localhost:3000/generate-from-files';
    
    // Prepare multipart form data
    $boundary = uniqid();
    $delimiter = '-------------' . $boundary;
    
    $data = '';
    
    // Add file
    $filedata = file_get_contents($filepath);
    $filename = basename($filepath);
    
    $data .= "--" . $delimiter . "\r\n"
        . 'Content-Disposition: form-data; name="files"; filename="' . $filename . '"' . "\r\n"
        . "Content-Type: application/octet-stream\r\n\r\n"
        . $filedata . "\r\n";
    
    // Add num_questions
    $data .= "--" . $delimiter . "\r\n"
        . 'Content-Disposition: form-data; name="num_questions"' . "\r\n\r\n"
        . $numquestions . "\r\n";
    
    $data .= "--" . $delimiter . "--\r\n";
    
    // Send request
    $curl = new \curl();
    $response = $curl->post($nlpendpoint, $data, array(
        'CURLOPT_RETURNTRANSFER' => true,
        'CURLOPT_TIMEOUT' => 60,
        'CURLOPT_HTTPHEADER' => array(
            'Content-Type: multipart/form-data; boundary=' . $delimiter,
            'Content-Length: ' . strlen($data)
        ),
    ));
    
    // Parse response
    $result = json_decode($response, true);
    // ... rest of processing
}
```

## 🐛 Troubleshooting

### "No text extracted" error

**Possible causes:**
1. PDF is scanned (image-based) - needs OCR
2. File is corrupted
3. File is password-protected
4. Unsupported file format

**Solution:** Convert to plain text or try a different file

### "File too large" error

**Solution:** 
- Split large files into smaller chunks
- Extract text manually and use `/generate` endpoint
- Compress file if possible

### Upload fails in browser

**Solution:**
- Check if server is running (`npm start`)
- Open browser console (F12) for detailed errors
- Try with a smaller file first
- Check CORS if using different domain

### Extracted text is garbled

**Solution:**
- Check file encoding
- Try re-saving file with UTF-8 encoding
- Convert to DOCX or PDF format

## 📈 Performance Tips

### For Better Question Quality

1. **Clean documents:** Remove headers, footers, page numbers
2. **Structured content:** Use headings and paragraphs
3. **Focus content:** Remove irrelevant sections
4. **Optimal length:** 500-5000 words works best

### For Faster Processing

1. **Smaller files:** Break large documents into chapters
2. **Fewer files:** Combine related content before upload
3. **Right format:** DOCX and TXT are fastest to process

## 🔒 Security Notes

- Files are **automatically deleted** after processing
- Files are stored temporarily in `uploads/` directory
- No files are kept on the server
- Use appropriate file size limits for production

## 📝 Example Use Cases

### Academic Course Materials
```
Upload: lecture_notes.pdf + textbook_chapter.docx
Generate: 20 questions for quiz
```

### Training Presentations
```
Upload: training_slides.pptx
Generate: 15 questions for assessment
```

### Documentation
```
Upload: user_manual.pdf + faq.txt
Generate: 10 questions for comprehension check
```

### Multiple Topics
```
Upload: topic1.pdf + topic2.pdf + topic3.pdf
Generate: 30 questions covering all topics
```

## 🆕 What's New in v2.0

- ✅ Multi-file upload support
- ✅ Automatic text extraction
- ✅ PDF support
- ✅ Word document support (DOC/DOCX)
- ✅ PowerPoint support (PPT/PPTX)
- ✅ Per-file status reporting
- ✅ Combined question generation
- ✅ Beautiful web UI for testing
- ✅ Comprehensive metadata in responses

## 🔮 Future Enhancements

- [ ] OCR support for scanned PDFs
- [ ] Image text extraction
- [ ] Excel spreadsheet support
- [ ] Markdown file support
- [ ] URL/web page scraping
- [ ] Batch processing API
- [ ] Question difficulty targeting
- [ ] Custom question templates

---

**Need help?** Check the main [README.md](README.md) or [MOODLE-TROUBLESHOOTING.md](MOODLE-TROUBLESHOOTING.md)



