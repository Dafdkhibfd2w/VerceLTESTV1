/**
 * Enhanced Upload System
 * Manages floating upload window for mobile with drag & drop support
 */

class UploadManager {
  constructor() {
    this.files = [];
    this.uploadType = null;
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedTypes = {
      invoice: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      spreadsheet: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']
    };
    this.init();
  }

  init() {
    this.createFloatingWindow();
    this.attachEventListeners();
  }

  createFloatingWindow() {
    const html = `
      <div class="upload-float-window" id="uploadFloatWindow">
        <div class="upload-float-handle" id="uploadHandle"></div>
        
        <div class="upload-float-header">
          <div class="upload-float-title">
            <i class="fas fa-cloud-upload-alt"></i>
            <span>העלאה מהירה</span>
          </div>
          <button class="upload-float-close" id="uploadFloatClose">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="upload-float-body">
          <!-- Upload Type Selection -->
          <div id="uploadTypeSelection">
            <h4 style="margin-bottom: 16px; color: var(--text); font-size: 16px;">בחר סוג מסמך:</h4>
            <div class="upload-options-grid">
              <div class="upload-option" data-type="invoice">
                <div class="upload-option-icon">
                  <i class="fas fa-file-invoice"></i>
                </div>
                <div class="upload-option-label">חשבונית</div>
                <div class="upload-option-desc">PDF או תמונה</div>
              </div>

              <div class="upload-option" data-type="dispersion">
                <div class="upload-option-icon">
                  <i class="fas fa-taxi"></i>
                </div>
                <div class="upload-option-label">פיזור</div>
                <div class="upload-option-desc">מסמך פיזור</div>
              </div>

              <div class="upload-option" data-type="document">
                <div class="upload-option-icon">
                  <i class="fas fa-file-alt"></i>
                </div>
                <div class="upload-option-label">מסמך כללי</div>
                <div class="upload-option-desc">DOC, PDF</div>
              </div>

              <div class="upload-option" data-type="image">
                <div class="upload-option-icon">
                  <i class="fas fa-image"></i>
                </div>
                <div class="upload-option-label">תמונה</div>
                <div class="upload-option-desc">JPG, PNG, WebP</div>
              </div>

              <div class="upload-option" data-type="spreadsheet">
                <div class="upload-option-icon">
                  <i class="fas fa-table"></i>
                </div>
                <div class="upload-option-label">גיליון אלקטרוני</div>
                <div class="upload-option-desc">Excel, CSV</div>
              </div>

              <div class="upload-option" data-type="other">
                <div class="upload-option-icon">
                  <i class="fas fa-paperclip"></i>
                </div>
                <div class="upload-option-label">אחר</div>
                <div class="upload-option-desc">כל סוג קובץ</div>
              </div>
            </div>
          </div>

          <!-- Drop Zone -->
          <div id="uploadDropZone" class="upload-drop-zone" style="display: none;">
            <div class="upload-drop-icon">
              <i class="fas fa-cloud-upload-alt"></i>
            </div>
            <div class="upload-drop-text">גרור קבצים לכאן</div>
            <div class="upload-drop-hint">או לחץ לבחירת קבצים</div>
            <input type="file" id="uploadFileInput" multiple hidden>
          </div>

          <!-- File Preview -->
          <div id="uploadFilePreview" class="upload-file-preview"></div>

          <!-- Upload Progress -->
          <div id="uploadProgress" class="upload-progress">
            <div class="upload-progress-bar">
              <div class="upload-progress-fill" id="uploadProgressFill" style="width: 0%"></div>
            </div>
            <div class="upload-progress-text" id="uploadProgressText">מעלה קבצים... 0%</div>
          </div>
        </div>

        <div class="upload-float-footer">
          <button class="btn btn-outline" id="uploadCancel">ביטול</button>
          <button class="btn btn-primary" id="uploadSubmit" disabled>
            <i class="fas fa-upload"></i>
            העלה קבצים
          </button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  attachEventListeners() {
    const window = document.getElementById('uploadFloatWindow');
    const closeBtn = document.getElementById('uploadFloatClose');
    const cancelBtn = document.getElementById('uploadCancel');
    const submitBtn = document.getElementById('uploadSubmit');
    const dropZone = document.getElementById('uploadDropZone');
    const fileInput = document.getElementById('uploadFileInput');
    const handle = document.getElementById('uploadHandle');

    // Close window
    closeBtn?.addEventListener('click', () => this.close());
    cancelBtn?.addEventListener('click', () => this.close());

    // Upload type selection
    document.querySelectorAll('.upload-option').forEach(option => {
      option.addEventListener('click', () => {
        this.selectUploadType(option.dataset.type);
      });
    });

    // Drop zone click
    dropZone?.addEventListener('click', () => fileInput?.click());

    // File input change
    fileInput?.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });

    // Drag and drop
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      this.handleFiles(e.dataTransfer.files);
    });

    // Submit upload
    submitBtn?.addEventListener('click', () => this.submitUpload());

    // Handle swipe down to close
    let startY = 0;
    handle?.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });

    handle?.addEventListener('touchmove', (e) => {
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 0) {
        window.style.transform = `translateY(${diff}px)`;
      }
    }, { passive: true });

    handle?.addEventListener('touchend', (e) => {
      const currentY = e.changedTouches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 150) {
        this.close();
      } else {
        window.style.transform = '';
      }
    }, { passive: true });
  }

  open() {
    const window = document.getElementById('uploadFloatWindow');
    window?.classList.add('active');
    this.reset();
  }

  close() {
    const window = document.getElementById('uploadFloatWindow');
    window?.classList.remove('active');
    this.reset();
  }

  reset() {
    this.files = [];
    this.uploadType = null;
    
    document.getElementById('uploadTypeSelection').style.display = 'block';
    document.getElementById('uploadDropZone').style.display = 'none';
    document.getElementById('uploadFilePreview').classList.remove('active');
    document.getElementById('uploadProgress').classList.remove('active');
    document.getElementById('uploadSubmit').disabled = true;
    
    document.querySelectorAll('.upload-option').forEach(opt => {
      opt.classList.remove('active');
    });

    const fileInput = document.getElementById('uploadFileInput');
    if (fileInput) fileInput.value = '';
  }

  selectUploadType(type) {
    this.uploadType = type;
    
    // Update UI
    document.querySelectorAll('.upload-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.type === type);
    });

    // Show drop zone
    setTimeout(() => {
      document.getElementById('uploadTypeSelection').style.display = 'none';
      document.getElementById('uploadDropZone').style.display = 'block';
      
      // Update file input accept attribute
      const fileInput = document.getElementById('uploadFileInput');
      if (fileInput && this.allowedTypes[type]) {
        fileInput.accept = this.allowedTypes[type].join(',');
      }
    }, 300);
  }

  handleFiles(fileList) {
    const filesArray = Array.from(fileList);
    
    // Validate files
    for (const file of filesArray) {
      if (file.size > this.maxFileSize) {
        window.showToast?.(`הקובץ ${file.name} גדול מדי (מקסימום 10MB)`, 'error');
        continue;
      }

      if (this.uploadType !== 'other' && this.allowedTypes[this.uploadType]) {
        if (!this.allowedTypes[this.uploadType].includes(file.type)) {
          window.showToast?.(`סוג הקובץ ${file.name} לא נתמך`, 'error');
          continue;
        }
      }

      this.files.push(file);
    }

    if (this.files.length > 0) {
      this.renderFilePreview();
      document.getElementById('uploadSubmit').disabled = false;
    }
  }

  renderFilePreview() {
    const preview = document.getElementById('uploadFilePreview');
    preview.innerHTML = '';

    this.files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'upload-file-item';
      
      const icon = this.getFileIcon(file.type);
      const size = this.formatFileSize(file.size);

      item.innerHTML = `
        <div class="upload-file-icon">
          <i class="fas ${icon}"></i>
        </div>
        <div class="upload-file-info">
          <div class="upload-file-name">${file.name}</div>
          <div class="upload-file-size">${size}</div>
        </div>
        <button class="upload-file-remove" data-index="${index}">
          <i class="fas fa-times"></i>
        </button>
      `;

      // Remove file handler
      item.querySelector('.upload-file-remove')?.addEventListener('click', () => {
        this.removeFile(index);
      });

      preview.appendChild(item);
    });

    preview.classList.add('active');
  }

  removeFile(index) {
    this.files.splice(index, 1);
    
    if (this.files.length === 0) {
      document.getElementById('uploadFilePreview').classList.remove('active');
      document.getElementById('uploadSubmit').disabled = true;
    } else {
      this.renderFilePreview();
    }
  }

  async submitUpload() {
    if (this.files.length === 0) return;

    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('uploadProgressFill');
    const progressText = document.getElementById('uploadProgressText');
    const submitBtn = document.getElementById('uploadSubmit');

    progressDiv.classList.add('active');
    submitBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('type', this.uploadType);
      
      this.files.forEach((file, index) => {
        formData.append(`files`, file);
      });

      // Get CSRF token
      const csrfRes = await fetch('/csrf-token');
      const { csrfToken } = await csrfRes.json();

      // Upload with progress
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = `${percent}%`;
          progressText.textContent = `מעלה קבצים... ${percent}%`;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          window.showToast?.('הקבצים הועלו בהצלחה!', 'success');
          this.close();
          
          // Refresh relevant section
          if (typeof window.refreshAll === 'function') {
            window.refreshAll();
          }
        } else {
          throw new Error('Upload failed');
        }
      });

      xhr.addEventListener('error', () => {
        throw new Error('Upload failed');
      });

      // Determine upload endpoint based on type
      let endpoint = '/api/upload';
      if (this.uploadType === 'invoice') endpoint = '/api/invoices/upload';
      else if (this.uploadType === 'dispersion') endpoint = '/api/dispersions/upload';

      xhr.open('POST', endpoint);
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);
      window.showToast?.('שגיאה בהעלאת הקבצים', 'error');
      progressDiv.classList.remove('active');
      submitBtn.disabled = false;
    }
  }

  getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return 'fa-image';
    if (mimeType === 'application/pdf') return 'fa-file-pdf';
    if (mimeType.includes('word')) return 'fa-file-word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
    return 'fa-file';
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Enhanced Bottom Navigation
class BottomNavigation {
  constructor() {
    this.currentSection = 'home';
    this.init();
  }

  init() {
    this.createBottomNav();
    this.attachEventListeners();
  }

  createBottomNav() {
    const nav = document.getElementById('bottomNav');
    if (!nav) return;

    const items = [
      { id: 'home', icon: 'fa-home', label: 'בית' },
      { id: 'invoices', icon: 'fa-file-invoice', label: 'חשבוניות', feature: 'invoices' },
      { id: 'upload', icon: 'fa-plus-circle', label: 'העלאה', special: true },
      { id: 'dispersions', icon: 'fa-taxi', label: 'פיזורים', feature: 'dispersions' },
      { id: 'settings', icon: 'fa-cog', label: 'הגדרות' }
    ];

    nav.innerHTML = items.map(item => {
      const featureAttr = item.feature ? `data-feature="${item.feature}"` : '';
      const specialClass = item.special ? ' special' : '';
      
      return `
        <a href="#${item.id}" 
           class="bottom-nav-item${specialClass}" 
           data-section="${item.id}"
           ${featureAttr}>
          <i class="fas ${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      `;
    }).join('');
  }

  attachEventListeners() {
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const section = item.dataset.section;
        
        if (section === 'upload') {
          e.preventDefault();
          window.uploadManager?.open();
        } else {
          this.navigateTo(section);
        }
      });
    });

    // Hide on scroll down, show on scroll up
    let lastScrollTop = 0;
    const nav = document.getElementById('bottomNav');
    
    window.addEventListener('scroll', () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      if (scrollTop > lastScrollTop && scrollTop > 100) {
        nav?.classList.add('hidden');
      } else {
        nav?.classList.remove('hidden');
      }
      
      lastScrollTop = scrollTop;
    }, { passive: true });
  }

  navigateTo(section) {
    this.currentSection = section;
    
    // Update active state
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === section);
    });
  }
}

