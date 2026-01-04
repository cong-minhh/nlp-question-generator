/**
 * Enterprise-Grade Logger for NLP Service
 * Provides structured, timestamped logging with severity levels and context.
 */

const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

class Logger {
    constructor(serviceName = 'NLP-Service') {
        this.serviceName = serviceName;
        // Default to INFO in production, DEBUG in dev
        this.minLevel = process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL] : LOG_LEVELS.INFO;
        
        // Ensure log directory exists
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) {
            try {
                fs.mkdirSync(logDir, { recursive: true });
            } catch (e) {
                // Fallback to console if we can't write to filesystem
                console.error('Failed to create log directory', e);
            }
        }
        
        this.logFile = path.join(logDir, `service-${new Date().toISOString().split('T')[0]}.log`);
    }

    /**
     * Format the log message
     */
    format(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${level}] [${this.serviceName}] ${message}${metaStr}`;
    }

    /**
     * Write to file stream (simple append for now)
     */
    write(logString) {
        // Console output
        console.log(logString);
        
        // File output
        try {
            fs.appendFileSync(this.logFile, logString + '\n');
        } catch (e) {
            // Failsafe
        }
    }

    debug(message, meta = {}) {
        if (this.minLevel <= LOG_LEVELS.DEBUG) {
            this.write(this.format('DEBUG', message, meta));
        }
    }

    info(message, meta = {}) {
        if (this.minLevel <= LOG_LEVELS.INFO) {
            this.write(this.format('INFO', message, meta));
        }
    }

    warn(message, meta = {}) {
        if (this.minLevel <= LOG_LEVELS.WARN) {
            this.write(this.format('WARN', message, meta));
        }
    }

    error(message, error = null) {
        if (this.minLevel <= LOG_LEVELS.ERROR) {
            const meta = error ? { 
                error: error.message, 
                stack: error.stack,
                ...error.context 
            } : {};
            this.write(this.format('ERROR', message, meta));
        }
    }
}

// Singleton instance for default usage
const defaultLogger = new Logger();

module.exports = {
    Logger,
    logger: defaultLogger
};
