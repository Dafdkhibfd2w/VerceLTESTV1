// ========================================
// ADMIN DASHBOARD V2 - VANILLA JS
// ========================================

(() => {
  if (window.__ADMIN_DASHBOARD_INIT__) return;
  window.__ADMIN_DASHBOARD_INIT__ = true;

  // ========================================
  // STATE
  // ========================================
  
  let STATE = {
    tenants: [],
    filteredTenants: [],
    currentView: 'cards',
    filters: {
      search: '',
      teamSize: 'all',
      activity: 'all',
      status: 'all',
      quick: 'all'
    },
    featureCatalog: {},
    charts: {}
  };

  // ========================================
  // TEAM TOKEN & FETCH
  // ========================================
  
  const TEAM_TOKEN =
    new URLSearchParams(location.search).get("token") ||
    localStorage.getItem("teamToken") || "";

  if (TEAM_TOKEN) localStorage.setItem("teamToken", TEAM_TOKEN);

  async function fetchTeam(url, options = {}) {
    const headers = Object.assign(
      { Accept: "application/json" },
      options.headers || {},
      TEAM_TOKEN ? { "x-team-token": TEAM_TOKEN } : {}
    );
    const finalUrl = TEAM_TOKEN
      ? url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(TEAM_TOKEN)
      : url;
    const res = await fetch(finalUrl, { ...options, headers, credentials: "include" });
    return res;
  }

  async function fetchTeamJSON(url, options = {}) {
    const res = await fetchTeam(url, options);
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!ct.includes("application/json")) {
      throw new Error(`Non-JSON from ${url}: ${text.slice(0, 200)}...`);
    }
    const data = JSON.parse(text);
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.message || `HTTP ${res.status}`);
    }
    return data;
  }

  // ========================================
  // CSRF
  // ========================================
  
  async function getCsrfToken() {
    if (window.csrfToken) return window.csrfToken;
    const r = await fetchTeam("/csrf-token", { credentials: "include" });
    const j = await r.json();
    window.csrfToken = j.csrfToken;
    return window.csrfToken;
  }

  // ========================================
  // THEME
  // ========================================
  
  function initTheme() {
    const saved = localStorage.getItem("theme") || "light";
    applyTheme(saved);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    const icon = document.getElementById("themeIcon");
    if (icon) {
      icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
    }
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  }

  // ========================================
  // DATA LOADING
  // ========================================
  
  async function loadFeatureCatalog() {
    const data = await fetchTeamJSON("/api/admin/features-catalog");
    STATE.featureCatalog = data.features || {};
  }

  async function loadTenants() {
    showLoader?.("טוען נתונים...");
    try {
      const data = await fetchTeamJSON("/api/admin/tenants");
      STATE.tenants = data.tenants || [];
      STATE.filteredTenants = [...STATE.tenants];
      updateOverviewStats();
      renderCurrentView();
      renderAnalyticsCharts();
    } catch (err) {
      console.error("Error loading tenants:", err);
      showToast?.("שגיאה בטעינת נתונים", "error");
      showEmptyState("שגיאה בטעינת נתונים");
    } finally {
      hideLoader?.();
    }
  }

  // ========================================
  // OVERVIEW STATS
  // ========================================
  
  function updateOverviewStats() {
    const totalTenants = STATE.tenants.length;
    const totalUsers = STATE.tenants.reduce((sum, t) => sum + (t.stats?.team?.total || 0), 0);
    const totalInvoices = STATE.tenants.reduce((sum, t) => sum + (t.stats?.invoices?.total || 0), 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeToday = STATE.tenants.filter(t => {
      const lastActivity = t.stats?.activity?.lastAction?.date;
      if (!lastActivity) return false;
      const activityDate = new Date(lastActivity);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate.getTime() === today.getTime();
    }).length;

    document.getElementById('totalTenants').textContent = totalTenants;
    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('totalInvoices').textContent = totalInvoices;
    document.getElementById('activeToday').textContent = activeToday;
  }

  // ========================================
  // FILTERS
  // ========================================
  
  function applyFilters() {
    let filtered = [...STATE.tenants];

    // Search
    if (STATE.filters.search) {
      const q = STATE.filters.search.toLowerCase();
      filtered = filtered.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.owner?.name || '').toLowerCase().includes(q) ||
        (t.owner?.email || '').toLowerCase().includes(q)
      );
    }

    // Quick filter
    if (STATE.filters.quick !== 'all') {
      filtered = filtered.filter(t => {
        const badge = getTenantBadge(t);
        return badge === STATE.filters.quick;
      });
    }

    // Team size filter
    if (STATE.filters.teamSize !== 'all') {
      filtered = filtered.filter(t => {
        const teamSize = t.stats?.team?.total || 0;
        if (STATE.filters.teamSize === 'small') return teamSize <= 5;
        if (STATE.filters.teamSize === 'medium') return teamSize > 5 && teamSize <= 15;
        if (STATE.filters.teamSize === 'large') return teamSize > 15;
        return true;
      });
    }

    STATE.filteredTenants = filtered;
    renderCurrentView();
  }

  // ========================================
  // TENANT BADGE LOGIC
  // ========================================
  
  function getTenantBadge(tenant) {
    const createdAt = new Date(tenant.createdAt);
    const now = new Date();
    const daysSinceCreated = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    
    // New (< 30 days)
    if (daysSinceCreated < 30) return 'new';
    
    // Check activity
    const lastActivity = tenant.stats?.activity?.lastAction?.date;
    if (lastActivity) {
      const lastActivityDate = new Date(lastActivity);
      const daysSinceActivity = Math.floor((now - lastActivityDate) / (1000 * 60 * 60 * 24));
      
      // Dormant (30+ days no activity)
      if (daysSinceActivity > 30) return 'inactive';
      
      // Active (activity in last 7 days)
      if (daysSinceActivity <= 7) return 'active';
    }
    
    // Hot (many invoices recent)
    const recentInvoices = tenant.stats?.invoices?.recent || 0;
    if (recentInvoices > 20) return 'active';
    
    return 'active';
  }

  function getBadgeHTML(badge) {
    const badges = {
      new: '<span class="badge badge-new"><i class="fas fa-star"></i> חדש</span>',
      active: '<span class="badge badge-active"><i class="fas fa-fire"></i> פעיל</span>',
      hot: '<span class="badge badge-hot"><i class="fas fa-bolt"></i> Hot</span>',
      inactive: '<span class="badge badge-dormant"><i class="fas fa-moon"></i> לא פעיל</span>'
    };
    return badges[badge] || '';
  }

  // ========================================
  // RENDER VIEWS
  // ========================================
  
  function renderCurrentView() {
    if (STATE.currentView === 'cards') {
      renderCardsView();
    } else if (STATE.currentView === 'table') {
      renderTableView();
    }
  }

  function switchView(view) {
    STATE.currentView = view;
    
    // Update buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Update containers
    document.querySelectorAll('.view-container').forEach(container => {
      container.classList.remove('active');
    });
    
    document.getElementById(`${view}View`).classList.add('active');
    
    renderCurrentView();
  }

  // ========================================
  // CARDS VIEW
  // ========================================
  
  function renderCardsView() {
    const grid = document.getElementById('tenantsGrid');
    
    if (STATE.filteredTenants.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <h3>לא נמצאו עסקים</h3>
          <p>נסה לשנות את הפילטרים</p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = STATE.filteredTenants.map(createTenantCard).join('');
    
    // Add click handlers
    grid.querySelectorAll('.tenant-card').forEach((card, index) => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn')) {
          openTenantDetail(STATE.filteredTenants[index]);
        }
      });
    });
    
    // Action buttons
    grid.querySelectorAll('.btn-manage-features').forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFeaturesSheet(STATE.filteredTenants[index]);
      });
    });
  }

  function createTenantCard(tenant) {
    const stats = tenant.stats || {};
    const team = stats.team || { total: 0, breakdown: {} };
    const invoices = stats.invoices || { total: 0, recent: 0 };
    const dispersions = stats.dispersions || { total: 0 };
    const suppliers = stats.suppliers || { total: 0 };
    const orders = stats.orders || { total: 0 };
    
    const badge = getTenantBadge(tenant);
    const badgeHTML = getBadgeHTML(badge);
    
    const createdDate = new Date(tenant.createdAt).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });

    return `
      <div class="tenant-card" data-tenant-id="${tenant.id}">
        <div class="tenant-card-header">
          <div class="tenant-info">
            <div class="tenant-name">
              <i class="fas fa-building"></i>
              ${escapeHtml(tenant.name)}
            </div>
            <div class="tenant-meta">
              <span><i class="fas fa-user"></i> ${escapeHtml(tenant.owner?.name || '-')}</span>
              <span><i class="fas fa-envelope"></i> ${escapeHtml(tenant.owner?.email || '-')}</span>
              <span><i class="fas fa-calendar"></i> נוצר ${createdDate}</span>
            </div>
          </div>
          <div class="tenant-badges">
            ${badgeHTML}
          </div>
        </div>
        
        <div class="tenant-stats">
          <div class="stat-box">
            <div class="stat-box-icon">👥</div>
            <div class="stat-box-value">${team.total}</div>
            <div class="stat-box-label">צוות</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-icon">🧾</div>
            <div class="stat-box-value">${invoices.total}</div>
            <div class="stat-box-label">חשבוניות</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-icon">📦</div>
            <div class="stat-box-value">${dispersions.total}</div>
            <div class="stat-box-label">פיזורים</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-icon">🚚</div>
            <div class="stat-box-value">${suppliers.total}</div>
            <div class="stat-box-label">ספקים</div>
          </div>
        </div>
        
        <div class="tenant-chart">
          <canvas id="chart-${tenant.id}" height="60"></canvas>
        </div>
        
        <div class="tenant-team">
          ${team.breakdown.owners ? `<span class="team-badge">👑 ${team.breakdown.owners} בעלים</span>` : ''}
          ${team.breakdown.managers ? `<span class="team-badge">⚙️ ${team.breakdown.managers} מנהלים</span>` : ''}
          ${team.breakdown.employees ? `<span class="team-badge">👤 ${team.breakdown.employees} עובדים</span>` : ''}
        </div>
        
        <div class="tenant-actions">
          <button class="action-btn">
            <i class="fas fa-eye"></i>
            צפה
          </button>
          <button class="action-btn btn-manage-features">
            <i class="fas fa-sliders-h"></i>
            פיצ'רים
          </button>
          <button class="action-btn">
            <i class="fas fa-chart-bar"></i>
            דוחות
          </button>
        </div>
      </div>
    `;
  }

  // ========================================
  // TABLE VIEW
  // ========================================
  
  function renderTableView() {
    const table = document.getElementById('tenantsTable');
    
    if (STATE.filteredTenants.length === 0) {
      table.innerHTML = `
        <tbody>
          <tr>
            <td colspan="7" style="text-align: center; padding: 60px;">
              <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>לא נמצאו עסקים</h3>
              </div>
            </td>
          </tr>
        </tbody>
      `;
      return;
    }
    
    table.innerHTML = `
      <thead>
        <tr>
          <th>עסק</th>
          <th>בעלים</th>
          <th>צוות</th>
          <th>חשבוניות</th>
          <th>פעילות</th>
          <th>סטטוס</th>
          <th>פעולות</th>
        </tr>
      </thead>
      <tbody>
        ${STATE.filteredTenants.map(createTableRow).join('')}
      </tbody>
    `;
  }

  function createTableRow(tenant) {
    const stats = tenant.stats || {};
    const team = stats.team || { total: 0 };
    const invoices = stats.invoices || { total: 0, recent: 0 };
    const badge = getTenantBadge(tenant);
    const badgeHTML = getBadgeHTML(badge);
    
    return `
      <tr>
        <td>
          <strong>${escapeHtml(tenant.name)}</strong><br>
          <small style="color: var(--text-secondary);">${new Date(tenant.createdAt).toLocaleDateString('he-IL')}</small>
        </td>
        <td>
          ${escapeHtml(tenant.owner?.name || '-')}<br>
          <small style="color: var(--text-secondary);">${escapeHtml(tenant.owner?.email || '-')}</small>
        </td>
        <td>${team.total}</td>
        <td>
          ${invoices.total}
          ${invoices.recent > 0 ? `<br><small style="color: var(--success);">+${invoices.recent} בחודש</small>` : ''}
        </td>
        <td>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">
            📦 ${stats.dispersions?.total || 0} פיזורים<br>
            🚚 ${stats.suppliers?.total || 0} ספקים
          </div>
        </td>
        <td>${badgeHTML}</td>
        <td>
          <button class="action-btn" onclick="window.adminDashboard.openTenantDetail('${tenant.id}')">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }

  // ========================================
  // HELPERS
  // ========================================
  
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showEmptyState(message) {
    const grid = document.getElementById('tenantsGrid');
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <h3>${message}</h3>
      </div>
    `;
  }

  // ========================================
  // ANALYTICS CHARTS
  // ========================================
  
  function renderAnalyticsCharts() {
    // Team Size Distribution
    renderTeamSizeChart();
    
    // Invoices Trend
    renderInvoicesTrendChart();
    
    // Activity Chart
    renderActivityChart();
    
    // Roles Distribution
    renderRolesChart();
  }

  function renderTeamSizeChart() {
    const ctx = document.getElementById('teamSizeChart');
    if (!ctx) return;
    
    const sizes = { small: 0, medium: 0, large: 0 };
    STATE.tenants.forEach(t => {
      const teamSize = t.stats?.team?.total || 0;
      if (teamSize <= 5) sizes.small++;
      else if (teamSize <= 15) sizes.medium++;
      else sizes.large++;
    });
    
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['קטן (1-5)', 'בינוני (6-15)', 'גדול (16+)'],
        datasets: [{
          data: [sizes.small, sizes.medium, sizes.large],
          backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  function renderInvoicesTrendChart() {
    const ctx = document.getElementById('invoicesTrendChart');
    if (!ctx) return;
    
    // Mock data - you can replace with real data
    const labels = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני'];
    const data = STATE.tenants.map(t => t.stats?.invoices?.total || 0);
    
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'חשבוניות',
          data: [120, 150, 180, 220, 260, 290],
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  function renderActivityChart() {
    const ctx = document.getElementById('activityChart');
    if (!ctx) return;
    
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          label: 'פעילות',
          data: [45, 52, 48, 60, 55, 42, 20],
          backgroundColor: [
            '#f43f5e',
            '#f59e0b',
            '#10b981',
            '#3b82f6',
            '#8b5cf6',
            '#ec4899',
            '#6366f1'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  function renderRolesChart() {
    const ctx = document.getElementById('rolesChart');
    if (!ctx) return;
    
    let owners = 0, managers = 0, employees = 0;
    STATE.tenants.forEach(t => {
      const breakdown = t.stats?.team?.breakdown || {};
      owners += breakdown.owners || 0;
      managers += breakdown.managers || 0;
      employees += breakdown.employees || 0;
    });
    
    new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['בעלים', 'מנהלים', 'עובדים'],
        datasets: [{
          data: [owners, managers, employees],
          backgroundColor: ['#f59e0b', '#3b82f6', '#10b981']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  // ========================================
  // MINI CHARTS IN CARDS
  // ========================================
  
  function renderMiniCharts() {
    STATE.filteredTenants.forEach(tenant => {
      const canvas = document.getElementById(`chart-${tenant.id}`);
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const invoices = tenant.stats?.invoices?.total || 0;
      
      // Simple sparkline data (mock)
      const data = Array.from({ length: 12 }, () => Math.floor(Math.random() * 50) + 10);
      
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: Array.from({ length: 12 }, (_, i) => i + 1),
          datasets: [{
            data,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            x: { display: false },
            y: { display: false }
          }
        }
      });
    });
    
    // Delay to ensure DOM is ready
    setTimeout(() => {
      STATE.filteredTenants.forEach(tenant => {
        const canvas = document.getElementById(`chart-${tenant.id}`);
        if (canvas && !canvas.chart) {
          renderMiniChart(canvas, tenant);
        }
      });
    }, 100);
  }

  function renderMiniChart(canvas, tenant) {
    const ctx = canvas.getContext('2d');
    const data = Array.from({ length: 12 }, () => Math.floor(Math.random() * 50) + 10);
    
    canvas.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({ length: 12 }, (_, i) => i + 1),
        datasets: [{
          data,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  }

  // ========================================
  // MODALS & SHEETS
  // ========================================
  
  function openTenantDetail(tenant) {
    const modal = document.getElementById('tenantDetailModal');
    const modalContent = document.getElementById('modalContent');
    const modalTitle = document.getElementById('modalTenantName');
    
    modalTitle.textContent = tenant.name || 'פרטי עסק';
    
    const stats = tenant.stats || {};
    modalContent.innerHTML = `
      <div style="display: grid; gap: 24px;">
        <div>
          <h4 style="margin-bottom: 12px;">מידע כללי</h4>
          <div style="display: grid; gap: 8px; font-size: 0.9rem;">
            <div><strong>בעלים:</strong> ${escapeHtml(tenant.owner?.name || '-')}</div>
            <div><strong>אימייל:</strong> ${escapeHtml(tenant.owner?.email || '-')}</div>
            <div><strong>טלפון:</strong> ${escapeHtml(tenant.settings?.phone || '-')}</div>
            <div><strong>תאריך יצירה:</strong> ${new Date(tenant.createdAt).toLocaleDateString('he-IL')}</div>
          </div>
        </div>
        
        <div>
          <h4 style="margin-bottom: 12px;">סטטיסטיקות</h4>
          <div class="tenant-stats">
            <div class="stat-box">
              <div class="stat-box-icon">👥</div>
              <div class="stat-box-value">${stats.team?.total || 0}</div>
              <div class="stat-box-label">עובדים</div>
            </div>
            <div class="stat-box">
              <div class="stat-box-icon">🧾</div>
              <div class="stat-box-value">${stats.invoices?.total || 0}</div>
              <div class="stat-box-label">חשבוניות</div>
            </div>
            <div class="stat-box">
              <div class="stat-box-icon">📦</div>
              <div class="stat-box-value">${stats.dispersions?.total || 0}</div>
              <div class="stat-box-label">פיזורים</div>
            </div>
            <div class="stat-box">
              <div class="stat-box-icon">🚚</div>
              <div class="stat-box-value">${stats.suppliers?.total || 0}</div>
              <div class="stat-box-label">ספקים</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    modal.classList.add('active');
  }

  function openFeaturesSheet(tenant) {
    const sheet = document.getElementById('featuresSheet');
    const title = document.getElementById('sheetTitle');
    const list = document.getElementById('featuresList');
    
    title.textContent = `ניהול פיצ'רים - ${tenant.name}`;
    
    // Store current tenant ID for save
    sheet.dataset.tenantId = tenant.id;
    
    // Render features
    list.innerHTML = Object.entries(STATE.featureCatalog).map(([key, meta]) => {
      const enabled = !!(tenant.features && tenant.features[key]);
      
      return `
        <div class="feature-item">
          <i class="fas ${meta.icon || 'fa-star'}"></i>
          <div class="meta">
            <div class="title">${meta.label || key}</div>
            <div class="desc">${meta.desc || ''}</div>
          </div>
          <label class="switch">
            <input type="checkbox" data-key="${key}" ${enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      `;
    }).join('');
    
    sheet.classList.add('active');
  }

  async function saveFeaturesSheet() {
    const sheet = document.getElementById('featuresSheet');
    const tenantId = sheet.dataset.tenantId;
    
    if (!tenantId) return;
    
    // Collect feature states
    const features = {};
    sheet.querySelectorAll('.feature-item input[type="checkbox"]').forEach(input => {
      features[input.dataset.key] = input.checked;
    });
    
    try {
      showLoader?.('שומר שינויים...');
      const csrf = await getCsrfToken();
      
      await fetchTeamJSON(`/api/admin/tenants/${tenantId}/features`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf
        },
        body: JSON.stringify(features)
      });
      
      // Update local state
      const tenant = STATE.tenants.find(t => t.id === tenantId);
      if (tenant) {
        tenant.features = features;
      }
      
      sheet.classList.remove('active');
      showToast?.('השינויים נשמרו בהצלחה', 'success');
    } catch (err) {
      console.error('Error saving features:', err);
      showToast?.('שגיאה בשמירת שינויים', 'error');
    } finally {
      hideLoader?.();
    }
  }

  // ========================================
  // EVENT LISTENERS
  // ========================================
  
  function initEventListeners() {
    // Theme toggle
    document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);
    
    // Search
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    
    searchInput?.addEventListener('input', (e) => {
      STATE.filters.search = e.target.value;
      searchClear.style.display = e.target.value ? 'block' : 'none';
      applyFilters();
    });
    
    searchClear?.addEventListener('click', () => {
      searchInput.value = '';
      STATE.filters.search = '';
      searchClear.style.display = 'none';
      applyFilters();
    });
    
    // Quick filters
    document.querySelectorAll('.quick-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.quick-filter').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        STATE.filters.quick = e.currentTarget.dataset.filter;
        applyFilters();
      });
    });
    
    // View toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        switchView(e.currentTarget.dataset.view);
      });
    });
    
    // Create tenant
    document.getElementById('createTenantBtn')?.addEventListener('click', () => {
      document.getElementById('createTenantModal').classList.add('active');
    });
    
    // Close modals
    document.getElementById('closeDetailModal')?.addEventListener('click', () => {
      document.getElementById('tenantDetailModal').classList.remove('active');
    });
    
    document.getElementById('closeCreateModal')?.addEventListener('click', () => {
      document.getElementById('createTenantModal').classList.remove('active');
    });
    
    document.getElementById('cancelCreate')?.addEventListener('click', () => {
      document.getElementById('createTenantModal').classList.remove('active');
    });
    
    // Close sheet
    document.getElementById('closeSheet')?.addEventListener('click', () => {
      document.getElementById('featuresSheet').classList.remove('active');
    });
    
    document.getElementById('cancelSheet')?.addEventListener('click', () => {
      document.getElementById('featuresSheet').classList.remove('active');
    });
    
    document.getElementById('saveSheet')?.addEventListener('click', saveFeaturesSheet);
    
    // Close on overlay click
    document.querySelectorAll('.modal-overlay, .sheet-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });
  }

  // ========================================
  // INIT
  // ========================================
  
  async function init() {
    initTheme();
    initEventListeners();
    
    try {
      await loadFeatureCatalog();
      await loadTenants();
      
      // Render mini charts after a delay
      setTimeout(renderMiniCharts, 500);
    } catch (err) {
      console.error('Init error:', err);
      showToast?.('שגיאה באתחול המערכת', 'error');
    }
  }

  // ========================================
  // EXPORT PUBLIC API
  // ========================================
  
  window.adminDashboard = {
    openTenantDetail: (id) => {
      const tenant = STATE.tenants.find(t => t.id === id);
      if (tenant) openTenantDetail(tenant);
    },
    reload: loadTenants
  };

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