// Enhanced Loading System
class LoadingManager {
  constructor() {
    this.loaderCount = 0;
    this.messages = [
      { text: 'מחבר למסד נתונים', subtext: 'מאמת חיבור מאובטח' },
      { text: 'טוען נתונים', subtext: 'מביא מידע מהשרת' },
      { text: 'מעבד מסמכים', subtext: 'מנתח ומאמת נתונים' },
      { text: 'כמעט מוכן', subtext: 'סוף הליך העיבוד' }
    ];
    this.currentMessageIndex = 0;
    this.messageInterval = null;
  }

  show(text, subtext, options = {}) {
    this.inject();
    
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingText');
    const subtextEl = document.getElementById('loadingSubtext');

    if (textEl) textEl.textContent = text || 'טוען נתונים...';
    if (subtextEl) subtextEl.textContent = subtext || 'מביא מידע מהשרת';

    if (options.cycleMessages) {
      this.startMessageCycle();
    }

    this.loaderCount++;
    overlay?.classList.add('active');
    document.body.setAttribute('aria-busy', 'true');
    document.body.classList.add('loading');
  }

  hide(force = false) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;

    if (force) {
      this.loaderCount = 0;
    } else {
      this.loaderCount = Math.max(0, this.loaderCount - 1);
    }

