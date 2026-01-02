const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Service to interact with the Python LangExtract bridge
 */
class StructuredExtractor {
    constructor() {
        // Default to the venv python if it exists, otherwise fallback to system python
        const venvPython = path.join(__dirname, 'python', 'venv', 'bin', 'python');
        this.pythonPath = venvPython; 
        this.scriptPath = path.join(__dirname, 'python', 'extract_structured.py');
    }

    /**
     * Set the python executable path (e.g. from venv)
     * @param {string} pythonPath 
     */
    setPythonPath(pythonPath) {
        this.pythonPath = pythonPath;
    }

    /**
     * Extract structured data from a file
     * @param {string} filePath - Absolute path to file
     * @param {string} prompt - Extraction instructions
     * @param {string} [model='gemini-2.0-flash'] - Model ID
     * @returns {Promise<Object>} - The extracted JSON data
     */
    async extract(filePath, prompt, model = 'gemini-2.0-flash') {
        return new Promise((resolve, reject) => {
            const process = spawn(this.pythonPath, [
                this.scriptPath,
                '--file', filePath,
                '--prompt', prompt,
                '--model', model
            ], {
                env: { ...global.process.env } // Pass env vars like API keys
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code !== 0) {
                    try {
                        // Try to parse stderr as JSON if our script sent a structured error
                        const errorJson = JSON.parse(stderr);
                        reject(new Error(errorJson.error || 'Unknown Python error'));
                    } catch (e) {
                         // Otherwise just return the raw stderr
                        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
                    }
                    return;
                }

                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (e) {
                    reject(new Error('Failed to parse Python output: ' + e.message + '\nOutput: ' + stdout));
                }
            });
        });
    }
}

module.exports = new StructuredExtractor();
