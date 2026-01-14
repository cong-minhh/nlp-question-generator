# API CURL Commands

Here are the `curl` commands for all available endpoints. You can copy and paste these into your terminal.

## Document Processing (File Uploads)

### Inspect Document

Upload a file (PDF, DOCX, PPTX) to get its structure and `docId`.

```bash
curl http://localhost:3000/api/documents/inspect \
  --request POST \
  --header 'Accept: application/json' \
  --header 'Content-Type: multipart/form-data' \
  --form 'file=@/home/danielle/Downloads/Chapter 3 - Solving Problems by Searching.pdf'
```

### Generate Questions from Document

Generate questions using a `docId` obtained from the `/inspect` endpoint.
(Note: System features like caching, parallel processing, and quality checks are enabled by default.)

```bash
curl http://localhost:3000/api/documents/generate \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "docId": "00b18503-d3d3-4859-9f76-0edff30646bb",
    "options": {
      "numQuestions": 10,
      "difficulty": "mixed",
      "bloomLevel": "analyze",
      "difficultyDistribution": {
        "easy": 2,
        "medium": 5,
        "hard": 3
      },
      "bloomDistribution": {
        "remember": 2,
        "analyze": 5,
        "evaluate": 3
      },
      "includeSlides": [1, 2, 3, 5],
      "includeImages": ["image_source_id_1"]
    }
  }'
```

_Note: `difficultyDistribution` and `bloomDistribution` will override standard `difficulty` and `bloomLevel` settings if provided._

---

## Text Generation

### Generate from Text

Generate questions directly from a text string.

```bash
curl http://localhost:3000/api/generate \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "text": "The solar system consists of the Sun and the objects that orbit it.",
    "numQuestions": 5,
    "difficulty": "hard",
    "bloomLevel": "evaluate"
  }'
```

---

## Providers & System

### List Providers

See all configured AI providers.

```bash
curl http://localhost:3000/api/providers
```

### Get Current Provider

Check which provider is currently active.

```bash
curl http://localhost:3000/api/current-provider
```

### Switch Provider

Change the active AI provider (e.g., to `openai`, `anthropic`, `deepseek`).

```bash
curl http://localhost:3000/api/switch-provider \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "provider": "openai"
  }'
```

### Health Check

Verify the server is running.

```bash
curl http://localhost:3000/api/health
```

---

## Debugging

### Debug File Processing

Raw file processing test (returns internal structure).

```bash
curl http://localhost:3000/api/debug/process \
  --request POST \
  --header 'Content-Type: multipart/form-data' \
  --form 'file=@/home/danielle/Downloads/Chapter 3 - Solving Problems by Searching.pdf'
```
