/**
 * Enterprise-Grade Logger for NLP Service
 * Provides structured, timestamped logging with severity levels, context, and performance tracking.
 */

const fs = require("fs");
const path = require("path");

const LOG_LEVELS = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

// Console colors for better readability
const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  trace: "\x1b[35m", // Magenta
  debug: "\x1b[36m", // Cyan
  info: "\x1b[32m", // Green
  warn: "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
  timestamp: "\x1b[90m", // Gray
};

class Logger {
  constructor(serviceName = "NLP-Service", context = {}) {
    this.serviceName = serviceName;
    this.context = context; // Preset context for child loggers

    // Parse log level from environment
    const envLevel = (process.env.LOG_LEVEL || "INFO").toUpperCase();
    this.minLevel =
      LOG_LEVELS[envLevel] !== undefined
        ? LOG_LEVELS[envLevel]
        : LOG_LEVELS.INFO;

    // Check if we should use colors (disable in production or if NO_COLOR is set)
    this.useColors =
      process.env.NO_COLOR !== "1" && process.env.NODE_ENV !== "production";

    // Ensure log directory exists
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (e) {
        console.error("Failed to create log directory", e);
      }
    }

    this.logFile = path.join(
      logDir,
      `service-${new Date().toISOString().split("T")[0]}.log`
    );
  }

  /**
   * Create a child logger with additional context
   * @param {Object} additionalContext - Context to merge with parent context
   * @returns {Logger} - New logger instance with merged context
   */
  child(additionalContext = {}) {
    const childLogger = new Logger(this.serviceName, {
      ...this.context,
      ...additionalContext,
    });
    childLogger.minLevel = this.minLevel;
    childLogger.useColors = this.useColors;
    childLogger.logFile = this.logFile;
    return childLogger;
  }

  /**
   * Format the log message for console output (with colors)
   */
  formatConsole(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const mergedMeta = { ...this.context, ...meta };
    const metaStr = Object.keys(mergedMeta).length
      ? ` ${JSON.stringify(mergedMeta)}`
      : "";

    if (this.useColors) {
      const colorKey = level.toLowerCase();
      const levelColor = COLORS[colorKey] || COLORS.reset;
      return `${COLORS.timestamp}[${timestamp}]${COLORS.reset} ${levelColor}[${level}]${COLORS.reset} ${COLORS.dim}[${this.serviceName}]${COLORS.reset} ${message}${COLORS.dim}${metaStr}${COLORS.reset}`;
    }

    return `[${timestamp}] [${level}] [${this.serviceName}] ${message}${metaStr}`;
  }

  /**
   * Format the log message for file output (no colors, structured)
   */
  formatFile(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const mergedMeta = { ...this.context, ...meta };
    const metaStr = Object.keys(mergedMeta).length
      ? ` | ${JSON.stringify(mergedMeta)}`
      : "";
    return `[${timestamp}] [${level}] [${this.serviceName}] ${message}${metaStr}`;
  }

  /**
   * Write to console and file
   */
  write(level, message, meta = {}) {
    const consoleStr = this.formatConsole(level, message, meta);
    const fileStr = this.formatFile(level, message, meta);

    // Console output
    if (level === "ERROR") {
      console.error(consoleStr);
    } else if (level === "WARN") {
      console.warn(consoleStr);
    } else {
      console.log(consoleStr);
    }

    // File output
    try {
      fs.appendFileSync(this.logFile, fileStr + "\n");
    } catch (e) {
      // Failsafe - don't crash if file write fails
    }
  }

  /**
   * TRACE level - Ultra-verbose debugging (only in TRACE mode)
   */
  trace(message, meta = {}) {
    if (this.minLevel <= LOG_LEVELS.TRACE) {
      this.write("TRACE", message, meta);
    }
  }

  /**
   * DEBUG level - Detailed debugging information
   */
  debug(message, meta = {}) {
    if (this.minLevel <= LOG_LEVELS.DEBUG) {
      this.write("DEBUG", message, meta);
    }
  }

  /**
   * INFO level - General operational information
   */
  info(message, meta = {}) {
    if (this.minLevel <= LOG_LEVELS.INFO) {
      this.write("INFO", message, meta);
    }
  }

  /**
   * WARN level - Warning conditions
   */
  warn(message, meta = {}) {
    if (this.minLevel <= LOG_LEVELS.WARN) {
      this.write("WARN", message, meta);
    }
  }

  /**
   * ERROR level - Error conditions
   */
  error(message, error = null) {
    if (this.minLevel <= LOG_LEVELS.ERROR) {
      const meta = error
        ? {
            error: error.message,
            stack: error.stack,
            ...(error.context || {}),
          }
        : {};
      this.write("ERROR", message, { ...this.context, ...meta });
    }
  }

  /**
   * Start a timer for performance measurement
   * @param {string} label - Timer label
   * @returns {Function} - Function to call to stop the timer and log duration
   */
  startTimer(label) {
    const start = process.hrtime.bigint();
    const logger = this;

    return {
      /**
       * Stop timer and log duration at INFO level
       * @param {Object} additionalMeta - Additional metadata to include
       */
      done(additionalMeta = {}) {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;
        logger.info(`${label} completed`, {
          ...additionalMeta,
          durationMs: durationMs.toFixed(2),
        });
        return durationMs;
      },
      /**
       * Stop timer and log duration at DEBUG level
       * @param {Object} additionalMeta - Additional metadata to include
       */
      debug(additionalMeta = {}) {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;
        logger.debug(`${label} completed`, {
          ...additionalMeta,
          durationMs: durationMs.toFixed(2),
        });
        return durationMs;
      },
    };
  }

  /**
   * Log only in development mode
   * @param {string} message - Message to log
   * @param {Object} meta - Metadata
   */
  dev(message, meta = {}) {
    if (process.env.NODE_ENV !== "production") {
      this.debug(`[DEV] ${message}`, meta);
    }
  }

  /**
   * Get current log level name
   * @returns {string} - Current log level
   */
  getLevel() {
    for (const [name, value] of Object.entries(LOG_LEVELS)) {
      if (value === this.minLevel) return name;
    }
    return "UNKNOWN";
  }

  /**
   * Temporarily set log level (useful for testing)
   * @param {string} level - New log level
   */
  setLevel(level) {
    const normalizedLevel = level.toUpperCase();
    if (LOG_LEVELS[normalizedLevel] !== undefined) {
      this.minLevel = LOG_LEVELS[normalizedLevel];
    }
  }
}

// Singleton instance for default usage
const defaultLogger = new Logger();

module.exports = {
  Logger,
  logger: defaultLogger,
  LOG_LEVELS,
};
