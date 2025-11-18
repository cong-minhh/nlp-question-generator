# NLP Question Generator API

A Node.js service that uses Google's Gemini API (free tier) to automatically generate multiple-choice quiz questions from text input **or uploaded files**.

## Features

- Uses Google Gemini 2.5 Flash (free tier)
- Generates multiple-choice questions with 4 options
- **NEW: File upload support** (PDF, DOC, DOCX, PPT, PPTX, TXT)
- **Multi-file processing** - upload up to 10 files at once
- Assigns difficulty levels (easy, medium, hard)
- Validates and structures output for Moodle integration
- RESTful API with Express
- JSON response format compatible with Moodle
- Beautiful web UI for testing file uploads

## Prerequisites

- Node.js (v14 or higher)
- Google Gemini API key (free tier)

## Getting Your Gemini API Key (Free)

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
cp env.example .env
```

4. Edit `.env` and add your Gemini API key:
```
GEMINI_API_KEY=your_actual_api_key_here
PORT=3000
```

## Usage

### Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your .env file).

### API Endpoints

#### 1. Generate Questions from Text

**POST** `/generate`

Generate quiz questions from text input.

**Request Body:**
```json
{
  "text": "Your educational content here...",
  "num_questions": 10
}
```

**Parameters:**
- `text` (string, required): The text content to generate questions from
- `num_questions` (number, optional): Number of questions to generate (default: 10, max: 50)

**Response:**
```json
{
  "questions": [
    {
      "questiontext": "What is the main topic discussed?",
      "optiona": "First option",
      "optionb": "Second option",
      "optionc": "Third option",
      "optiond": "Fourth option",
      "correctanswer": "A",
      "difficulty": "medium"
    }
  ]
}
```

#### 2. Generate Questions from Files (NEW!)

**POST** `/generate-from-files`

Upload files and generate quiz questions from extracted text.

**Content-Type:** `multipart/form-data`

**Form Parameters:**
- `files` (file[], required): One or more files (PDF, DOC, DOCX, PPT, PPTX, TXT)
- `num_questions` (number, optional): Number of questions to generate (default: 10, max: 50)

**Supported Formats:**
- PDF (.pdf)
- Microsoft Word (.doc, .docx)
- Microsoft PowerPoint (.ppt, .pptx)
- Plain Text (.txt)

**Limits:**
- Maximum 10 files per request
- 50MB maximum per file

**Response:**
```json
{
  "questions": [...],
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
      }
    ]
  }
}
```

#### 3. Health Check

**GET** `/health`

Check if the service is running.

**Response:**
```json
{
  "status": "healthy",
  "service": "NLP Question Generator",
  "version": "2.0.0",
  "features": ["text-input", "file-upload", "multi-file"]
}
```

#### 4. API Documentation

**GET** `/`

Get API documentation and available endpoints.

## Example Usage

### Text Input (Using curl):

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The mitochondria is the powerhouse of the cell. It produces ATP through cellular respiration, which provides energy for cellular processes.",
    "num_questions": 3
  }'
```

### File Upload (Using curl):

```bash
curl -X POST http://localhost:3000/generate-from-files \
  -F "files=@document.pdf" \
  -F "files=@presentation.pptx" \
  -F "num_questions=5"
```

### File Upload (Using PowerShell):

```powershell
.\test-upload-simple.ps1
```

### File Upload (Using Web UI):

1. Open `upload-test.html` in your browser
2. Drag and drop files or click to browse
3. Set number of questions
4. Click "Generate Questions"
5. View results with beautiful formatting

### Using JavaScript (fetch):

```javascript
const response = await fetch('http://localhost:3000/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'Your educational content here...',
    num_questions: 5
  })
});

const data = await response.json();
console.log(data.questions);
```

### Using PHP (for Moodle integration):

```php
$nlpendpoint = 'http://localhost:3000/generate';
$apikey = ''; // Not needed for this service, but kept for compatibility

$data = array(
    'text' => $text,
    'num_questions' => $numquestions
);

$options = array(
    'CURLOPT_RETURNTRANSFER' => true,
    'CURLOPT_TIMEOUT' => 30,
    'CURLOPT_HTTPHEADER' => array(
        'Content-Type: application/json'
    ),
);

$curl = new \curl();
$response = $curl->post($nlpendpoint, json_encode($data), $options);
$result = json_decode($response, true);
```

## Integration with Moodle

1. Start this Node.js service on a server accessible to your Moodle installation
2. In Moodle, configure the NLP endpoint setting to point to your service:
   - Endpoint: `http://your-server:3000/generate`
   - API Key: (optional, can be left empty)

3. The service will return questions in the exact format expected by your `nlp_generator.php` class

## Response Format

Each question in the response includes:

- `questiontext`: The question text
- `optiona`: First answer option
- `optionb`: Second answer option
- `optionc`: Third answer option
- `optiond`: Fourth answer option
- `correctanswer`: The correct answer (A, B, C, or D)
- `difficulty`: Difficulty level (easy, medium, or hard)

## Limitations

### Free Tier Limits:
- 60 requests per minute
- Suitable for moderate usage
- Questions should not exceed context window limits

### Rate Limiting:
If you exceed the rate limit, the API will return an error. Implement retry logic with exponential backoff if needed.

## Error Handling

The API returns appropriate HTTP status codes:

- `200`: Success
- `400`: Bad request (invalid input)
- `500`: Server error (generation failed)

Error response format:
```json
{
  "error": "Error description",
  "message": "Detailed error message"
}
```

## Development

To modify the question generation behavior, edit the `generateQuestions` function in `index.js`. The prompt sent to Gemini can be customized to change:

- Question style and format
- Difficulty distribution
- Number of options
- Question types

## License

GNU General Public License v3.0 or later

## Support

For issues or questions, please check:
- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [Node.js Documentation](https://nodejs.org/docs/)

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- In production, use HTTPS
- Consider implementing authentication/authorization if exposing publicly
- Add rate limiting for production use

