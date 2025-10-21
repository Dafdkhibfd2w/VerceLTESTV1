/**
 * Simplified Analytics Service
 * Basic analytics tracking with all required methods
 */

class AnalyticsService {
  constructor() {
    this.events = [];
    this.metrics = new Map();
    this.enabled = true;
  }

  // Core event tracking
  trackEvent(event, properties = {}, options = {}) {
    if (!this.enabled) return;

    try {
      const eventData = {
        event,
        properties: {
          ...properties,
          timestamp: new Date().toISOString()
        },
        metadata: {
          userId: options.userId,
          tenantId: options.tenantId,
          sessionId: options.sessionId,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent
        }
      };

      this.events.push(eventData);

      // Keep only recent events to prevent memory issues
      if (this.events.length > 1000) {
        this.events = this.events.slice(-500);
      }

      console.log(`[ANALYTICS] ${event}:`, properties);
    } catch (error) {
      console.error('Analytics tracking error:', error);
    }
  }

  // Authentication tracking
  trackAuth(action, userId, options = {}) {
    this.trackEvent(`auth_${action}`, {
      userId,
      action,
      ...options
    }, {
      userId,
      ...options
    });
  }

  // Performance tracking
  trackPerformance(operation, duration, metadata = {}, options = {}) {
    this.trackEvent('performance_metric', {
      operation,
      duration,
      ...metadata
    }, options);
  }

  // Error tracking
  trackError(error, context = {}, options = {}) {
    this.trackEvent('error_occurred', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      context
    }, options);
  }

  // Business event tracking
  trackInvoiceEvent(action, invoiceData, options = {}) {
    this.trackEvent(`invoice_${action}`, {
      invoiceId: invoiceData.id || invoiceData._id,
      amount: invoiceData.totalAmount,
      status: invoiceData.status
    }, options);
  }

  trackOrderEvent(action, orderData, options = {}) {
    this.trackEvent(`order_${action}`, {
      orderId: orderData.id || orderData._id,
      amount: orderData.totalAmount,
      status: orderData.status
    }, options);
  }

  trackDispersionEvent(action, dispersionData, options = {}) {
    this.trackEvent(`dispersion_${action}`, {
      dispersionId: dispersionData.id || dispersionData._id,
      status: dispersionData.status
    }, options);
  }

  trackSupplierEvent(action, supplierData, options = {}) {
    this.trackEvent(`supplier_${action}`, {
      supplierId: supplierData.id || supplierData._id,
      name: supplierData.name
    }, options);
  }

  // Metric operations
  incrementCounter(name, value = 1, options = {}) {
    const current = this.metrics.get(name) || 0;
    this.metrics.set(name, current + value);

    this.trackEvent('metric_updated', {
      metricName: name,
      metricType: 'counter',
      value: current + value,
      increment: value
    }, options);
  }

  setGauge(name, value, options = {}) {
    this.metrics.set(name, value);

    this.trackEvent('metric_updated', {
      metricName: name,
      metricType: 'gauge',
      value
    }, options);
  }

  recordHistogram(name, value, options = {}) {
    const key = `${name}_histogram`;
    const samples = this.metrics.get(key) || [];
    samples.push({ value, timestamp: Date.now() });

    // Keep only recent samples
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentSamples = samples.filter(s => s.timestamp > oneHourAgo);
    this.metrics.set(key, recentSamples);

    this.trackEvent('metric_updated', {
      metricName: name,
      metricType: 'histogram',
      value,
      samplesCount: recentSamples.length
    }, options);
  }

  // Dashboard metrics (simplified)
  async getDashboardMetrics(tenantId, timeRange = '24h') {
    return {
      revenue: {
        total: 0,
        growthRate: 0,
        trend: []
      },
      invoices: {
        active: 0,
        changePercent: 0,
        total: 0
      },
      orders: {
        thisWeek: 0,
        changePercent: 0,
        total: 0
      },
      dispersions: {
        active: 0,
        efficiency: 0,
        total: 0
      }
    };
  }

  // Statistics
  getStats() {
    return {
      eventsCount: this.events.length,
      metricsCount: this.metrics.size,
      enabled: this.enabled,
      lastEvent: this.events.length > 0 ? this.events[this.events.length - 1] : null
    };
  }

  // Health check
  healthCheck() {
    return {
      status: this.enabled ? 'healthy' : 'disabled',
      metrics: {
        registered: this.metrics.size,
        events: this.events.length
      },
      timestamp: new Date().toISOString()
    };
  }

  // Control methods
  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  clear() {
    this.events = [];
    this.metrics.clear();
  }

  // Graceful shutdown
  destroy() {
    this.clear();
    this.enabled = false;
    console.log('Analytics service destroyed');
  }
}

// Export singleton instance
const analytics = new AnalyticsService();
module.exports = analytics;
