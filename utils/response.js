// ============================================================================
// RESPONSE HELPERS - Consistent API response formatting
// ============================================================================

const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../src/constants');
const logger = require('../src/services/logger');

/**
 * Success response helper
 * @param {Object} res - Express response object
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 */
const success = (res, data = null, message = SUCCESS_MESSAGES.SAVED, statusCode = HTTP_STATUS.OK) => {
  const response = {
    ok: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };

  return res.status(statusCode).json(response);
};

/**
 * Created response (201)
 */
const created = (res, data = null, message = SUCCESS_MESSAGES.CREATED) => {
  return success(res, data, message, HTTP_STATUS.CREATED);
};

/**
 * Error response helper
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {any} errors - Additional error details
 */
const error = (res, message = ERROR_MESSAGES.SERVER_ERROR, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = null) => {
  const response = {
    ok: false,
    message,
    statusCode,
    timestamp: new Date().toISOString()
  };

  if (errors) {
    response.errors = errors;
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV !== 'production' && errors) {
    response.debug = errors;
  }

  return res.status(statusCode).json(response);
};

/**
 * Bad Request response (400)
 */
const badRequest = (res, message = ERROR_MESSAGES.INVALID_OPERATION, errors = null) => {
  return error(res, message, HTTP_STATUS.BAD_REQUEST, errors);
};

/**
 * Unauthorized response (401)
 */
const unauthorized = (res, message = ERROR_MESSAGES.AUTH_REQUIRED) => {
  return error(res, message, HTTP_STATUS.UNAUTHORIZED);
};

/**
 * Forbidden response (403)
 */
const forbidden = (res, message = ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS) => {
  return error(res, message, HTTP_STATUS.FORBIDDEN);
};

/**
 * Not Found response (404)
 */
const notFound = (res, message = ERROR_MESSAGES.RESOURCE_NOT_FOUND) => {
  return error(res, message, HTTP_STATUS.NOT_FOUND);
};

/**
 * Conflict response (409)
 */
const conflict = (res, message = ERROR_MESSAGES.DUPLICATE_ENTRY) => {
  return error(res, message, HTTP_STATUS.CONFLICT);
};

/**
 * Validation Error response (422)
 */
const validationError = (res, errors, message = 'שגיאת ולידציה') => {
  return error(res, message, HTTP_STATUS.UNPROCESSABLE_ENTITY, errors);
};

/**
 * Paginated response helper
 * @param {Object} res - Express response object
 * @param {Array} data - Array of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @param {string} message - Success message
 */
const paginated = (res, data, page, limit, total, message = 'נטען בהצלחה') => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const response = {
    ok: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? page + 1 : null,
      prevPage: hasPrevPage ? page - 1 : null
    },
    timestamp: new Date().toISOString()
  };

  return res.status(HTTP_STATUS.OK).json(response);
};

/**
 * No Content response (204)
 */
const noContent = (res) => {
  return res.status(HTTP_STATUS.NO_CONTENT).send();
};

/**
 * Redirect response
 */
const redirect = (res, url, permanent = false) => {
  const statusCode = permanent ? 301 : 302;
  return res.redirect(statusCode, url);
};

/**
 * File download response
 */
const download = (res, filePath, fileName) => {
  return res.download(filePath, fileName, (err) => {
    if (err) {
      logger.error('File download error', { error: err.message, filePath });
      return error(res, 'שגיאה בהורדת הקובץ', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });
};

/**
 * Stream response
 */
const stream = (res, stream, contentType = 'application/octet-stream') => {
  res.setHeader('Content-Type', contentType);
  stream.pipe(res);

  stream.on('error', (err) => {
    logger.error('Stream error', { error: err.message });
    if (!res.headersSent) {
      return error(res, 'שגיאה בהעברת הנתונים', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });
};

/**
 * SSE (Server-Sent Events) response
 */
const sse = (res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial comment to keep connection alive
  res.write(': connected\n\n');

  return {
    send: (data, event = 'message', id = null) => {
      if (id) res.write(`id: ${id}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close: () => {
      res.end();
    }
  };
};

/**
 * Custom response with additional metadata
 */
const custom = (res, statusCode, data) => {
  return res.status(statusCode).json({
    ...data,
    timestamp: new Date().toISOString()
  });
};

/**
 * API info response (for root endpoints)
 */
const apiInfo = (res, version = '2.0', endpoints = []) => {
  return success(res, {
    name: 'Manager Pro API',
    version,
    environment: process.env.NODE_ENV || 'development',
    endpoints,
    documentation: '/api/docs',
    status: 'operational'
  }, 'API is running');
};

/**
 * Health check response
 */
const health = (res, checks = {}) => {
  const allHealthy = Object.values(checks).every(check => check.status === 'ok');
  const statusCode = allHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;

  return res.status(statusCode).json({
    ok: allHealthy,
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks
  });
};

/**
 * Cached response helper
 * Sets cache headers
 */
const cached = (res, data, message, maxAge = 300) => {
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  return success(res, data, message);
};

/**
 * Rate limit exceeded response
 */
const rateLimitExceeded = (res, retryAfter = null) => {
  if (retryAfter) {
    res.setHeader('Retry-After', retryAfter);
  }
  return error(res, ERROR_MESSAGES.TOO_MANY_REQUESTS, HTTP_STATUS.TOO_MANY_REQUESTS);
};

/**
 * Maintenance mode response
 */
const maintenance = (res, message = 'המערכת בתחזוקה, נסה שוב מאוחר יותר') => {
  return error(res, message, HTTP_STATUS.SERVICE_UNAVAILABLE);
};

/**
 * Format validation errors from express-validator
 */
const formatValidationErrors = (errors) => {
  return errors.map(err => ({
    field: err.path || err.param,
    message: err.msg,
    value: err.value
  }));
};

// Export all response helpers
module.exports = {
  success,
  created,
  error,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validationError,
  paginated,
  noContent,
  redirect,
  download,
  stream,
  sse,
  custom,
  apiInfo,
  health,
  cached,
  rateLimitExceeded,
  maintenance,
  formatValidationErrors
};
