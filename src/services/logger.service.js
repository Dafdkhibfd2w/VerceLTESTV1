/**
 * Simplified Logger Service
 * Basic logging functionality without external dependencies
 */

class LoggerService {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  // Core logging methods
  error(message, error = null, meta = {}) {
    if (this.shouldLog('error')) {
      const logData = {
        level: 'ERROR',
        message,
        timestamp: new Date().toISOString(),
        meta: this.sanitizeMeta(meta)
      };

      if (error instanceof Error) {
        logData.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
      } else if (error) {
        logData.error = error;
      }

      console.error(this.formatLog(logData));
    }
  }

  warn(message, meta = {}) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatLog({
        level: 'WARN',
        message,
        timestamp: new Date().toISOString(),
        meta: this.sanitizeMeta(meta)
      }));
    }
  }

  info(message, meta = {}) {
    if (this.shouldLog('info')) {
      console.log(this.formatLog({
        level: 'INFO',
        message,
        timestamp: new Date().toISOString(),
        meta: this.sanitizeMeta(meta)
      }));
    }
  }

  debug(message, meta = {}) {
    if (this.shouldLog('debug')) {
      console.log(this.formatLog({
        level: 'DEBUG',
        message,
        timestamp: new Date().toISOString(),
        meta: this.sanitizeMeta(meta)
      }));
    }
  }

  // Specialized logging methods
  security(event, details = {}, meta = {}) {
    this.warn(`[SECURITY] ${event}`, {
      ...this.sanitizeMeta(meta),
      securityEvent: true,
      event,
      details: this.sanitizeMeta(details)
    });
  }

  audit(action, resource, details = {}, meta = {}) {
    this.info(`[AUDIT] ${action} on ${resource}`, {
      ...this.sanitizeMeta(meta),
      auditEvent: true,
      action,
      resource,
      details: this.sanitizeMeta(details)
    });
  }

  performance(operation, duration, meta = {}) {
    this.info(`[PERFORMANCE] ${operation} completed in ${duration}ms`, {
      ...this.sanitizeMeta(meta),
      performanceEvent: true,
      operation,
      duration
    });
  }

  // Utility methods
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatLog(logData) {
    const { level, message, timestamp, meta, error } = logData;
    let output = `${timestamp} [${level}] ${message}`;

    if (meta && Object.keys(meta).length > 0) {
      output += ` | ${JSON.stringify(meta)}`;
    }

    if (error) {
      output += `\nError: ${JSON.stringify(error, null, 2)}`;
    }

    return output;
  }

  sanitizeMeta(meta) {
    if (!meta || typeof meta !== 'object') return {};

    const sanitized = { ...meta };
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'authorization',
      'cookie', 'session', 'csrf', 'api_key', 'access_token'
    ];

    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;

      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          result[key] = sanitizeObject(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return sanitizeObject(sanitized);
  }

  // Error handling
  handleError(error, context = {}) {
    const errorId = this.generateErrorId();

    this.error(error.message || 'Unknown error', error, {
      ...context,
      errorId,
      timestamp: new Date().toISOString()
    });

    return errorId;
  }

  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Performance timing
  time(label, meta = {}) {
    const start = Date.now();
    return {
      end: (additionalMeta = {}) => {
        const duration = Date.now() - start;
        this.performance(label, duration, { ...meta, ...additionalMeta });
        return duration;
      }
    };
  }

  // Health check
  healthCheck() {
    try {
      this.info('Logger health check', { healthCheck: true });
      return {
        status: 'healthy',
        logLevel: this.logLevel,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
const logger = new LoggerService();
module.exports = logger;
