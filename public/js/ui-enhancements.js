/**
 * 🎨 MODERN UI ENHANCEMENTS
 * Professional animations and micro-interactions
 */

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  initAnimations();
  initSkeletonLoaders();
  initMicroInteractions();
  initLazyLoading();
  initTooltips();
  initNotifications();
});

// ===== ANIMATION UTILITIES =====
const AnimationUtils = {
  // Fade in element
  fadeIn: (element, duration = 300) => {
    element.style.opacity = '0';
    element.style.display = 'block';
    
    let start = null;
    const animate = (timestamp) => {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      const opacity = Math.min(progress / duration, 1);
      
      element.style.opacity = opacity;
      
      if (progress < duration) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  },

  // Fade out element
  fadeOut: (element, duration = 300) => {
    let start = null;
    const animate = (timestamp) => {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      const opacity = Math.max(1 - (progress / duration), 0);
      
      element.style.opacity = opacity;
      
      if (progress < duration) {
        requestAnimationFrame(animate);
      } else {
        element.style.display = 'none';
      }
    };
    
    requestAnimationFrame(animate);
  },

  // Slide up element
  slideUp: (element, duration = 300) => {
    element.style.height = element.offsetHeight + 'px';
    element.style.overflow = 'hidden';
    element.style.transition = `height ${duration}ms ease-out`;
    
    requestAnimationFrame(() => {
      element.style.height = '0';
      setTimeout(() => {
        element.style.display = 'none';
        element.style.height = '';
        element.style.overflow = '';
        element.style.transition = '';
      }, duration);
    });
  },

  // Slide down element
  slideDown: (element, duration = 300) => {
    element.style.display = 'block';
    const height = element.scrollHeight;
    element.style.height = '0';
    element.style.overflow = 'hidden';
    element.style.transition = `height ${duration}ms ease-out`;
    
    requestAnimationFrame(() => {
      element.style.height = height + 'px';
      setTimeout(() => {
        element.style.height = '';
        element.style.overflow = '';
        element.style.transition = '';
      }, duration);
    });
  },

  // Scale in element
  scaleIn: (element, duration = 300) => {
    element.style.transform = 'scale(0.9)';
    element.style.opacity = '0';
    element.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
    element.style.display = 'block';
    
    requestAnimationFrame(() => {
      element.style.transform = 'scale(1)';
      element.style.opacity = '1';
    });
  },

  // Bounce element
  bounce: (element) => {
    element.style.animation = 'none';
    requestAnimationFrame(() => {
      element.style.animation = 'bounce 0.5s ease-in-out';
      setTimeout(() => {
        element.style.animation = '';
      }, 500);
    });
  },

  // Shake element
  shake: (element) => {
    element.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => {
      element.style.animation = '';
    }, 500);
  }
};

// ===== SKELETON LOADERS =====
function initSkeletonLoaders() {
  // Function to create skeleton loader
  window.createSkeleton = (type = 'card') => {
    const templates = {
      card: `
        <div class="skeleton-card-layout">
          <div class="skeleton-card-header">
            <div class="skeleton skeleton-avatar"></div>
            <div style="flex: 1;">
              <div class="skeleton skeleton-text" style="width: 60%;"></div>
              <div class="skeleton skeleton-text-sm"></div>
            </div>
          </div>
          <div class="skeleton-card-body">
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text" style="width: 80%;"></div>
          </div>
        </div>
      `,
      list: `
        <div class="skeleton-list">
          ${Array(5).fill().map(() => `
            <div class="skeleton-list-item">
              <div class="skeleton skeleton-avatar"></div>
              <div class="skeleton-list-item-content">
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text-sm"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `,
      stats: `
        <div class="skeleton-stat-card">
          <div class="skeleton skeleton-stat-icon"></div>
          <div class="skeleton-stat-content">
            <div class="skeleton skeleton-text-lg" style="width: 40%;"></div>
            <div class="skeleton skeleton-text"></div>
          </div>
        </div>
      `,
      table: `
        <div class="skeleton-table">
          ${Array(5).fill().map(() => `
            <div class="skeleton-table-row">
              <div class="skeleton skeleton-table-cell"></div>
              <div class="skeleton skeleton-table-cell"></div>
              <div class="skeleton skeleton-table-cell"></div>
              <div class="skeleton skeleton-table-cell"></div>
            </div>
          `).join('')}
        </div>
      `
    };
    
    return templates[type] || templates.card;
  };

  // Function to replace skeleton with content
  window.removeSkeleton = (container, content) => {
    const skeletons = container.querySelectorAll('.skeleton, .skeleton-card-layout, .skeleton-list, .skeleton-table');
    skeletons.forEach(skeleton => {
      AnimationUtils.fadeOut(skeleton, 200);
    });
    
    setTimeout(() => {
      container.innerHTML = content;
      AnimationUtils.fadeIn(container, 300);
    }, 200);
  };
}

