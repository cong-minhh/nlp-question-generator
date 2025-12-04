# NLP Question Generator

**Generate high-quality multiple-choice questions from text or files using AI!**

This Node.js service leverages powerful AI models (Google Gemini, OpenAI, Anthropic, Kimi, Kimi CN, Local LLMs) to automatically create educational quizzes. Perfect for teachers, students, and LMS integrations.

## Features

*   **Multi-Provider Support**: Gemini, OpenAI, Anthropic, DeepSeek, Kimi, Kimi CN and **Local LLMs (Ollama)**.
*   **File Uploads**: Support for PDF, DOCX, PPTX, and TXT files.
*   **Fast & Efficient**: Optimized for performance and cost.
*   **Smart Routing**: Automatically selects the best provider based on cost and performance.
*   **Quality Scoring**: Auto-regenerates low-quality questions.
*   **Moodle Ready**: JSON output compatible with Moodle.

## How to Run

### 1. Installation

```bash
# Clone the repository
git clone <https://github.com/cong-minhh/nlp-question-generator>

# Install dependencies
npm install
```

### 2. Configuration

Create a `.env` file in the root directory:

```bash
cp env.example .env
```

Edit the `.env` file and add your API keys (e.g., `GEMINI_API_KEY`, `OPENAI_API_KEY`).

### 3. Start the Server

```bash
npm start
```

The API will be available at `http://localhost:3000`.

### 4. CLI Usage

You can also use the command line interface:

```bash
# Generate from text
node cli/cli.js generate "Your text here"

# Generate from file
node cli/cli.js generate-from-file path/to/document.pdf --provider=local
```

## 🎥 Demo

Check out how easy it is to generate questions!

![Demo Preview](https://via.placeholder.com/800x450.png?text=Demo+Video+Placeholder)

*(Link to full demo video would go here)*

## 📚 API Documentation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/generate` | POST | Generate questions from text |
| `/generate-from-files` | POST | Generate questions from uploaded files |
| `/health` | GET | Check service status |

---

