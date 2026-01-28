  /**
 * Rate Limiting Middleware
 * Token bucket implementation for Node.js API
 *
 * Provides per-IP rate limiting to prevent abuse and ensure fair resource usage.
 *
 * @module middleware/rateLimiter
 */

const { logger } = require("../utils/logger");

/**
 * Rate Limiter implementation using token bucket algorithm
 */
class RateLimiter {
  /**
   * Create a rate limiter
   * @param {Object} options - Configuration options
   * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
   * @param {number} options.maxRequests - Max requests per window (default: 30)
   * @param {boolean} options.skipSuccessfulRequests - Don't count successful requests (default: false)
   * @param {Function} options.keyGenerator - Function to generate client key (default: uses IP)
   */
  constructor(options = {}) {
    this.windowMs =
      options.windowMs ||
      parseInt(process.env.RATE_LIMIT_WINDOW_MS) ||
      60 * 1000;
    this.maxRequests =
      options.maxRequests || parseInt(process.env.RATE_LIMIT_MAX) || 100;
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;

    // Client tracking map
    this.clients = new Map();

    // Statistics
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      uniqueClients: 0,
    };

    logger.info(
      `Rate limiter initialized: ${this.maxRequests} requests per ${this.windowMs / 1000}s window`,
    );
  }

  /**
   * Default key generator - uses IP address
   * @param {Object} req - Express request object
   * @returns {string} - Client identifier
   */
  defaultKeyGenerator(req) {
    return (
      req.ip ||
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.connection?.remoteAddress ||
      "unknown"
    );
  }

  /**
   * Express middleware function
   * @returns {Function} Express middleware
   */
  middleware() {
    return (req, res, next) => {
      const clientId = this.keyGenerator(req);
      const now = Date.now();

      this.stats.totalRequests++;

      // Get or create client record
      let client = this.clients.get(clientId);

      if (!client || now - client.windowStart >= this.windowMs) {
        // New client or window expired - reset
        client = {
          windowStart: now,
          count: 0,
          isNew: !this.clients.has(clientId),
        };
        if (client.isNew) {
          this.stats.uniqueClients++;
        }
      }

      client.count++;
      this.clients.set(clientId, client);

      // Calculate rate limit info
      const remaining = Math.max(0, this.maxRequests - client.count);
      const resetIn = Math.ceil(
        (client.windowStart + this.windowMs - now) / 1000,
      );
      const resetAt = new Date(
        client.windowStart + this.windowMs,
      ).toISOString();

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", this.maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", resetIn);
      res.setHeader("X-RateLimit-Reset-At", resetAt);

      // Check if over limit
      if (client.count > this.maxRequests) {
        this.stats.blockedRequests++;

        logger.warn(
          `Rate limit exceeded for ${clientId} (${client.count}/${this.maxRequests})`,
        );

        res.setHeader("Retry-After", resetIn);
        return res.status(429).json({
          success: false,
          error: "Too many requests",
          message: `Rate limit exceeded. Please try again in ${resetIn} seconds.`,
          retryAfter: resetIn,
          limit: this.maxRequests,
          windowMs: this.windowMs,
        });
      }

      next();
    };
  }

  /**
   * Get rate limit status for a specific client
   * @param {string} clientId - Client identifier
   * @returns {Object|null} - Client rate limit status
   */
  getClientStatus(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return null;

    const now = Date.now();
    const elapsed = now - client.windowStart;

    if (elapsed >= this.windowMs) {
      return {
        count: 0,
        remaining: this.maxRequests,
        resetIn: this.windowMs / 1000,
        isLimited: false,
      };
    }

    return {
      count: client.count,
      remaining: Math.max(0, this.maxRequests - client.count),
      resetIn: Math.ceil((this.windowMs - elapsed) / 1000),
      isLimited: client.count >= this.maxRequests,
    };
  }

  /**
   * Reset rate limit for a specific client
   * @param {string} clientId - Client identifier
   */
  resetClient(clientId) {
    this.clients.delete(clientId);
    logger.info(`Rate limit reset for ${clientId}`);
  }

  /**
   * Cleanup old client entries periodically
   * @param {number} intervalMs - Cleanup interval (default: 60000)
   */
  startCleanup(intervalMs = 60000) {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, value] of this.clients) {
        // Remove if window expired more than 2x ago
        if (now - value.windowStart >= this.windowMs * 2) {
          this.clients.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(
          `Rate limiter cleanup: removed ${cleaned} expired entries`,
        );
      }
    }, intervalMs);

    // Allow process to exit even if interval is running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    logger.debug(`Rate limiter cleanup started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeClients: this.clients.size,
      config: {
        windowMs: this.windowMs,
        maxRequests: this.maxRequests,
      },
    };
  }

  /**
   * Reset all statistics and client data
   */
  reset() {
    this.clients.clear();
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      uniqueClients: 0,
    };
    logger.info("Rate limiter reset");
  }
}

module.exports = RateLimiter;