// ===== MICRO-INTERACTIONS =====
function initMicroInteractions() {
  // Ripple effect on buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.ripple, .btn');
    if (!btn) return;
    
    const ripple = document.createElement('span');
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple-effect');
    
    // Add ripple styles if not exists
    if (!document.getElementById('ripple-styles')) {
      const style = document.createElement('style');
      style.id = 'ripple-styles';
      style.textContent = `
        .ripple-effect {
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.6);
          transform: scale(0);
          animation: ripple-animation 0.6s ease-out;
          pointer-events: none;
        }
        @keyframes ripple-animation {
          to {
            transform: scale(2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
  });

  // Hover lift effect
  const liftElements = document.querySelectorAll('.hover-lift, .card, .stat-card');
  liftElements.forEach(el => {
    el.addEventListener('mouseenter', () => {
      el.style.transform = 'translateY(-4px)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
    });
  });

  // Interactive elements
  const interactiveElements = document.querySelectorAll('.interactive');
  interactiveElements.forEach(el => {
    el.addEventListener('mousedown', () => {
      el.style.transform = 'scale(0.98)';
    });
    el.addEventListener('mouseup', () => {
      el.style.transform = '';
    });
  });
}

// ===== LAZY LOADING =====
function initLazyLoading() {
  const lazyElements = document.querySelectorAll('.lazy-load');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('loaded');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1
  });
  
  lazyElements.forEach(el => observer.observe(el));
}

// ===== STAGGERED ANIMATIONS =====
function staggerAnimation(elements, delay = 50) {
  elements.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, index * delay);
  });
}

// ===== TOOLTIPS =====
function initTooltips() {
  const tooltipElements = document.querySelectorAll('[data-tooltip]');
  
  tooltipElements.forEach(el => {
    el.addEventListener('mouseenter', (e) => {
      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      tooltip.textContent = el.dataset.tooltip;
      tooltip.style.cssText = `
        position: absolute;
        background: var(--text);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10000;
        pointer-events: none;
        animation: fadeIn 0.2s ease-out;
      `;
      
      document.body.appendChild(tooltip);
      
      const rect = el.getBoundingClientRect();
      tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
      tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
      
      el._tooltip = tooltip;
    });
    
    el.addEventListener('mouseleave', () => {
      if (el._tooltip) {
        el._tooltip.remove();
        el._tooltip = null;
      }
    });
  });
}

// ===== TOAST NOTIFICATIONS =====
const Toast = {
  show: (message, type = 'info', duration = 3000) => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas ${Toast.getIcon(type)}"></i>
      <span>${message}</span>
    `;
    
    // Add toast styles if not exists
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        .toast {
          position: fixed;
          top: 20px;
          right: 20px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: var(--shadow-lg);
          z-index: 10000;
          animation: slideInRight 0.3s ease-out;
          min-width: 300px;
          max-width: 500px;
        }
        .toast i {
          font-size: 20px;
        }
        .toast-success {
          border-color: var(--success);
        }
        .toast-success i {
          color: var(--success);
        }
        .toast-error {
          border-color: var(--error);
        }
        .toast-error i {
          color: var(--error);
        }
        .toast-warning {
          border-color: var(--warning);
        }
        .toast-warning i {
          color: var(--warning);
        }
        .toast-info {
          border-color: var(--info);
        }
        .toast-info i {
          color: var(--info);
        }
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  
  getIcon: (type) => {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    return icons[type] || icons.info;
  },
  
  success: (message, duration) => Toast.show(message, 'success', duration),
  error: (message, duration) => Toast.show(message, 'error', duration),
  warning: (message, duration) => Toast.show(message, 'warning', duration),
  info: (message, duration) => Toast.show(message, 'info', duration)
};

// Export to window for global access
window.Toast = Toast;
window.AnimationUtils = AnimationUtils;
window.staggerAnimation = staggerAnimation;

// ===== LOADING STATE MANAGER =====
const LoadingManager = {
  // Show loading overlay on element
  show: (element, type = 'spinner') => {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = LoadingManager.getLoader(type);
    element.style.position = 'relative';
    element.appendChild(overlay);
    return overlay;
  },
  
  // Hide loading overlay
  hide: (element) => {
    const overlay = element.querySelector('.loading-overlay');
    if (overlay) {
      AnimationUtils.fadeOut(overlay, 200);
      setTimeout(() => overlay.remove(), 200);
    }
  },
  
  // Get loader HTML
  getLoader: (type) => {
    const loaders = {
      spinner: '<div class="spinner spinner-lg"></div>',
      dots: '<div class="loading-dots"><span></span><span></span><span></span></div>',
      wave: '<div class="loading-wave"><span></span><span></span><span></span><span></span><span></span></div>',
      pulse: '<div class="pulse-loader"></div>',
      ripple: '<div class="ripple-loader"></div>'
    };
    return loaders[type] || loaders.spinner;
  }
};

window.LoadingManager = LoadingManager;

// ===== SMOOTH SCROLL =====
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

initSmoothScroll();

// ===== ANIMATIONS ON SCROLL =====
function initScrollAnimations() {
  const animateOnScroll = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
      }
    });
  }, {
    threshold: 0.1
  });
  
  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    animateOnScroll.observe(el);
  });
}

initScrollAnimations();

console.log('🎨 Modern UI Enhancements Loaded');
