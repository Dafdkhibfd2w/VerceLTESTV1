/**
 * Enhanced Data Management Functions
 * Advanced features for dashboard
 */

class DataManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.pendingRequests = new Map();
  }

  /**
   * Fetch with caching and deduplication
   */
  async fetch(url, options = {}) {
    const cacheKey = `${url}-${JSON.stringify(options)}`;

    // Check cache first
    if (!options.skipCache) {
      const cached = this.getCached(cacheKey);
      if (cached) {
        console.log('📦 Using cached data for:', url);
        return cached;
      }
    }

    // Check if request is already pending
    if (this.pendingRequests.has(cacheKey)) {
      console.log('⏳ Request already pending, waiting:', url);
      return this.pendingRequests.get(cacheKey);
    }

    // Make new request
    const requestPromise = this.makeRequest(url, options);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const data = await requestPromise;
      
      // Cache successful response
      if (!options.skipCache) {
        this.setCache(cacheKey, data);
      }

      return data;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  async makeRequest(url, options = {}) {
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    };

    // Get CSRF token if needed for POST/PUT/DELETE
    if (['POST', 'PUT', 'DELETE'].includes(options.method?.toUpperCase())) {
      const csrfToken = await this.getCSRFToken();
      defaultOptions.headers['X-CSRF-Token'] = csrfToken;
    }

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };

    const response = await fetch(url, mergedOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getCSRFToken() {
    const cached = this.getCached('csrf-token');
    if (cached) return cached;

    const response = await fetch('/csrf-token');
    const { csrfToken } = await response.json();
    
    this.setCache('csrf-token', csrfToken, 60 * 60 * 1000); // 1 hour
    return csrfToken;
  }

  getCached(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    if (now > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  setCache(key, data, timeout = this.cacheTimeout) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + timeout
    });
  }

  clearCache(pattern) {
    if (pattern) {
      // Clear cache entries matching pattern
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }
}

class ExportManager {
  constructor() {
    this.dataManager = window.dataManager;
  }

  /**
   * Export invoices to Excel
   */
  async exportInvoicesToExcel(month) {
    try {
      window.progressIndicator?.start('export-invoices', {
        title: 'מייצא חשבוניות',
        description: 'מכין קובץ Excel...',
        indeterminate: true
      });

      const response = await fetch(`/api/invoices/export?month=${month}&format=xlsx`, {
        method: 'GET',
        headers: {
          'X-CSRF-Token': await this.dataManager.getCSRFToken()
        }
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      this.downloadBlob(blob, `invoices-${month}.xlsx`);

      window.progressIndicator?.complete('export-invoices', 'הייצוא הושלם!');
      window.showToast?.('הקובץ הורד בהצלחה', 'success');

    } catch (error) {
      console.error('Export error:', error);
      window.progressIndicator?.error('export-invoices', 'שגיאה בייצוא');
      window.showToast?.('שגיאה בייצוא הקובץ', 'error');
    }
  }

  /**
   * Export to PDF
   */
  async exportToPDF(type, id) {
    try {
      window.progressIndicator?.start('export-pdf', {
        title: 'יוצר PDF',
        description: 'מייצר מסמך...',
        indeterminate: true
      });

      const response = await fetch(`/api/${type}/${id}/pdf`, {
        method: 'GET',
        headers: {
          'X-CSRF-Token': await this.dataManager.getCSRFToken()
        }
      });

      if (!response.ok) throw new Error('PDF generation failed');

      const blob = await response.blob();
      this.downloadBlob(blob, `${type}-${id}.pdf`);

      window.progressIndicator?.complete('export-pdf', 'PDF נוצר בהצלחה!');
      window.showToast?.('המסמך הורד בהצלחה', 'success');

    } catch (error) {
      console.error('PDF error:', error);
      window.progressIndicator?.error('export-pdf', 'שגיאה ביצירת PDF');
      window.showToast?.('שגיאה ביצירת המסמך', 'error');
    }
  }

  /**
   * Bulk export
   */
  async bulkExport(items, format = 'xlsx') {
    try {
      const total = items.length;
      let completed = 0;

      window.progressIndicator?.start('bulk-export', {
        title: 'ייצוא מרובה',
        description: `מייצא ${total} פריטים...`,
        progress: 0
      });

      const formData = new FormData();
      formData.append('items', JSON.stringify(items));
      formData.append('format', format);

      const response = await fetch('/api/export/bulk', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': await this.dataManager.getCSRFToken()
        },
        body: formData
      });

      if (!response.ok) throw new Error('Bulk export failed');

      // Stream the response
      const reader = response.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        completed++;
        
        const progress = Math.round((completed / total) * 100);
        window.progressIndicator?.update('bulk-export', progress, 
          `מייצא ${completed} מתוך ${total}...`);
      }

      const blob = new Blob(chunks);
      this.downloadBlob(blob, `bulk-export.${format}`);

      window.progressIndicator?.complete('bulk-export', 'הייצוא הושלם!');
      window.showToast?.('כל הקבצים יוצאו בהצלחה', 'success');

    } catch (error) {
      console.error('Bulk export error:', error);
      window.progressIndicator?.error('bulk-export', 'שגיאה בייצוא');
      window.showToast?.('שגיאה בייצוא הקבצים', 'error');
    }
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

class SearchManager {
  constructor() {
    this.searchTimeout = null;
    this.minSearchLength = 2;
    this.searchDelay = 300;
  }

