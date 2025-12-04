const BaseAIProvider = require('./baseProvider');
const fetch = require('node-fetch');

class LocalProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'local';
        this.description = 'Local LLM (Ollama/LocalAI)';
        this.supportedModels = ['llama3', 'mistral', 'gemma', 'phi3'];
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

        console.log(`Sending request to Local LLM at ${this.config.baseUrl}...`);

        try {
            // Example for Ollama API
            const response = await fetch(`${this.config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.model || 'llama3',
                    prompt: prompt,
                    stream: false,
                    format: 'json', // Force JSON mode if supported
                    options: {
                        temperature: options.temperature || 0.7
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Local API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const rawText = data.response;

            if (!rawText) {
                throw new Error('Empty response from Local LLM');
            }

            // Parse and standardize
            const json = this.safeJSONParse(rawText);
            return this.standardizeResponse(json, numQuestions);

        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error(`Could not connect to Local LLM at ${this.config.baseUrl}. Is Ollama running?`);
            }
            throw error;
        }
    }

    async testConnection() {
        try {
            // Simple ping or list models request
            const response = await fetch(`${this.config.baseUrl}/api/tags`);

            if (!response.ok) {
                return {
                    success: false,
                    message: `Connected but returned error: ${response.statusText}`,
                    model: this.config.model || 'unknown'
                };
            }

            return {
                success: true,
                message: 'Successfully connected to Local LLM',
                model: this.config.model || 'unknown'
            };
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error.message}`,
                error: error.message
            };
        }
    }
}

module.exports = LocalProvider;
