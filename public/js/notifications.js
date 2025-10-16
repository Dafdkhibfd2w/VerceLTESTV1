/**
 * Enhanced Notification System
 * Supports toast, push notifications, and in-app alerts
 */

class NotificationManager {
  constructor() {
    this.permission = 'default';
    this.serviceWorkerReady = false;
    this.init();
  }

  async init() {
    // Check for notification support
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return;
    }

    this.permission = Notification.permission;

    // Register service worker for push notifications
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        this.serviceWorkerReady = true;
        console.log('Service Worker registered:', registration);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  /**
   * Request notification permission from user
   */
  async requestPermission() {
    if (this.permission === 'granted') {
      return true;
    }

    try {
      const result = await Notification.requestPermission();
      this.permission = result;
      
      if (result === 'granted') {
        this.showToast('התראות הופעלו בהצלחה', 'success');
        return true;
      } else {
        this.showToast('התראות נדחו', 'warning');
        return false;
      }
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  /**
   * Show toast notification (in-app)
   */
  showToast(message, type = 'info', duration = 4000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas ${icons[type] || icons.info}"></i>
      <span>${message}</span>
    `;

    // Add close button for longer messages
    if (duration > 5000 || message.length > 50) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'toast-close';
      closeBtn.innerHTML = '<i class="fas fa-times"></i>';
      closeBtn.onclick = () => toast.remove();
      toast.appendChild(closeBtn);
    }

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease-out';
      setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) container.remove();
      }, 300);
    }, duration);

    // Play sound for important notifications
    if (type === 'error' || type === 'warning') {
      this.playNotificationSound(type);
    }
  }

  /**
   * Show push notification (system level)
   */
  async showPushNotification(title, options = {}) {
    if (this.permission !== 'granted') {
      console.warn('Push notifications not permitted');
      return;
    }

    const defaultOptions = {
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      requireInteraction: false,
      ...options
    };

    try {
      // If service worker is available, use it
      if (this.serviceWorkerReady) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, defaultOptions);
      } else {
        // Fallback to basic notification
        new Notification(title, defaultOptions);
      }
    } catch (error) {
      console.error('Failed to show push notification:', error);
    }
  }

  /**
   * Show in-app alert (modal-style)
   */
  showAlert(options = {}) {
    const {
      title = 'התראה',
      message = '',
      type = 'info',
      buttons = [{ text: 'אישור', primary: true }],
      icon = null,
      onClose = null
    } = options;

    // Remove existing alert if any
    const existing = document.getElementById('customAlert');
    if (existing) existing.remove();

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle',
      question: 'fa-question-circle'
    };

    const alert = document.createElement('div');
    alert.id = 'customAlert';
    alert.className = 'custom-alert-overlay';
    alert.innerHTML = `
      <div class="custom-alert ${type}">
        <div class="custom-alert-icon">
          <i class="fas ${icon || icons[type] || icons.info}"></i>
        </div>
        <div class="custom-alert-content">
          <h3 class="custom-alert-title">${title}</h3>
          <p class="custom-alert-message">${message}</p>
        </div>
        <div class="custom-alert-buttons">
          ${buttons.map((btn, i) => `
            <button class="btn ${btn.primary ? 'btn-primary' : 'btn-outline'}" 
                    data-index="${i}">
              ${btn.icon ? `<i class="fas ${btn.icon}"></i>` : ''}
              ${btn.text}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(alert);

    // Animate in
    setTimeout(() => alert.classList.add('active'), 10);

    // Handle button clicks
    alert.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const callback = buttons[index].onClick;
        
        if (callback) callback();
        
        this.closeAlert(alert, onClose);
      });
    });

    // Close on overlay click
    alert.addEventListener('click', (e) => {
      if (e.target === alert) {
        this.closeAlert(alert, onClose);
      }
    });
  }

  closeAlert(alertElement, callback) {
    alertElement.classList.remove('active');
    setTimeout(() => {
      alertElement.remove();
      if (callback) callback();
    }, 300);
  }

  /**
   * Show confirmation dialog
   */
  confirm(message, onConfirm, onCancel) {
    this.showAlert({
      title: 'אישור פעולה',
      message,
      type: 'question',
      buttons: [
        {
          text: 'ביטול',
          primary: false,
          onClick: onCancel
        },
        {
          text: 'אישור',
          primary: true,
          icon: 'fa-check',
          onClick: onConfirm
        }
      ]
    });
  }

  /**
   * Play notification sound
   */
  playNotificationSound(type = 'info') {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      // Different frequencies for different types
      const frequencies = {
        info: 440,
        success: 523.25,
        warning: 493.88,
        error: 392
      };

      oscillator.frequency.value = frequencies[type] || frequencies.info;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.2);

      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.2);
    } catch (error) {
      // Silent fail for browsers without audio support
      console.warn('Audio notification failed:', error);
    }
  }

  /**
   * Schedule a notification for later
   */
  async scheduleNotification(title, options = {}, delay = 0) {
    if (delay > 0) {
      setTimeout(() => {
        this.showPushNotification(title, options);
      }, delay);
    } else {
      await this.showPushNotification(title, options);
    }
  }

  /**
   * Show notification based on activity type
   */
  notifyActivity(activity) {
    const messages = {
      invoice_created: 'חשבונית חדשה נוספה',
      invoice_updated: 'חשבונית עודכנה',
      dispersion_created: 'פיזור חדש נוסף',
      order_created: 'הזמנה חדשה נוצרה',
      member_added: 'משתמש חדש הצטרף',
      file_upload: 'קובץ הועלה בהצלחה'
    };

    const message = messages[activity.action] || 'פעולה בוצעה בהצלחה';
    
    // Show in-app toast
    this.showToast(message, 'success');

    // Show push notification if permission granted
    if (this.permission === 'granted') {
      this.showPushNotification('עדכון חדש', {
        body: message,
        tag: activity.action,
        data: activity
      });
    }
  }
}

// Enhanced Progress Indicator
class ProgressIndicator {
  constructor() {
    this.activeOperations = new Map();
  }

  start(id, options = {}) {
    const {
      title = 'מעבד...',
      description = '',
      progress = 0,
      indeterminate = false
    } = options;

    const indicator = this.create(id, title, description, progress, indeterminate);
    this.activeOperations.set(id, indicator);
    
    return indicator;
  }

  update(id, progress, description) {
    const indicator = this.activeOperations.get(id);
    if (!indicator) return;

    const progressBar = indicator.querySelector('.progress-indicator-fill');
    const desc = indicator.querySelector('.progress-indicator-description');

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    if (desc && description) {
      desc.textContent = description;
    }
  }

  complete(id, message) {
    const indicator = this.activeOperations.get(id);
    if (!indicator) return;

    const progressBar = indicator.querySelector('.progress-indicator-fill');
    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.style.background = 'var(--success)';
    }

    if (message) {
      const desc = indicator.querySelector('.progress-indicator-description');
      if (desc) desc.textContent = message;
    }

    setTimeout(() => {
      this.remove(id);
    }, 2000);
  }

  error(id, message) {
    const indicator = this.activeOperations.get(id);
    if (!indicator) return;

    const progressBar = indicator.querySelector('.progress-indicator-fill');
    if (progressBar) {
      progressBar.style.background = 'var(--error)';
    }

    if (message) {
      const desc = indicator.querySelector('.progress-indicator-description');
      if (desc) {
        desc.textContent = message;
        desc.style.color = 'var(--error)';
      }
    }

    setTimeout(() => {
      this.remove(id);
    }, 3000);
  }

  remove(id) {
    const indicator = this.activeOperations.get(id);
    if (!indicator) return;

    indicator.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => {
      indicator.remove();
      this.activeOperations.delete(id);
    }, 300);
  }

  create(id, title, description, progress, indeterminate) {
    const indicator = document.createElement('div');
    indicator.className = 'progress-indicator';
    indicator.id = `progress-${id}`;
    
    indicator.innerHTML = `
      <div class="progress-indicator-content">
        <div class="progress-indicator-header">
          <span class="progress-indicator-title">${title}</span>
          <button class="progress-indicator-close" onclick="window.progressIndicator.remove('${id}')">
            <i class="fas fa-times"></i>
          </button>
        </div>
        ${description ? `<p class="progress-indicator-description">${description}</p>` : ''}
        <div class="progress-indicator-bar">
          <div class="progress-indicator-fill ${indeterminate ? 'indeterminate' : ''}" 
               style="width: ${progress}%"></div>
        </div>
      </div>
    `;

    let container = document.getElementById('progressContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'progressContainer';
      container.className = 'progress-container';
      document.body.appendChild(container);
    }

    container.appendChild(indicator);
    
    // Animate in
    setTimeout(() => indicator.classList.add('active'), 10);

    return indicator;
  }
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotifications);
} else {
  initNotifications();
}

function initNotifications() {
  window.notificationManager = new NotificationManager();
  window.progressIndicator = new ProgressIndicator();

  // Override global showToast
  window.showToast = (message, type, duration) => {
    window.notificationManager?.showToast(message, type, duration);
  };

  console.log('🔔 Notification system initialized');
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotificationManager, ProgressIndicator };
}