  /**
   * Advanced search with debounce
   */
  search(query, callback, options = {}) {
    clearTimeout(this.searchTimeout);

    if (query.length < this.minSearchLength) {
      callback([]);
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.performSearch(query, callback, options);
    }, options.delay || this.searchDelay);
  }

  async performSearch(query, callback, options = {}) {
    try {
      const {
        endpoint = '/api/search',
        filters = {},
        limit = 20
      } = options;

      const params = new URLSearchParams({
        q: query,
        limit,
        ...filters
      });

      const response = await fetch(`${endpoint}?${params}`, {
        credentials: 'include'
      });

      const data = await response.json();
      callback(data.results || []);

    } catch (error) {
      console.error('Search error:', error);
      callback([]);
    }
  }

  /**
   * Highlight search terms in text
   */
  highlightText(text, query) {
    if (!query || !text) return text;

    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

class FilterManager {
  constructor() {
    this.activeFilters = new Map();
  }

  /**
   * Add filter
   */
  addFilter(key, value) {
    if (Array.isArray(value)) {
      this.activeFilters.set(key, new Set(value));
    } else {
      this.activeFilters.set(key, value);
    }
    
    this.notifyChange();
  }

  /**
   * Remove filter
   */
  removeFilter(key) {
    this.activeFilters.delete(key);
    this.notifyChange();
  }

  /**
   * Clear all filters
   */
  clearAll() {
    this.activeFilters.clear();
    this.notifyChange();
  }

  /**
   * Get filter object for API
   */
  getFilters() {
    const filters = {};
    
    for (const [key, value] of this.activeFilters) {
      if (value instanceof Set) {
        filters[key] = Array.from(value);
      } else {
        filters[key] = value;
      }
    }
    
    return filters;
  }

  /**
   * Apply filters to data array
   */
  applyFilters(data) {
    if (this.activeFilters.size === 0) return data;

    return data.filter(item => {
      for (const [key, value] of this.activeFilters) {
        if (value instanceof Set) {
          if (!value.has(item[key])) return false;
        } else if (typeof value === 'object' && value.min !== undefined) {
          // Range filter
          if (item[key] < value.min || item[key] > value.max) return false;
        } else {
          if (item[key] !== value) return false;
        }
      }
      return true;
    });
  }

  notifyChange() {
    window.dispatchEvent(new CustomEvent('filtersChanged', {
      detail: this.getFilters()
    }));
  }
}

class SortManager {
  constructor() {
    this.currentSort = {
      field: null,
      direction: 'asc'
    };
  }

  /**
   * Sort data array
   */
  sort(data, field, direction = 'asc') {
    this.currentSort = { field, direction };

    return [...data].sort((a, b) => {
      const aVal = this.getValue(a, field);
      const bVal = this.getValue(b, field);

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      
      if (typeof aVal === 'string') {
        comparison = aVal.localeCompare(bVal, 'he');
      } else if (aVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        comparison = aVal - bVal;
      }

      return direction === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Toggle sort direction
   */
  toggleSort(data, field) {
    const direction = this.currentSort.field === field && this.currentSort.direction === 'asc'
      ? 'desc'
      : 'asc';
    
    return this.sort(data, field, direction);
  }

  getValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }
}

class PaginationManager {
  constructor(pageSize = 20) {
    this.pageSize = pageSize;
    this.currentPage = 1;
    this.totalItems = 0;
  }

  /**
   * Get paginated data
   */
  paginate(data) {
    this.totalItems = data.length;
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    
    return {
      data: data.slice(start, end),
      currentPage: this.currentPage,
      totalPages: Math.ceil(this.totalItems / this.pageSize),
      totalItems: this.totalItems,
      pageSize: this.pageSize,
      hasNext: end < this.totalItems,
      hasPrev: this.currentPage > 1
    };
  }

  /**
   * Go to page
   */
  goToPage(page) {
    const maxPage = Math.ceil(this.totalItems / this.pageSize);
    this.currentPage = Math.max(1, Math.min(page, maxPage));
  }

  nextPage() {
    this.goToPage(this.currentPage + 1);
  }

  prevPage() {
    this.goToPage(this.currentPage - 1);
  }

  reset() {
    this.currentPage = 1;
  }
}

// Initialize managers
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initManagers);
} else {
  initManagers();
}

function initManagers() {
  window.dataManager = new DataManager();
  window.exportManager = new ExportManager();
  window.searchManager = new SearchManager();
  window.filterManager = new FilterManager();
  window.sortManager = new SortManager();
  window.paginationManager = new PaginationManager();

  console.log('🛠️ Data management tools initialized');
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DataManager,
    ExportManager,
    SearchManager,
    FilterManager,
    SortManager,
    PaginationManager
  };
}