    if (this.loaderCount === 0) {
      this.stopMessageCycle();
      overlay.classList.remove('active');
      document.body.removeAttribute('aria-busy');
      document.body.classList.remove('loading');
    }
  }

  inject() {
    if (document.getElementById('loadingOverlay')) return;

    const html = `
      <div id="loadingOverlay" class="loading-overlay">
        <div class="loading-card">
          <div class="loading-spinner"></div>
          <div class="loading-text" id="loadingText">טוען נתונים...</div>
          <div class="loading-subtext" id="loadingSubtext">מביא מידע מהשרת</div>
          <div class="loading-bar"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  startMessageCycle() {
    this.stopMessageCycle();
    this.currentMessageIndex = 0;

    this.messageInterval = setInterval(() => {
      this.currentMessageIndex = (this.currentMessageIndex + 1) % this.messages.length;
      const msg = this.messages[this.currentMessageIndex];
      
      const textEl = document.getElementById('loadingText');
      const subtextEl = document.getElementById('loadingSubtext');
      
      if (textEl) textEl.textContent = msg.text;
      if (subtextEl) subtextEl.textContent = msg.subtext;
    }, 2000);
  }

  stopMessageCycle() {
    if (this.messageInterval) {
      clearInterval(this.messageInterval);
      this.messageInterval = null;
    }
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEnhancements);
} else {
  initEnhancements();
}

function initEnhancements() {
  // Initialize upload manager
  window.uploadManager = new UploadManager();
  
  // Initialize bottom navigation for mobile
  if (window.innerWidth < 768) {
    window.bottomNav = new BottomNavigation();
  }
  
  // Initialize enhanced loading
  window.loadingManager = new LoadingManager();
  
  // Override global loading functions
  window.showLoader = (text, subtext, options) => {
    window.loadingManager?.show(text, subtext, options);
  };
  
  window.hideLoader = (force) => {
    window.loadingManager?.hide(force);
  };
  
  console.log('✨ Enhanced features initialized');
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UploadManager, BottomNavigation, LoadingManager };
}
