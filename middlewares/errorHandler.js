// ============================================================================
// ERROR HANDLER - Comprehensive error handling middleware
// ============================================================================

const logger = require('../src/services/logger');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../src/constants');

// ============================================================================
// CUSTOM ERROR CLASSES
// ============================================================================

class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = ERROR_MESSAGES.REQUIRED_FIELD, errors = []) {
    super(message, HTTP_STATUS.BAD_REQUEST);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

class AuthenticationError extends AppError {
  constructor(message = ERROR_MESSAGES.AUTH_REQUIRED) {
    super(message, HTTP_STATUS.UNAUTHORIZED);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS) {
    super(message, HTTP_STATUS.FORBIDDEN);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = ERROR_MESSAGES.RESOURCE_NOT_FOUND) {
    super(message, HTTP_STATUS.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = ERROR_MESSAGES.DUPLICATE_ENTRY) {
    super(message, HTTP_STATUS.CONFLICT);
    this.name = 'ConflictError';
  }
}

class DatabaseError extends AppError {
  constructor(message = ERROR_MESSAGES.DATABASE_ERROR) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    this.name = 'DatabaseError';
  }
}

class RateLimitError extends AppError {
  constructor(message = ERROR_MESSAGES.TOO_MANY_REQUESTS) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS);
    this.name = 'RateLimitError';
  }
}

class FileUploadError extends AppError {
  constructor(message = ERROR_MESSAGES.UPLOAD_FAILED) {
    super(message, HTTP_STATUS.BAD_REQUEST);
    this.name = 'FileUploadError';
  }
}

// ============================================================================
// ERROR HANDLER MIDDLEWARE
// ============================================================================

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';

  // Set defaults
  let error = { ...err };
  error.message = err.message || ERROR_MESSAGES.SERVER_ERROR;
  error.statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // Log error
  if (error.statusCode >= 500) {
    logger.error('Server Error', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id,
      tenantId: req.user?.TenantID
    });
  } else {
    logger.warn('Client Error', {
      message: error.message,
      statusCode: error.statusCode,
      url: req.url,
      method: req.method,
      userId: req.user?._id
    });
  }

  // Handle specific error types
  if (err.name === 'ValidationError' && err.errors) {
    // Mongoose validation error or custom ValidationError
    error.statusCode = HTTP_STATUS.BAD_REQUEST;
    error.message = 'שגיאת ולידציה';

    if (err.errors && typeof err.errors === 'object') {
      error.details = Object.keys(err.errors).map(key => ({
        field: key,
        message: err.errors[key].message || err.errors[key]
      }));
    }
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    error = new ConflictError('רשומה כפולה - נתון זה כבר קיים במערכת');
    const field = Object.keys(err.keyPattern || {})[0];
    if (field) {
      error.message = `${field} כבר קיים במערכת`;
    }
  }

  // MongoDB cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    error = new ValidationError('מזהה לא תקין');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AuthenticationError('טוקן לא תקין');
  }

  if (err.name === 'TokenExpiredError') {
    error = new AuthenticationError(ERROR_MESSAGES.TOKEN_EXPIRED);
  }

  // CSRF token error
  if (err.code === 'EBADCSRFTOKEN') {
    error = new AuthenticationError('Bad CSRF token');
    error.statusCode = HTTP_STATUS.FORBIDDEN;
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      error = new FileUploadError(ERROR_MESSAGES.FILE_TOO_LARGE);
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      error = new FileUploadError('מספר קבצים לא חוקי');
    } else {
      error = new FileUploadError(ERROR_MESSAGES.UPLOAD_FAILED);
    }
  }

  // Build response object
  const response = {
    ok: false,
    message: error.message,
    statusCode: error.statusCode
  };

  // Add additional details in development
  if (!isProd) {
    response.error = {
      name: err.name,
      stack: err.stack,
      details: error.details
    };
  }

  // Add validation errors if present
  if (error.errors) {
    response.errors = error.errors;
  }

  // Add error details if present
  if (error.details) {
    response.details = error.details;
  }

  // Send response
  res.status(error.statusCode).json(response);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`נתיב לא נמצא: ${req.originalUrl}`);

  logger.warn('404 Not Found', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  // For API routes, return JSON
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/auth')) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      ok: false,
      message: error.message,
      statusCode: HTTP_STATUS.NOT_FOUND
    });
  }

  // For page routes, render 404 page if it exists
  res.status(HTTP_STATUS.NOT_FOUND).sendFile(
    require('path').join(__dirname, '../views/404.html')
  );
};

/**
 * Async handler wrapper - catches promise rejections
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create error - helper function
 */
const createError = (message, statusCode = HTTP_STATUS.BAD_REQUEST) => {
  return new AppError(message, statusCode);
};

// ============================================================================
// OPERATIONAL ERROR DETECTION
// ============================================================================

/**
 * Check if error is operational (safe to continue) or programming error
 */
const isOperationalError = (error) => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};

/**
 * Handle critical errors
 */
const handleCriticalError = (error) => {
  logger.error('Critical Error - Shutting down gracefully', {
    message: error.message,
    stack: error.stack
  });

  // Perform cleanup
  process.exit(1);
};

// ============================================================================
// PROCESS ERROR HANDLERS
// ============================================================================

process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', {
    message: error.message,
    stack: error.stack
  });

  handleCriticalError(error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION! 💥', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise
  });

  // In production, we might want to shut down
  if (process.env.NODE_ENV === 'production') {
    handleCriticalError(new Error('Unhandled Rejection'));
  }
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  RateLimitError,
  FileUploadError,

  // Middleware
  errorHandler,
  notFoundHandler,
  asyncHandler,

  // Helpers
  createError,
  isOperationalError,
  handleCriticalError
};
