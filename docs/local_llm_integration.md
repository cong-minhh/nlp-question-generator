# Local LLM Integration Guide

This project is designed with a modular architecture that makes it easy to integrate local Large Language Models (LLMs) like Ollama, LocalAI, or LM Studio.

## Overview

To add a local provider, you need to:
1.  Create a new provider class extending `BaseAIProvider`.
2.  Register the new provider in `ProviderManager`.
3.  Update configuration to support the new provider.

## Step 1: Create the Provider Class

Create a new file `providers/localProvider.js`:

```javascript
const BaseAIProvider = require('./baseProvider');
const fetch = require('node-fetch'); // Ensure node-fetch is available

class LocalProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'local';
        this.description = 'Local LLM (Ollama/LocalAI)';
        this.supportedModels = ['llama3', 'mistral', 'gemma']; // Add your models
    }

    validateConfig() {
        // Local providers might not need an API key, but need a base URL
        if (!this.config.baseUrl) {
            // Default to common Ollama port if not set
            this.config.baseUrl = 'http://localhost:11434';
        }
    }

    isConfigured() {
        return !!this.config.baseUrl;
    }

    async generateQuestions(text, options = {}) {
        const numQuestions = options.numQuestions || 10;
        const prompt = this.buildPrompt(text, options);

        // Example for Ollama API
        const response = await fetch(`${this.config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config.model || 'llama3',
                prompt: prompt,
                stream: false,
                format: 'json' // Force JSON mode if supported
            })
        });

        if (!response.ok) {
            throw new Error(`Local API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const rawText = data.response; // Adjust based on API response structure

        // Parse and standardize
        const json = this.safeJSONParse(rawText);
        return this.standardizeResponse(json, numQuestions);
    }

    async testConnection() {
        try {
            // Simple ping or list models request
            const response = await fetch(`${this.config.baseUrl}/api/tags`);
            return {
                success: response.ok,
                message: response.ok ? 'Connected to Local LLM' : 'Failed to connect',
                model: this.config.model || 'unknown'
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
                error: error.message
            };
        }
    }
}

module.exports = LocalProvider;
```

## Step 2: Register in ProviderManager

Edit `providers/providerManager.js`:

1.  Import the new provider:
    ```javascript
    const LocalProvider = require('./localProvider');
    ```

2.  Add to `loadProviders` method:
    ```javascript
    // Load Local Provider
    try {
        const localConfig = {
            baseUrl: process.env.LOCAL_API_URL || 'http://localhost:11434',
            model: process.env.LOCAL_MODEL || 'llama3',
            ...(config.local || {})
        };
        const localProvider = new LocalProvider(localConfig);
        await localProvider.initialize(localConfig);
        this.providers.set('local', localProvider);
        console.log('✓ Local provider loaded');
    } catch (error) {
        console.warn('⚠ Local provider failed to load:', error.message);
    }
    ```

## Step 3: Configuration

Update your `.env` file:

```env
LOCAL_API_URL=http://localhost:11434
LOCAL_MODEL=llama3
```

## Usage

You can now use the local provider via CLI or API:

```bash
# CLI
nlp-qg generate "Some text" --provider=local

# API
POST /api/generate
{
  "text": "Some text",
  "provider": "local"
}
```

## Does it require a lot of code changes?

**No.** The system is built using the **Strategy Pattern**. The `BaseAIProvider` handles all the heavy lifting (prompt building, JSON parsing, validation). You only need to implement the specific API call logic for your local model.
