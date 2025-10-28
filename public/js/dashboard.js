(() => {
  if (window.__DASHBOARD_INIT__) return;
  window.__DASHBOARD_INIT__ = true;

  let tenantData = null;
  let currentSection = "home";

  // ---------- MOBILE DETECTION ----------
  const isMobile = () => window.innerWidth < 768;
  const isTablet = () => window.innerWidth >= 768 && window.innerWidth < 1024;
  const isDesktop = () => window.innerWidth >= 1024;

  // ---------- THEME ----------
  function updateThemeIcon(theme) {
    const icon = document.getElementById("themeIcon");
    if (!icon) return;
    icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    updateThemeIcon(theme);
    window.showToast?.(
      theme === "dark" ? "מצב כהה הופעל" : "מצב בהיר הופעל",
      "info",
      1200,
    );
  }

  function initTheme() {
    const saved = localStorage.getItem("theme");
    const initial = saved === "dark" || saved === "light" ? saved : "light";
    document.documentElement.setAttribute("data-theme", initial);
    updateThemeIcon(initial);
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const icon = document.getElementById('themeIcon');
    if (icon) {
      icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    
    window.showToast?.(
      newTheme === 'dark' ? 'מצב כהה הופעל' : 'מצב בהיר הופעל',
      'info',
      1200
    );
  }

  function setTheme(theme) {
    if (theme !== "light" && theme !== "dark") return;
    applyTheme(theme);
  }

  // ---------- TOUCH FEEDBACK ----------
  function addTouchFeedback() {
    const touchableElements = document.querySelectorAll(
      ".btn, .nav-tab, .card, .member, .invoice-card, .disp-card",
    );

    touchableElements.forEach((el) => {
      el.addEventListener(
        "touchstart",
        () => {
          el.style.opacity = "0.7";
        },
        { passive: true },
      );

      el.addEventListener(
        "touchend",
        () => {
          el.style.opacity = "1";
        },
        { passive: true },
      );

      el.addEventListener(
        "touchcancel",
        () => {
          el.style.opacity = "1";
        },
        { passive: true },
      );
    });
  }

  // ---------- PULL TO REFRESH (Mobile) ----------
  let pullStartY = 0;
  let pullMoveY = 0;
  let isPulling = false;

  function initPullToRefresh() {
    if (!isMobile()) return;

    const content = document.querySelector(".content");
    if (!content) return;

    content.addEventListener(
      "touchstart",
      (e) => {
        if (content.scrollTop === 0) {
          pullStartY = e.touches[0].clientY;
          isPulling = true;
        }
      },
      { passive: true },
    );

    content.addEventListener(
      "touchmove",
      (e) => {
        if (!isPulling) return;

        pullMoveY = e.touches[0].clientY;
        const pullDistance = pullMoveY - pullStartY;

        if (pullDistance > 100 && content.scrollTop === 0) {
          // Trigger refresh
          refreshAll();
          isPulling = false;
        }
      },
      { passive: true },
    );

    content.addEventListener(
      "touchend",
      () => {
        isPulling = false;
        pullStartY = 0;
        pullMoveY = 0;
      },
      { passive: true },
    );
  }

  // ---------- NAV ----------
  const sectionConfig = {
    home: {
      title: "דף הבית",
      subtitle: "לוח בקרה וניהול",
      actionText: "חשבונית חדשה",
      actionIcon: "fa-plus",
    },
    invoices: {
      title: "חשבוניות",
      subtitle: "ניהול חשבוניות",
      actionText: "חשבונית חדשה",
      actionIcon: "fa-plus",
    },
    dispersions: {
      title: "פיזורים",
      subtitle: "ניהול פיזורים",
      actionText: "הוסף פיזור",
      actionIcon: "fa-user-plus",
    },
    suppliers: {
      title: "ספקים",
      subtitle: "ניהול ספקים",
      actionText: "הוסף ספק",
      actionIcon: "fa-plus",
    },
    orders: {
      title: "הזמנות",
      subtitle: "ניהול הזמנות",
      actionText: "הזמנה חדשה",
      actionIcon: "fa-plus",
    },
    reports: {
      title: "דוחות",
      subtitle: "דוחות וסטטיסטיקות",
      actionText: "ייצא דוח",
      actionIcon: "fa-download",
    },
    settings: {
      title: "הגדרות",
      subtitle: "הגדרות מערכת",
      actionText: "שמור שינויים",
      actionIcon: "fa-save",
    },
      shifts: {
      title: "ניהול משמרות",
      subtitle: "ניהול משמרות",
      actionText: "שמור שינויים",
      actionIcon: "fa-save",
    },
  };

  const bottomNavItems = [
    { section: "home", label: "בית", icon: "fa-house" },
    { section: "settings", label: "הגדרות", icon: "fa-gear" },
    {
      section: "invoices",
      label: "חשבוניות",
      icon: "fa-file-invoice",
      feature: "invoices",
    },
  ];

  const moreMenuItems = [
    {
      section: "dispersions",
      label: "פיזורים",
      icon: "fa-taxi",
      feature: "dispersions",
    },
    {
      section: "suppliers",
      label: "ספקים",
      icon: "fa-building",
      feature: "suppliers",
    },
    {
      section: "orders",
      label: "הזמנות",
      icon: "fa-briefcase",
      feature: "orders",
    },
    {
      section: "reports",
      label: "דוחות",
      icon: "fa-chart-bar",
      feature: "reports",
    },
  ];

  const quickUploadItems = [
    {
      id: "upload-invoice",
      label: "חשבונית",
      icon: "fa-file-invoice",
      feature: "invoices",
      action: "invoice",
    },
    {
      id: "upload-dispersion",
      label: "פיזור",
      icon: "fa-taxi",
      feature: "dispersions",
      action: "dispersion",
    },
    {
      id: "add-supplier",
      label: "ספק",
      icon: "fa-building",
      feature: "suppliers",
      action: "supplier",
    },
    {
      id: "add-order",
      label: "הזמנה",
      icon: "fa-briefcase",
      feature: "orders",
      action: "order",
    },
  ];

  function timeAgo(ts) {
    const d = new Date(ts).getTime();
    const s = Math.floor((Date.now() - d) / 1000);
    if (s < 60) return "הרגע";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} דק'`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} שע'`;
    const dd = Math.floor(h / 24);
    return `${dd} ימ'`;
  }

  function renderAction(l) {
    const t = l?.target?.label || l?.target?.email || l?.target?.id || "";
    const by = l?.actor?.name || l?.actor?.email || "משתמש";
    const map = {
      "member:create": `${by} הוסיף משתמש <bdi>${escapeHtml(t)}</bdi>`,
      "member:add_to_tenant": `${by} העניק גישה למשתמש <bdi>${escapeHtml(t)}</bdi>`,
      "member:update": `${by} עדכן משתמש <bdi>${escapeHtml(t)}</bdi>`,
      "tenant:update": `${by} עדכן את פרטי העסק`,
    };
    return (
      map[l.action] ||
      `${by} · ${escapeHtml(l.action)}${t ? " · " + escapeHtml(t) : ""}`
    );
  }

  function renderLogs(items) {
    const wrap = document.getElementById("logsList");
    if (!wrap) return;
    if (!items.length) {
      wrap.innerHTML = `<div class="empty">אין פעילות אחרונה</div>`;
      return;
    }
    wrap.innerHTML = items
      .map(
        (l) => `
      <div class="log">
        <i class="fas fa-circle-dot dot"></i>
        <div class="what">${renderAction(l)}</div>
        <div class="when" title="${new Date(l.createdAt).toLocaleString("he-IL")}">${timeAgo(l.createdAt)}</div>
      </div>
    `,
      )
      .join("");
  }

  async function loadLogs() {
    try {
      const r = await fetch("/api/logs?limit=30", { credentials: "include" });
      const data = await r.json();
      if (!data?.ok) throw 0;
      renderLogs(data.logs || []);
    } catch (e) {
      renderLogs([]);
    }
  }

  function toggleQuickUploadMenu() {
    let menu = document.getElementById("quickUploadMenu");
    if (!menu) {
      menu = createQuickUploadMenu();
      document.body.appendChild(menu);
    }

    const isVisible = !menu.classList.contains("hidden");
    if (isVisible) {
      menu.classList.add("hidden");
    } else {
      // Close more menu if open
      const moreMenu = document.getElementById("moreMenu");
      if (moreMenu) moreMenu.classList.add("hidden");

      menu.classList.remove("hidden");
    }
  }

  function closeAllPopupMenus() {
    const quickMenu = document.getElementById("quickUploadMenu");
    const moreMenu = document.getElementById("moreMenu");
    if (quickMenu) quickMenu.classList.add("hidden");
    if (moreMenu) moreMenu.classList.add("hidden");
  }

  function closeAllModals() {
    // Close all modals
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.classList.add("hidden");
      modal.style.display = "none";
    });
    document.body.classList.remove("modal-open");

    // Reset modal-specific states
    editingMemberId = null;
    editingDispersionId = null;
  }

  function createQuickUploadMenu() {
    const menu = document.createElement("div");
    menu.id = "quickUploadMenu";
    menu.className = "popup-menu hidden";

    const feats = tenantData?.features || {};
    const items = quickUploadItems
      .filter((item) => !item.feature || feats[item.feature])
      .map(
        (item) => `
        <button class="popup-menu-item" data-action="${item.action}">
          <i class="fas ${item.icon}"></i>
          <span>${item.label}</span>
        </button>
      `,
      )
      .join("");

    menu.innerHTML = `
      <div class="popup-menu-content">
        ${items || '<div class="empty">אין פריטים זמינים</div>'}

      </div>
    `;

    // Bind actions
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest(".popup-menu-item");
      if (!btn) return;

      const action = btn.dataset.action;
      menu.classList.add("hidden");

      handleQuickUpload(action);
    });

    // Close on outside click
    menu.addEventListener("click", (e) => {
      if (e.target === menu) {
        menu.classList.add("hidden");
      }
    });

    return menu;
  }

  function handleQuickUpload(action) {
    // Close the popup menu first
    const quickMenu = document.getElementById("quickUploadMenu");
    if (quickMenu) quickMenu.classList.add("hidden");

    switch (action) {
      case "invoice":
        // For invoice, just trigger the button
        if (currentSection !== "invoices") {
          // Wait for section to load, then click
          setTimeout(() => {
            document.getElementById("btnUploadInvoicee")?.click();
          }, 200);
        } else {
          document.getElementById("btnUploadInvoicee")?.click();
        }
        break;

      case "dispersion":
        if (currentSection !== "dispersions") {
          setTimeout(() => {
            document.getElementById("disaddbtn")?.click();
          }, 200);
        } else {
          document.getElementById("disaddbtn")?.click();
        }
        break;

      case "supplier":
        if (currentSection !== "suppliers") {
          setTimeout(() => {
            openAddSupplierModal();
          }, 200);
        } else {
openAddSupplierModal();
        }
        break;

      case "order":
        // Just navigate to orders page
        location.hash = "#orders";
        break;

      default:
        window.showToast?.("פעולה זו עדיין לא זמינה", "info");
    }
  }

  function toggleMoreMenu() {
    let menu = document.getElementById("moreMenu");
    if (!menu) {
      menu = createMoreMenu();
      document.body.appendChild(menu);
    }

    const isVisible = !menu.classList.contains("hidden");
    if (isVisible) {
      menu.classList.add("hidden");
    } else {
      // Close quick upload menu if open
      const quickMenu = document.getElementById("quickUploadMenu");
      if (quickMenu) quickMenu.classList.add("hidden");

      menu.classList.remove("hidden");
    }
  }

  function createMoreMenu() {
    const menu = document.createElement("div");
    menu.id = "moreMenu";
    menu.className = "popup-menu hidden";

    const feats = tenantData?.features || {};
    const items = moreMenuItems
      .filter((item) => !item.feature || feats[item.feature])
      .map(
        (item) => `
        <button class="popup-menu-item" data-section="${item.section}">
          <i class="fas ${item.icon}"></i>
          <span>${item.label}</span>
        </button>
      `,
      )
      .join("");

    menu.innerHTML = `
      <div class="popup-menu-content">
        ${items || '<div class="empty">אין פריטים זמינים</div>'}
      </div>
    `;

    // Bind navigation
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest(".popup-menu-item");
      if (!btn) return;

      const section = btn.dataset.section;
      menu.classList.add("hidden");

      if (location.hash !== `#${section}`) location.hash = `#${section}`;
      else navigateToSection(section);
    });

    // Close on outside click
    menu.addEventListener("click", (e) => {
      if (e.target === menu) {
        menu.classList.add("hidden");
      }
    });

    return menu;
  }

  function renderBottomNav() {
    const el = document.getElementById("bottomNav");
    if (!el) return;
    const feats = tenantData?.features || {};

    const home = bottomNavItems.find((i) => i.section === "home");
    const invoices = bottomNavItems.find((i) => i.section === "invoices");
    const settings = bottomNavItems.find((i) => i.section === "settings");

    const renderBtn = (item) => {
      if (!item) return "";
      const disabled = item.feature ? !feats[item.feature] : false;
      return `
      <button class="nav-tab"
              data-section="${item.section}"
              ${disabled ? 'aria-disabled="true"' : ""}
              ${currentSection === item.section ? 'aria-current="page"' : ""}>
        <i class="fas ${item.icon}"></i>
        <span>${item.label}</span>
      </button>`;
    };

    let html = "";

    // סדר חדש: בית → חשבוניות
    [home, invoices].forEach((item) => {
      html += renderBtn(item);
    });

    // כפתור הפלוס במרכז
    html += `
    <button class="nav-tab nav-tab-plus" id="quickUploadBtn" aria-label="העלאות מהירות">
      <i class="fas fa-plus"></i>
      <span>הוסף</span>
    </button>`;

    // אחריו: הגדרות
    html += renderBtn(settings);

    // ולבסוף: כפתור "עוד"
    html += `
    <button class="nav-tab nav-tab-more" id="moreMenuBtn" aria-label="עוד">
      <i class="fas fa-ellipsis-h"></i>
      <span>עוד</span>
    </button>`;

    el.innerHTML = html;

    // Bind navigation events
    el.querySelectorAll(".nav-tab[data-section]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const s = btn.getAttribute("data-section");
        if (btn.getAttribute("aria-disabled") === "true") {
          window.showToast?.("המודול כבוי לעסק זה", "warning");
          return;
        }
        if (location.hash !== `#${s}`) location.hash = `#${s}`;
        else navigateToSection(s);
      });
    });

    // Bind quick upload button
    const quickUploadBtn = document.getElementById("quickUploadBtn");
    if (quickUploadBtn) {
      quickUploadBtn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleQuickUploadMenu();
      });
    }

    // Bind more menu button
    const moreMenuBtn = document.getElementById("moreMenuBtn");
    if (moreMenuBtn) {
      moreMenuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleMoreMenu();
      });
    }
  }

  function applyBottomNavGates() {
    const el = document.getElementById("bottomNav");
    if (!el) return;
    const feats = tenantData?.features || {};
    el.querySelectorAll(".nav-tab").forEach((btn) => {
      const sec = btn.getAttribute("data-section");
      const item = bottomNavItems.find((i) => i.section === sec);
      const need = item?.feature;
      const on = need ? !!feats[need] : true;
      btn.classList.toggle("disabled", !on);
      btn.setAttribute("aria-disabled", String(!on));
    });
  }

  function setActiveNav(sectionName) {
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle(
        "active",
        item.getAttribute("data-section") === sectionName,
      );
    });
    document.querySelectorAll("#bottomNav .nav-tab").forEach((btn) => {
      const isActive = btn.getAttribute("data-section") === sectionName;
      btn.classList.toggle("active", isActive);
      if (isActive) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
  }

  function updateHeaderForSection(sectionName) {
    const cfg = sectionConfig[sectionName] || sectionConfig.home;
    const titleEl = document.getElementById("sectionTitle");
    const subEl = document.getElementById("sectionSubtitle");
    const actionBtn = document.getElementById("primaryActionBtn");
    const actionText = document.getElementById("primaryActionText");

    if (titleEl) titleEl.textContent = cfg.title;
    if (subEl) subEl.textContent = cfg.subtitle;
    if (actionText) actionText.textContent = cfg.actionText;
    if (actionBtn) {
      const i = actionBtn.querySelector("i");
      if (i) i.className = `fas ${cfg.actionIcon}`;
      actionBtn.dataset.section = sectionName;
    }
  }

  function navigateToSection(sectionName) {
    const el = document.getElementById(`section-${sectionName}`);
    if (el && el.matches("[data-feature].disabled")) {
      window.showToast?.("אין לך גישה לעמוד זה", "warning");
      location.hash = "#home";
      return;
    }

    // Close all popup menus and modals when navigating
    closeAllPopupMenus();
    closeAllModals();

    // Scroll to top on mobile when changing sections
    if (isMobile()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document
      .querySelectorAll(".section")
      .forEach((s) => s.classList.remove("active"));
    if (el) el.classList.add("active");
    setActiveNav(sectionName);
    updateHeaderForSection(sectionName);
    currentSection = sectionName;
  }

  function handleHashRoute() {
    const raw = (location.hash || "#home").slice(1);
    const section = sectionConfig[raw] ? raw : "home";
    navigateToSection(section);
  }

  function bindNavEvents() {
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const s = item.getAttribute("data-section") || "home";
        if (location.hash !== `#${s}`) location.hash = `#${s}`;
        else navigateToSection(s);
      });
    });
    window.addEventListener("hashchange", handleHashRoute);
  }

  // ---------- USER / TENANT ----------
  async function loadCurrentUser() {
    try {
      const res = await fetch("/me", { credentials: "include" });
      const data = await res.json();
      if (data?.ok && data.user) {
        setUserUI(data.user);
        return data.user;
      }
    } catch {}
    setUserUI({ username: "אורח", role: "user" });
  }

  function setUserUI(user) {
    const nameEl = document.getElementById("currentUserName");
    const roleEl = document.getElementById("currentUserRole");
    if (nameEl) nameEl.textContent = user.username || user.name || "משתמש";
    if (roleEl) roleEl.textContent = user.role || "משתמש";
  }

async function loadTenant() {
  try {
    // 1. טען מידע בסיסי
    const infoRes = await fetch("/api/tenant/info", { credentials: "include" });
    const data = await infoRes.json();
    
    if (!infoRes.ok) throw new Error(data?.message || `HTTP ${infoRes.status}`);
    
    // 2. נרמל את המידע הבסיסי
    tenantData = normalizeTenant(data);


    // 4. רנדר הכל מחדש
    renderTenant();
    renderTeamList(getCombinedTeam(tenantData.team, tenantData.invites));
    applyFeatureGates();

    return tenantData;
  } catch (e) {
    console.error("loadTenant error:", e);
    showToast?.("שגיאה בטעינת נתונים", "error");
  }
}
function normalizeTenant(payload) {
  const t = payload?.tenant || {};
  const owner = payload?.owner || null;

  const rawCombined = Array.isArray(payload?.team) 
    ? payload.team 
    : (Array.isArray(payload?.teamMembers) ? payload.teamMembers 
    : (Array.isArray(payload?.members) ? payload.members : []));

  const mapMember = (m) => {
    const roleFromMembership = (m.memberships || []).find(
      (mm) => String(mm.tenant) === String(t.id || t._id),
    )?.role;

    return {
      id: m.id || m._id,
      name: m.name || (m.email?.split('@')[0]) || "",
      email: m.email || "",
      role: (m.role || roleFromMembership || "employee"),
      status: m.status || "active",
      type: m.type || (m.status === 'pending' ? 'invite' : 'member'),
    };
  };

  // פיצול לפי type/status
  const members = rawCombined
    .filter(x => (x.type === 'member') || (x.status !== 'pending'))
    .map(mapMember);

  const invites = rawCombined
    .filter(x => (x.type === 'invite') || (x.status === 'pending'))
    .map(mapMember);

  const feats = t.features || {};
  const suppliers = Array.isArray(t.suppliers) ? t.suppliers : [];

  return {
    id: t.id || t._id || null,
    name: t.name || "העסק שלי",
    createdAt: t.createdAt || new Date().toISOString(),
    settings: t.settings || {},
    ownerName: owner?.name || "—",
    ownerEmail: owner?.email || "—",
    address: t.settings?.address || "",
    phone: t.settings?.phone || "",
    team: members,      // רק פעילים כאן
    invites,            // והזמנות כאן
    features: feats,
    suppliers
  };
}

  function renderTenant() {
    if (!tenantData) return;
    
    // וודא שיש לנו מערכים תקינים
    const teamArr = Array.isArray(tenantData.team) ? tenantData.team : [];
    const invitesArr = Array.isArray(tenantData.invites) ? tenantData.invites : [];
    
    console.log('Team members:', teamArr);
    console.log('Pending invites:', invitesArr);
    
    // שלב את העובדים וההזמנות
    const combined = getCombinedTeam(teamArr, invitesArr);
  
    // המשך הרינדור הרגיל
    const nameMain = document.getElementById("tenantName");
    const nameSidebar = document.getElementById("tenantNameSidebar");
    const createdEl = document.getElementById("tenantCreated");
    const ownerNameEl = document.getElementById("ownerName");
    const ownerEmailEl = document.getElementById("ownerEmail");

    if (nameMain) nameMain.textContent = tenantData.name || "העסק שלי";
    if (nameSidebar) nameSidebar.textContent = tenantData.name || "העסק שלי";
    if (createdEl) createdEl.textContent = formatDate(tenantData.createdAt);
    if (ownerNameEl) ownerNameEl.textContent = tenantData.ownerName || "—";
    if (ownerEmailEl) ownerEmailEl.textContent = tenantData.ownerEmail || "—";


    // הצג את הרשימה המשולבת
    renderTeamList(combined);
    
    // עדכן מונים
    const invCount = document.getElementById("inviteCount");
    const teamCount = document.getElementById("teamCount");
    if (teamCount) teamCount.textContent = String(combined.length);
    if (invCount) invCount.textContent = String(invitesArr.length);
    const sName = document.getElementById("settingsTenantName");
    const sAddr = document.getElementById("settingsAddress");
    const sPhone = document.getElementById("settingsPhone");
    if (sName && document.activeElement !== sName)
      sName.value = tenantData.name || "";
    if (sAddr && document.activeElement !== sAddr)
      sAddr.value = tenantData.address || "";
    if (sPhone && document.activeElement !== sPhone)
      sPhone.value = tenantData.phone || "";
    console.log(tenantData);
  }

  // ---------- TEAM LIST ----------
  function initials(name = "") {
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function memberItemTemplate(m) {
    const role = (m.role || "employee").toLowerCase();
    const roleLabel =
      role === "owner"
        ? "בעלים"
        : role === "manager"
          ? "מנהל"
          : role === "shift_manager"
            ? "אחמ״ש"
            : "עובד";

    const statusLabel = m.status === "pending" 
      ? `<span class="pending">בהמתנה לאישור

         </span>
          <button class="btn btn-sm btn-outline resend-invite" data-id="${m.id}">
           <i class="fas fa-paper-plane"></i> 
           שלח שוב
         </button>`
      : "";

    const isOwner = role === "owner";
    const isInvite = m.type === "invite";

    return `
      <div class="member ${isInvite ? "pending-invite" : ""}" data-id="${m.id || m._id || ""}" data-role="${role}">
        <div class="avatar">${initials(m.name || m.email || "?")}</div>
        <div class="info">
          <div class="name"><bdi>${escapeHtml(m.name || m.email || "—")}</bdi></div>
          ${m.email ? `<div class="email"><i class="fas fa-envelope"></i> <bdi>${escapeHtml(m.email)}</bdi></div>` : ""}
          ${statusLabel}
        </div>
        <div class="meta">
          <span class="role ${role}">${roleLabel}</span>
          <div class="actions">
            ${
              isOwner
                ? ""
                : isInvite
                  ? ""
                  : `
              <button class="icon-btn danger" title="מחק" data-action="delete"><i class="fas fa-trash"></i></button>
              <button class="icon-btn primary" title="ערוך" data-action="edit"><i class="fas fa-pen"></i></button>
            `
            }
          </div>
        </div>
      </div>`;
  }

  // הוספת טיפול באירוע לחיצה על כפתור resend
  document.addEventListener('click', async (e) => {
    if (e.target.closest('.resend-invite')) {
      const btn = e.target.closest('.resend-invite');
      const id = btn.dataset.id;
      
      try {
        btn.disabled = true;
        await fetchJSON(`/api/team/invites/${id}/resend`, { method: 'POST' });
        showToast?.("נשלחה תזכורת", "success");
      } catch (err) {
        showToast?.(err?.message || "שגיאה בשליחה", "error");
      } finally {
        btn.disabled = false;
      }
    }
  });

  async function renderTeamList(team = []) {
    const wrap = document.getElementById("teamList");
    if (!wrap) return;
    if (!team.length) {
      wrap.innerHTML = `<div class="empty"><i class="fas fa-users-slash"></i> עדיין אין משתמשים</div>`;
      return;
    }
    wrap.innerHTML = team.map(memberItemTemplate).join("");

    wrap.onclick = (e) => {
      const btn = e.target.closest(".icon-btn");
      if (!btn) return;
      const row = btn.closest(".member");
      const memberId = row?.dataset.id;
      const action = btn.dataset.action;
      if (row?.dataset.role === "owner") {
        showToast?.("אי אפשר לערוך או למחוק את בעל העסק", "info");
        return;
      }
      const member =
        (tenantData?.team || []).find(
          (m) => String(m.id) === String(memberId),
        ) ||
        (tenantData?.team || []).find(
          (m) => m.email === row?.querySelector(".email bdi")?.textContent,
        );

      if (action === "edit") openEditMemberModal(member);
      if (action === "delete") confirmDeleteMember(memberId, row);
    };
  }

  // === Add Member Modal ===
  function openAddMemberModal() {
    const m = document.getElementById("addMemberModal");
    if (!m) return;
    const form = document.getElementById("addMemberForm");
    if (form) form.reset();
    m.classList.remove("hidden");
    m.style.display = "flex";
    document.body.classList.add("modal-open");
    setTimeout(() => document.getElementById("am_name")?.focus(), 50);
  }

  function closeAddMemberModal() {
    const m = document.getElementById("addMemberModal");
    if (!m) return;
    m.classList.add("hidden");
    m.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  async function createMember() {
    const btn = document.getElementById("am_submit");
    const email = (document.getElementById("am_email")?.value || "").trim();
    const role = document.getElementById("am_role")?.value || "employee";
    const sendInvite = !!document.getElementById("am_sendInvite")?.checked;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      showToast?.("אימייל לא תקין", "warning");
      return;
    }

    btn.disabled = true;
    try {
      const csrf = await getCsrfToken();
      showToast?.("שולח הזמנה...", "info");
      const res = await fetch("/api/team/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ email, role, sendInvite }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false)
        throw new Error(data?.message || `HTTP ${res.status}`);

      closeAddMemberModal();
      showToast?.("ההזמנה נשלחה", "success");
      (async function initTeam() {
        try {
          await loadInvites?.();
        } catch (e) {
          console.error(e);
        }
      })();
    } catch (e) {
      showToast?.(e?.message || "שגיאה בשליחת ההזמנה", "error");
    } finally {
      btn.disabled = false;
    }
  }

  document
    .getElementById("btnAddMember")
    ?.addEventListener("click", openAddMemberModal);
  document
    .querySelector("#addMemberModal .modal-close")
    ?.addEventListener("click", closeAddMemberModal);
  document
    .querySelector("#addMemberModal .modal-cancel")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      closeAddMemberModal();
    });
  document.getElementById("am_submit")?.addEventListener("click", (e) => {
    e.preventDefault();
    createMember();
  });

  // === Edit Member Modal ===
  let editingMemberId = null;

  function openEditMemberModal(member) {
    editingMemberId = member.id || member._id;
    document.getElementById("edit_name").value = member.name || "";
    document.getElementById("edit_role").value = member.role || "employee";
    document.getElementById("edit_status").value = member.status || "active";
    document.getElementById("edit_role").disabled = member.role === "owner";
    const modal = document.getElementById("editMemberModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.style.display = "flex";
    }
    document.body.classList.add("modal-open");
  }

  function closeEditMemberModal() {
    editingMemberId = null;
    const modal = document.getElementById("editMemberModal");
    if (modal) {
      modal.classList.add("hidden");
      modal.style.display = "none";
    }
    document.body.classList.remove("modal-open");
  }

  async function saveEditedMember() {
    const name = document.getElementById("edit_name").value.trim();
    const role = document.getElementById("edit_role").value;
    const status = document.getElementById("edit_status").value;
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`/api/team/members/${editingMemberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        credentials: "include",
        body: JSON.stringify({ name, role, status }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false)
        throw new Error(data.message || `HTTP ${res.status}`);

      const idx = (tenantData?.team || []).findIndex(
        (m) => String(m.id) === String(editingMemberId),
      );
      if (idx !== -1) {
        tenantData.team[idx] = {
          ...tenantData.team[idx],
          name: data.member?.name ?? name,
          role: data.member?.role ?? role,
          status: data.member?.status ?? status,
        };
      }
      renderTeamList(tenantData.team);
      showToast?.("המשתמש עודכן בהצלחה", "success");
      closeEditMemberModal();
    } catch (err) {
      console.error(err);
      showToast?.(err.message || "שגיאה בעדכון המשתמש", "error");
    }
  }

  async function confirmDeleteMember(id, rowEl) {
    if (!confirm("למחוק משתמש זה?")) return;
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "x-csrf-token": csrf },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rowEl?.remove();
      showToast?.("נמחק בהצלחה", "success");
    } catch (e) {
      showToast?.(e.message || "שגיאה במחיקה", "error");
    }
  }

  // ---------- FEATURE GATES ----------
  function applyFeatureGates() {
    const feats = tenantData?.features || {};
    document.querySelectorAll("[data-feature]").forEach((el) => {
      const key = el.getAttribute("data-feature");
      const on = !!feats[key];
      el.classList.toggle("disabled", !on);
      el.setAttribute("aria-disabled", String(!on));
    });
    const cur = (location.hash || "#home").slice(1);
    const el = document.getElementById(`section-${cur}`);
    if (el && el.matches("[data-feature].disabled")) location.hash = "#home";
    applyBottomNavGates();
  }

  // ---------- TENANT EDIT MODAL ----------
function openEditModal() {
  const modal = document.getElementById("editModal");
  if (!modal) return;
  
  // Pre-fill the form fields
  document.getElementById("editTenantName").value = tenantData?.name || "";
  document.getElementById("editTenantAddress").value = tenantData?.address || "";
  document.getElementById("editTenantPhone").value = tenantData?.phone || "";
  
  // Show the modal
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  document.body.classList.add("modal-open");
}

  function closeEditModal() {
    const el = document.getElementById("editModal");
    if (!el) return;
    el.classList.add("hidden");
    el.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  // ---------- ACTIONS ----------
  function handlePrimaryAction(section) {
    switch (section) {
      case "home":
      case "invoices":
        window.showToast?.("פתיחת חשבונית חדשה", "info");
        break;
      case "dispersions":
        window.showToast?.("הוספת פיזור", "info");
        break;
      case "suppliers":
        window.showToast?.("הוספת ספק", "info");
        break;
      case "orders":
        window.showToast?.("יצירת הזמנה חדשה", "info");
        break;
      case "reports":
        window.showToast?.("ייצוא דוח...", "success");
        break;
      case "settings":
        window.showToast?.("נשמרו שינויים", "success");
        break;
      default:
        window.showToast?.("פעולה ראשית", "info");
    }
  }

  async function logout() {
    try {
      await fetch("/logout", { method: "GET", credentials: "include" });
    } catch {}
    location.href = "/login";
  }

  // ---------- HELPERS ----------
  function formatDate(dateStr) {
    try {
      return new Date(dateStr).toLocaleDateString("he-IL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------- Loader ----------
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  async function waitForImages(scope = document) {
    const imgs = [...scope.querySelectorAll("img")].filter(
      (img) => !img.complete,
    );
    if (!imgs.length) return;
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((res) => {
            img.addEventListener("load", res, { once: true });
            img.addEventListener("error", res, { once: true });
          }),
      ),
    );
  }

  async function flushUI(scope = document) {
    const fontsReady =
      document.fonts && document.fonts.ready
        ? document.fonts.ready
        : Promise.resolve();
    await Promise.all([fontsReady, waitForImages(scope)]);
    await nextFrame();
    await nextFrame();
  }

  async function withLoader(
    run,
    {
      text = "טוען...",
      subtext = "מביא נתונים",
      scopeSelector = ".main-content",
      minShow = 300,
    } = {},
  ) {
    showLoader(text, subtext);
    const t0 = performance.now();
    try {
      const result = await run();
      const scope = document.querySelector(scopeSelector) || document.body;
      await flushUI(scope);
      const elapsed = performance.now() - t0;
      if (elapsed < minShow) await delay(minShow - elapsed);
      return result;
    } finally {
      hideLoader();
    }
  }

  // ---------- CSRF / PUT helpers ----------
  async function getCsrfToken() {
    const r = await fetch("/csrf-token", { credentials: "include" });
    const j = await r.json().catch(() => ({}));
    if (!j?.csrfToken) throw new Error("CSRF token missing");
    return j.csrfToken;
  }

  async function putJSON(url, body) {
    const csrf = await getCsrfToken();
    const res = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const msg = data?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- SETTINGS SAVE ----------
  async function saveBusinessSettings() {
    const name = (
      document.getElementById("settingsTenantName")?.value || ""
    ).trim();
    const addr = (
      document.getElementById("settingsAddress")?.value || ""
    ).trim();
    const phone = (
      document.getElementById("settingsPhone")?.value || ""
    ).trim();

    await withLoader(
      async () => {
        const resp = await putJSON("/api/tenant/update", {
          name,
          settings: { address: addr, phone },
        });
        tenantData.name = resp?.tenant?.name || name;
        tenantData.address = resp?.tenant?.settings?.address || addr;
        tenantData.phone = resp?.tenant?.settings?.phone || phone;
        renderTenant();
      },
      {
        text: "שומר הגדרות...",
        subtext: "מעדכן את פרטי העסק בשרת",
      },
    )
      .then(() => window.showToast?.("העסק עודכן בהצלחה", "success"))
      .catch((err) => {
        if (err?.status === 403)
          window.showToast?.("אין לך הרשאה לעדכן את העסק", "error");
        else window.showToast?.(err?.message || "שגיאה בעדכון העסק", "error");
      });
  }

  async function savePersonalSettings() {
    const newName = (
      document.getElementById("settingsUserName")?.value || ""
    ).trim();
    if (!newName) {
      window.showToast?.("יש להזין שם מלא", "warning");
      return;
    }

    await withLoader(
      async () => {
        const csrf = await getCsrfToken();
        const res = await fetch("/api/user/update", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify({ name: newName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false)
          throw new Error(data?.message || `HTTP ${res.status}`);

        setUserUI({
          username: data.user?.name || newName,
          role:
            document.getElementById("currentUserRole")?.textContent || "משתמש",
        });
        return data;
      },
      {
        text: "שומר פרטים אישיים...",
        subtext: "מעדכן את הפרופיל שלך",
      },
    )
      .then(() => window.showToast?.("הפרופיל עודכן בהצלחה", "success"))
      .catch((err) =>
        window.showToast?.(err?.message || "שגיאה בעדכון הפרופיל", "error"),
      );
  }

  async function saveTenantChanges() {
    const name = (
      document.getElementById("editTenantName")?.value || ""
    ).trim();
    const addr = (
      document.getElementById("editTenantAddress")?.value || ""
    ).trim();
    const phone = (
      document.getElementById("editTenantPhone")?.value || ""
    ).trim();

    await withLoader(
      async () => {
        const resp = await putJSON("/api/tenant/update", {
          name,
          settings: { address: addr, phone },
        });
        tenantData.name = resp?.tenant?.name || name;
        tenantData.address = resp?.tenant?.settings?.address || addr;
        tenantData.phone = resp?.tenant?.settings?.phone || phone;
        renderTenant();
      },
      {
        text: "שומר שינויים...",
        subtext: "מעדכן את פרטי העסק",
      },
    )
      .then(() => {
        closeEditModal();
        window.showToast?.("פרטי העסק נשמרו", "success");
      })
      .catch((err) =>
        window.showToast?.(err?.message || "שגיאה בעדכון", "error"),
      );
  }

  // ========== INVOICES ==========
  document.addEventListener("DOMContentLoaded", () => {
    initInvoicesUI();
  });

  async function initInvoicesUI() {
    const sec = document.querySelector("#section-invoices");
    if (!sec) return;

    ensureUploadInvoiceModal();

    document
      .getElementById("btnUploadInvoicee")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        openUploadInvoiceModal();
      });

    const header =
      sec.querySelector(".invoices-toolbar") ||
      sec.querySelector(".card-header .header-filters") ||
      sec.querySelector(".card-header");

    const input = header?.querySelector("#invoicesSearchInput");
    if (input && !input.__wired) {
      const onSearch = debounce((v) => loadInvoices(v), 250);
      input.addEventListener("input", (e) => onSearch(e.target.value));
      input.__wired = true;
    }

    try {
      await loadInvoices("");
    } catch (e) {
      console.error(e);
    }
  }

  function ensureUploadInvoiceModal() {
    if (document.getElementById("uploadInvoiceModal")) return;

    const modal = document.createElement("div");
    modal.id = "uploadInvoiceModal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>העלאת חשבונית</h3>
          <button class="modal-close" id="inv_close_btn"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>קובץ חשבונית (PDF/תמונה)</label>
            <input type="file" id="inv_file" name="file" accept=".pdf,image/*">
            <div class="hint">מקס׳ ~20MB, נתמך: PDF/JPG/PNG/WebP</div>
          </div>
          <div class="form-row">
            <label>תיאור (חובה)</label>
            <input type="text" id="inv_desc" placeholder="לדוגמא: חשבונית מס #1024 - לקוח כהן">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="inv_cancel">ביטול</button>
          <button class="btn btn-primary" id="inv_submit" type="button">העלה</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("inv_close_btn").onclick = closeUploadInvoiceModal;
    document.getElementById("inv_cancel").onclick = closeUploadInvoiceModal;
    document.getElementById("inv_submit").onclick = onSubmitUpload;
    modal.addEventListener(
      "click",
      (e) => e.target === modal && closeUploadInvoiceModal(),
    );
    modal.querySelector("#inv_file").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) showToast?.(`נבחר: ${f.name}`, "info", 900);
    });
  }

  function openUploadInvoiceModal() {
    // Close all other modals first
    closeAllModals();

    const modal = document.getElementById("uploadInvoiceModal");
    if (!modal) return;

    const fileInput = document.getElementById("inv_file");
    const descInput = document.getElementById("inv_desc");

    if (fileInput) fileInput.value = "";
    if (descInput) descInput.value = "";

    modal.classList.remove("hidden");
    modal.style.display = "flex";
    document.body.classList.add("modal-open");
  }

  function closeUploadInvoiceModal() {
    const modal = document.getElementById("uploadInvoiceModal");
    if (!modal) return;

    modal.classList.add("hidden");
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  async function onSubmitUpload(e) {
    e?.preventDefault?.();

    const modal = document.getElementById("uploadInvoiceModal");
    const fileEl = modal?.querySelector("#inv_file");
    const descEl = modal?.querySelector("#inv_desc");

    const f = fileEl?.files?.[0] || null;
    const desc = (descEl?.value || "").trim();

    if (!f) {
      showToast?.("לא נבחר קובץ", "warning");
      return;
    }
    if (!desc) {
      showToast?.("יש להזין תיאור לחשבונית", "warning");
      return;
    }

    try {
      const csrf = await getCsrfToken();
      const fd = new FormData();
      fd.append("file", f);
      fd.append("description", desc);

      showToast?.("מעלה חשבונית...", "info");
      const res = await fetch("/api/invoices/upload", {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrf },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false)
        throw new Error(data?.message || `HTTP ${res.status}`);

      await loadInvoices("");
      closeUploadInvoiceModal();
      showToast?.("החשבונית הועלתה בהצלחה", "success");
    } catch (err) {
      console.error(err);
      showToast?.(err.message || "שגיאה בהעלאת החשבונית", "error");
    }
  }

  async function loadInvoices(query = "") {
    const listBox = document.getElementById("invoicesList");
    const emptyBox = document.getElementById("invoicesEmpty");
    if (!listBox || !emptyBox) return;

    listBox.innerHTML = `<div class="loading">טוען...</div>`;
    const url = query.trim()
      ? `/api/invoices/search?q=${encodeURIComponent(query.trim())}`
      : `/api/invoices/list`;

    const res = await fetch(url, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false)
      throw new Error(data?.message || `HTTP ${res.status}`);

    const arr = data.items || data.invoices || [];
    if (!arr.length) {
      listBox.style.display = "none";
      emptyBox.style.display = "";
      return;
    }
    renderInvoices(arr);
    emptyBox.style.display = "none";
    listBox.style.display = "";
  }

  function renderInvoices(items = []) {
    const listBox = document.getElementById("invoicesList");
    if (!listBox) return;
    listBox.innerHTML = items.map(invoiceCardTemplate).join("");
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0,
      val = n;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    const num = val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1);
    return `${num} ${units[i]}`;
  }

  function invoiceCardTemplate(inv) {
    const id = inv.id || inv._id;
    const name = inv.title || inv.name || "";
    const at = inv.createdAt || inv.uploadedAt || new Date().toISOString();
    const url = inv.file?.url || inv.url;
    const isPdf =
      (inv.mimetype || "").includes("pdf") ||
      /\.pdf$/i.test(inv.originalname || "");
    const desc = inv.description || "";
    const uploader =
      inv.username ||
      inv.uploadedByN ||
      inv.uploadedBy?.name ||
      inv.uploadedBy?.email ||
      inv.uploader ||
      "לא ידוע";
    const size = inv.size || inv.file?.bytes || 0;

    return `
    <div class="invoice-card" data-id="${id}">
      <a class="icn-link" style='text-decoration: none;' href="${url ? url : "#"}" ${url ? 'target="_blank" rel="noopener"' : ""}>
        <div class="icn">
          <i class="fas fa-file-image"></i>
          לפתיחה
        </div>
      </a>

      <div class="meta">
        <div class="name">${escapeHtml(name)}</div>
        <div class="sub"><i class="fas fa-clipboard-list"></i><span>${escapeHtml(desc || "חשבונית")}</span></div>
        <div class="sub"><i class="fas fa-user"></i><bdi>${escapeHtml(uploader)}</bdi></div>
        <div class="sub"><i class="fas fa-calendar"></i>${new Date(at).toLocaleDateString("he-IL")}</div>
      </div>

      <div class="inv-actions">
        <button class="icon-btn danger" data-action="delete" title="מחק">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>`;
  }

  function debounce(fn, ms = 250) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  // Fixed invoice deletion handler
  document.addEventListener("click", async (e) => {
    const deleteBtn = e.target.closest(
      '.invoice-card .inv-actions .icon-btn[data-action="delete"]',
    );
    if (!deleteBtn) return;

    const card = deleteBtn.closest(".invoice-card");
    const id = card?.dataset.id;
    if (!id) return;

    if (!confirm("למחוק את החשבונית?")) return;

    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "x-csrf-token": csrf },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false)
        throw new Error(data?.message || `HTTP ${res.status}`);

      card.remove();

      if (!document.querySelector("#invoicesList .invoice-card")) {
        document
          .getElementById("invoicesEmpty")
          ?.style.removeProperty("display");
        document
          .getElementById("invoicesList")
          ?.style.setProperty("display", "none");
      }

      showToast?.("נמחק בהצלחה", "success");
    } catch (err) {
      showToast?.(err.message || "שגיאה במחיקה", "error");
    }
  });

  async function fetchJSON(url, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const headers = {};
    if (method !== "GET" && method !== "HEAD") {
      headers["Content-Type"] = "application/json";
      const csrf = await getCsrfToken?.();
      if (csrf) headers["x-csrf-token"] = csrf;
    }
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false)
      throw new Error(data?.message || `HTTP ${res.status}`);
    return data;
  }

  function fmt(d) {
    try {
      return new Date(d).toLocaleString("he-IL");
    } catch {
      return "";
    }
  }

function getCombinedTeam(team = [], invites = [], tenantId = tenantData?.id) {
  // דה־דופליקציה: קודם חברים פעילים, אח"כ הזמנות רק אם אין חבר פעיל עם אותו אימייל
  const byKey = new Map();
  const keyOf = (x) => (x.email ? String(x.email).toLowerCase() : `id:${x.id || x._id || Math.random()}`);

  // הזרקה של מאומתים (active members)
  team.forEach(m => {
    const key = keyOf(m);
    byKey.set(key, {
      ...m,
      status: m.status || 'active',
      type: m.type || 'member',
      role: (m.role || 'employee').toLowerCase(),
    });
  });

  // הזרקה של הזמנות (pending) רק אם אין חבר פעיל עם אותו אימייל
  invites.forEach(inv => {
    const key = keyOf(inv);
    if (!byKey.has(key)) {
      byKey.set(key, {
        ...inv,
        status: 'pending',
        type: 'invite',
        role: (inv.role || 'employee').toLowerCase(),
      });
    }
  });

  const arr = Array.from(byKey.values());

  // 1) היררכיית תפקידים (מנהל קודם)
  // לפי הבקשה: manager קודם, אח"כ owner, אח"כ shift_manager, אח"כ employee
  const roleOrder = {
    manager: 0,
    owner: 1,
    shift_manager: 2,
    employee: 3,
  };

  // 2) סטטוס: פעילים לפני ממתינים
  const statusOrder = {
    active: 0,
    pending: 1,
  };

  // מיון: תפקיד → סטטוס → שם
  arr.sort((a, b) => {
    const ra = roleOrder[a.role] ?? 999;
    const rb = roleOrder[b.role] ?? 999;
    if (ra !== rb) return ra - rb;

    const sa = statusOrder[a.status] ?? 999;
    const sb = statusOrder[b.status] ?? 999;
    if (sa !== sb) return sa - sb;

    return (a.name || a.email || '').localeCompare(b.name || b.email || '', 'he');
  });

  return arr;
}


  async function loadInvites() {
    try {
      const tbody = document.getElementById("invitesTbody");
      const empty = document.getElementById("invitesEmpty");

      const data = await fetchJSON("/api/team/invites");
      const list = data?.invites || [];

      tenantData.invites = list;

      if (tbody && empty) {
        tbody.innerHTML = "";
        if (!list.length) {
          empty.style.display = "block";
        } else {
          empty.style.display = "none";
          list.forEach((inv) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td dir="ltr">${inv.email}</td>
              <td>${roleLabel(inv.role)}</td>
              <td>${fmt(inv.createdAt)}</td>
              <td>${fmt(inv.expiresAt)}</td>
              <td>
                <div class="btn-row">
                  <button class="btn btn-secondary" data-action="resend" data-id="${inv.id}">שלח שוב</button>
                  <button class="btn btn-danger" data-action="cancel" data-id="${inv.id}">בטל</button>
                </div>
              </td>
            `;
            tbody.appendChild(tr);
          });

          tbody.querySelectorAll("button[data-action]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const id = btn.getAttribute("data-id");
              const action = btn.getAttribute("data-action");
              try {
                btn.disabled = true;
                if (action === "cancel") {
                  await fetchJSON(`/api/team/invites/${id}`, {
                    method: "DELETE",
                  });
                  showToast?.("הזמנה בוטלה", "success");
                } else if (action === "resend") {
                  await fetchJSON(`/api/team/invites/${id}/resend`, {
                    method: "POST",
                  });
                  showToast?.("נשלחה תזכורת", "success");
                }
                await loadInvites();
              } catch (e) {
                showToast?.(e?.message || "שגיאה בפעולה", "error");
              } finally {
                btn.disabled = false;
              }
            });
          });
        }
      }

      renderTenant();
    } catch (e) {
      console.error("loadInvites", e);
      showToast?.(e?.message || "שגיאה בטעינת הזמנות", "error");
    }
  }

  function roleLabel(r) {
    switch (String(r || "").toLowerCase()) {
      case "manager":
        return "מנהל";
      case "shift_manager":
        return "אחמ״ש";
      default:
        return "עובד";
    }
  }

  const $btn = document.getElementById("refreshAllBtn");

  function fetchWithBust(url, opts) {
    const sep = url.includes("?") ? "&" : "?";
    return fetch(url + sep + "t=" + Date.now(), opts);
  }

  async function refreshAll() {
    const $btn = document.getElementById("refreshAllBtn");
    if ($btn) $btn.disabled = true;
    try {
      await loadTenant();
      await loadInvites();
      await Promise.allSettled([
        loadInvoices?.(""),
        loadLogs?.(),
        tenantData?.features?.dispersions
          ? loadDispersions?.("")
          : Promise.resolve(),
      ]);
      showToast?.("עודכן", "success");
    } catch (e) {
      console.error(e);
      showToast?.("שגיאה ברענון", "error");
    } finally {
      if ($btn) $btn.disabled = false;
    }
  }
  $btn?.addEventListener("click", () => refreshAll());

  document
    .getElementById("btnExportInvoices")
    ?.addEventListener("click", () => {
      const modal = document.getElementById("exportModal");
      if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
        document.body.classList.add("modal-open");
      }
    });

  document
    .getElementById("exportClose")
    ?.addEventListener("click", closeExportModal);
  document
    .getElementById("exportCancel")
    ?.addEventListener("click", closeExportModal);

  function closeExportModal() {
    const modal = document.getElementById("exportModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  function normalizeMonth(raw) {
    const v = String(raw || "").trim();
    const m = v.match(/^(\d{4})-(\d{2})/);
    if (!m) return "";
    let year = Number(m[1]);
    let month = Number(m[2]);
    if (year < 2000 || year > 2100) return "";
    if (month < 1 || month > 12) return "";
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
  }

  document
    .getElementById("exportConfirm")
    ?.addEventListener("click", async () => {
      const raw = (
        document.getElementById("exportMonthModal")?.value || ""
      ).trim();
      const month = (raw.match(/^\d{4}-\d{2}/) || [])[0] || "";
      if (!month) return showToast?.("חודש לא תקין. בחר תאריך", "warning");

      const mode =
        document.querySelector('input[name="exportType"]:checked')?.value ||
        "xlsx";
      const btn = document.getElementById("exportConfirm");
      btn && (btn.disabled = true);

      try {
        if (mode === "pdf") {
          showToast?.("מכין PDF מאוחד...", "info");
          const res = await fetch(
            `/api/invoices/export-pdf?month=${encodeURIComponent(month)}`,
            {
              credentials: "include",
            },
          );

          if (res.status === 404) {
            showToast?.("אין חשבוניות בחודש זה", "info");
            return;
          }

          const ct = (res.headers.get("content-type") || "").toLowerCase();
          const cd = res.headers.get("content-disposition") || "";
          const looksLikePdf =
            ct.includes("application/pdf") ||
            (/attachment/i.test(cd) && /\.pdf/i.test(cd));
          if (!res.ok || !looksLikePdf) {
            let msg = "שגיאה ביצוא PDF";
            if (ct.includes("application/json")) {
              const j = await res.json().catch(() => ({}));
              if (j?.message) msg = j.message;
            }
            showToast?.(msg, "warning");
            return;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `חשבוניות-${month}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);

          showToast?.("ה-PDF ירד בהצלחה", "success");
          closeExportModal();
          return;
        }

        // Excel mode
        showToast?.("מכין את הייצוא...", "info");
        const res = await fetch(
          `/api/invoices/export?month=${encodeURIComponent(month)}`,
          {
            credentials: "include",
          },
        );
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const cd = res.headers.get("content-disposition") || "";
        const isXlsxCT =
          /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i.test(
            ct,
          );
        const isAttach = /attachment/i.test(cd) && /\.xlsx(\W|$)/i.test(cd);
        if (res.status === 404) {
          showToast?.("אין חשבוניות בחודש זה", "info");
          return;
        }
        if (!res.ok || !(isXlsxCT || isAttach)) {
          let msg = "שגיאה ביצוא החשבוניות";
          if (ct.includes("application/json")) {
            const j = await res.json().catch(() => ({}));
            if (j?.message) msg = j.message;
          }
          showToast?.(msg, "warning");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `חשבוניות-${month}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast?.("הקובץ ירד בהצלחה", "success");
        closeExportModal();
      } finally {
        btn && (btn.disabled = false);
      }
    });

  // ===== Dispersions – UI & Logic =====

  function dispersionCardTemplate(d) {
    const id = d.id || d._id;
    const taxi = d.taxi || "";
    const payer = d.payer || "";
    const date = d.date ? new Date(d.date).toLocaleDateString("he-IL") : "—";
    const price = Number(d.price || 0).toLocaleString("he-IL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return `
    <div class="disp-card" data-id="${id}">
      <div class="disp-price">
        <div class="num">₪ ${price}</div>
        <div class="lbl">סכום הפיזור</div>
      </div>
      <div class="disp-meta">
        <div class="disp-line">
          <div class="disp-title"><i class="fas fa-taxi"></i> <bdi>${escapeHtml(taxi)}</bdi></div>
        </div>
        <div class="disp-line">
          <span class="disp-small"><i class="fas fa-user"></i><bdi>${escapeHtml(payer)}</bdi></span>
          <span class="disp-small"><i class="fas fa-calendar"></i>${date}</span>
        </div>
      </div>
      <div class="disp-actions">
        <button class="icon-btn" data-action="edit" title="ערוך"><i class="fas fa-pen"></i></button>
        <button class="icon-btn danger" data-action="delete" title="מחק"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }

  let currentDispQuery = "";
  let editingDispersionId = null;

  function renderDispersions(list = []) {
    const wrap = document.getElementById("dispersionsList");
    const empty = document.getElementById("dispersionsEmpty");
    if (!wrap || !empty) return;

    if (!list.length) {
      wrap.style.display = "none";
      empty.style.removeProperty("display");
      return;
    }
    wrap.innerHTML = list.map(dispersionCardTemplate).join("");
    empty.style.display = "none";
    wrap.style.display = "";
  }

  async function loadDispersions(query = "") {
    if (!tenantData?.features?.dispersions) return;

    currentDispQuery = query;
    const list = document.getElementById("dispersionsList");
    if (list) list.innerHTML = `<div class="loading">טוען...</div>`;

    const url = query.trim()
      ? `/api/dispersions/search?q=${encodeURIComponent(query.trim())}`
      : `/api/dispersions/list`;

    const res = await fetch(url, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      showToast?.(data?.message || "שגיאה בטעינת פיזורים", "error");
      renderDispersions([]);
      return;
    }
    const arr = data.items || data.dispersions || [];
    window.__disp_cache = arr;
    renderDispersions(arr);
  }

  function ensureDispersionModal() {
    const m = document.getElementById("dispersionModal");
    if (!m || m.__wired) return;

    m.__wired = true;

    document
      .getElementById("disp_close_btn")
      ?.addEventListener("click", closeDispersionModal);
    document.getElementById("disp_cancel")?.addEventListener("click", (e) => {
      e.preventDefault();
      closeDispersionModal();
    });
    document.getElementById("disp_submit")?.addEventListener("click", (e) => {
      e.preventDefault();
      saveDispersion();
    });
    m.addEventListener(
      "click",
      (e) => e.target === m && closeDispersionModal(),
    );
  }

  function openDispersionModal(item = null) {
    // Close other modals first
    closeAllModals();

    editingDispersionId = item?.id || item?._id || null;
       const title = document.getElementById("dispersionModalTitle");
    if (title) {
      title.textContent = editingDispersionId ? "ערוך פיזור" : "הוסף פיזור";
    }

    document.getElementById("disp_date").value = item?.date
      ? new Date(item.date).toISOString().slice(0, 10)
      : "";
    document.getElementById("disp_payer").value = item?.payer || "";
    document.getElementById("disp_taxi").value = item?.taxi || "";
    document.getElementById("disp_price").value =
      (item?.price ?? "") === "" ? "" : String(item.price);

    const modal = document.getElementById("dispersionModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.style.display = "flex";
      document.body.classList.add("modal-open");
    }
  }

  function closeDispersionModal() {
    editingDispersionId = null;
    const modal = document.getElementById("dispersionModal");
    if (modal) {
      modal.classList.add("hidden");
      modal.style.display = "none";
      document.body.classList.remove("modal-open");
    }
  }

  async function saveDispersion() {
    const date = (document.getElementById("disp_date")?.value || "").trim();
    const payer = (document.getElementById("disp_payer")?.value || "").trim();
    const taxi = (document.getElementById("disp_taxi")?.value || "").trim();
    const priceStr = (
      document.getElementById("disp_price")?.value || ""
    ).trim();
    const price = Number(price);

    if (!date) return showToast?.("חובה לבחור תאריך", "warning");
    if (!payer) return showToast?.("יש להזין מי שילם", "warning");
    if (!taxi) return showToast?.("יש להזין שם מונית/נהג", "warning");
    if (priceStr === "" || isNaN(price) || price < 0)
      return showToast?.("מחיר לא תקין", "warning");

    try {
      const body = { date, payer, taxi, price };
      if (editingDispersionId) {
        await fetchJSON(`/api/dispersions/${editingDispersionId}`, {
          method: "PUT",
          body,
        });
        showToast?.("הפיזור עודכן", "success");
      } else {
        await fetchJSON("/api/dispersions", { method: "POST", body });
        showToast?.("פיזור נוסף", "success");
      }
      closeDispersionModal();
      await loadDispersions(currentDispQuery);
    } catch (err) {
      showToast?.(err?.message || "שגיאה בשמירה", "error");
    }
  }

  document.getElementById("dispersionsList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const card = btn.closest(".disp-card");
    const id = card?.dataset.id;
    if (!id) return;

    if (btn.dataset.action === "edit") {
      const item = (window.__disp_cache || []).find(
        (x) => (x.id || x._id) === id,
      );
      openDispersionModal(item || { id });
    }
    if (btn.dataset.action === "delete") {
      confirmDeleteDispersion?.(id, card);
    }
  });

   function confirmDeleteDispersion(id, cardEl) {
    if (!confirm("למחוק את הפיזור?")) return;
    (async () => {
      try {
        await fetchJSON(`/api/dispersions/${id}`, { method: "DELETE" });
        showToast?.("נמחק בהצלחה", "success");
        cardEl?.remove();
        const list = document.getElementById("dispersionsList");
        if (!list?.children?.length) loadDispersions(currentDispQuery);
      } catch (err) {
        showToast?.(err?.message || "שגיאה במחיקה", "error");
      }
    })();
  }

  async function initDispersionsUI() {
    const sec = document.querySelector("#section-dispersions");
    if (!sec) return;
    if (!tenantData?.features?.dispersions) return;
    if (sec.matches("[data-feature].disabled")) return;

    ensureDispersionModal();

    sec.querySelector("#disaddbtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      openDispersionModal(null);
    });

    initDispExportModal(sec);

    const searchInput = sec.querySelector('.search-box input[type="search"]');
    if (searchInput && !searchInput.__wired) {
      const onSearch = debounce((v) => loadDispersions(v), 250);
      searchInput.addEventListener("input", (e) => onSearch(e.target.value));
      searchInput.__wired = true;
    }

    await loadDispersions("");
  }

  function initDispExportModal(sectionEl) {
    const openBtn = sectionEl.querySelector(".btn-export");
    const modal = document.getElementById("dispExportModal");
    const closeBtn = document.getElementById("dispExpClose");
    const cancelBtn = document.getElementById("dispExportCancel");
    const okBtn = document.getElementById("dispExportConfirm");
    const monthEl = document.getElementById("dispExportMonth");

    if (!openBtn || !modal) return;

    const open = () => {
      modal.classList.remove("hidden");
      modal.style.display = "flex";
      document.body.classList.add("modal-open");
    };
    const close = () => {
      modal.classList.add("hidden");
      modal.style.display = "none";
      document.body.classList.remove("modal-open");
    };

    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    });
    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });

    okBtn?.addEventListener("click", async () => {
      const month = monthEl?.value || "";
      const type = (
        document.querySelector('input[name="dispExpType"]:checked')?.value ||
        "xlsx"
      ).toLowerCase();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        showToast?.("בחר חודש (YYYY-MM)", "warning");
        return;
      }
      try {
        const url = `/api/dispersions/export?month=${encodeURIComponent(month)}&type=${encodeURIComponent(type)}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
        close();
      } catch (err) {
        showToast?.("שגיאה בייצוא", "error");
      }
    });
  }

  // ---------- INIT ----------
  document.addEventListener("DOMContentLoaded", async () => {
    // Initialize theme first
    initTheme();
    
    // Connect theme toggle button

  const editTenantBtn = document.getElementById("editTenantBtn");
  if (editTenantBtn) {
    editTenantBtn.addEventListener("click", () => {
      openEditModal();
    });
  }
          document
          .querySelector(".btn-logout")
          ?.addEventListener("click", logout);
        document
          .querySelector("#editModal .modal-close")
          ?.addEventListener("click", closeEditModal);

        document.querySelector('#editModal .closeee')
        ?.addEventListener("click", closeEditModal);
        document
          .querySelector("#editModal .modal-footer .btn.btn-primary")
          ?.addEventListener("click", saveTenantChanges);
        document
          .querySelector(".theme-toggle")
          ?.addEventListener("click", toggleTheme);
        const themeOpts = document.querySelectorAll(
          ".theme-options .theme-option",
        );
        if (themeOpts[0])
          themeOpts[0].addEventListener("click", () => setTheme("light"));
        if (themeOpts[1])
          themeOpts[1].addEventListener("click", () => setTheme("dark"));


        document
          .querySelector(
            "#section-settings .card:nth-of-type(1) .btn.btn-primary",
          )
          ?.addEventListener("click", saveBusinessSettings);
        document
          .querySelector(
            "#section-settings .card:nth-of-type(2) .btn.btn-primary",
          )
          ?.addEventListener("click", savePersonalSettings);
    await withLoader(
      async () => {
        const meRes = await fetch("/me", { credentials: "include" });
        if (meRes.status === 401 || meRes.status === 403) {
          location.href = "/login";
          return;
        }

        const me = await meRes.json().catch(() => ({}));
        const meUser = me?.user || null;
        setUserUI(meUser || { username: "אורח", role: "user" });

        if (meUser) {
          const uNameEl = document.getElementById("settingsUserName");
          const uMailEl = document.getElementById("settingsEmail");
          if (uNameEl && !uNameEl.value) uNameEl.value = meUser.name || "";
          if (uMailEl && !uMailEl.value) uMailEl.value = meUser.email || "";
        }

      const infoRes = await fetch("/api/tenant/info", { credentials: "include" });
      if (infoRes.status === 401 || infoRes.status === 403) {
        location.href = "/login";
        return;
      }

      let data = {};
      try {
        data = await infoRes.json();
      } catch {
        data = {};
      }

      if (infoRes.ok && data?.ok && data?.tenant) {
        tenantData = normalizeTenant(data);
      } else {
        window.showToast?.(data?.message || "שגיאה בטעינת נתוני העסק", "warning");
        tenantData = {
          name: "העסק שלי",
          createdAt: new Date().toISOString(),
          settings: {},
          features: {},
          teamMembers: []
        };
      }

      renderTenant();
      await loadLogs().catch(() => {});
      await loadInvites().catch(() => renderInvites([]));
      setInterval(() => loadLogs().catch(() => {}), 60_000);

      applyFeatureGates();
      renderBottomNav();
      applyBottomNavGates();
      bindNavEvents();
      handleHashRoute();

      if (tenantData?.features?.dispersions) {
        await initDispersionsUI();
      }

      // Initialize dispersion modal listeners (even if not on dispersions page)
      ensureDispersionModal();

      const primaryActionBtn = document.getElementById("primaryActionBtn");
      if (primaryActionBtn) {
        primaryActionBtn.addEventListener("click", () => {
          const s = primaryActionBtn.dataset.section || currentSection;
          handlePrimaryAction(s);
        });
        if (infoRes.status === 401 || infoRes.status === 403) {
          location.href = "/login";
          return;
        }

        let data = {};
        try {
          data = await infoRes.json();
        } catch {
          data = {};
        }

        if (infoRes.ok && data?.ok && data?.tenant) {
          tenantData = normalizeTenant(data);
        } else {
          window.showToast?.(
            data?.message || "שגיאה בטעינת נתוני העסק",
            "warning",
          );
          tenantData = {
            name: "העסק שלי",
            createdAt: new Date().toISOString(),
            settings: {},
            features: {},
            teamMembers: [],
          };
        }

        renderTenant();
        await loadLogs().catch(() => {});
        await loadInvites().catch(() => renderInvites([]));
        setInterval(() => loadLogs().catch(() => {}), 60_000);

        applyFeatureGates();
        renderBottomNav();
        applyBottomNavGates();
        bindNavEvents();
        handleHashRoute();

        if (tenantData?.features?.dispersions) {
          await initDispersionsUI();
        }

        if (tenantData?.features?.shifts) {
          await initShiftsUI();
        }

        // Initialize dispersion modal listeners (even if not on dispersions page)
        ensureDispersionModal();

        const primaryActionBtn = document.getElementById("primaryActionBtn");
        if (primaryActionBtn) {
          primaryActionBtn.addEventListener("click", () => {
            const s = primaryActionBtn.dataset.section || currentSection;
            handlePrimaryAction(s);
          });
        }


        // Mobile-specific initializations
        addTouchFeedback();
      }
    }, {
      text: "טוען לוח בקרה...",
      subtext: "מביא נתונים מהשרת",
      scopeSelector: ".main-content",
      minShow: 300
    });
  });

  (function hookEditMemberModalEvents() {
    const modal = document.getElementById("editMemberModal");
    if (!modal) return;

    document
      .getElementById("edit_save_btn")
      ?.addEventListener("click", saveEditedMember);
    document
      .getElementById("edit_cancel_btn")
      ?.addEventListener("click", closeEditMemberModal);
    modal.addEventListener(
      "click",
      (e) => e.target === modal && closeEditMemberModal(),
    );
  })();

  // ========== GLOBAL ESC KEY HANDLER ==========
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    // Close all visible modals
    const modals = document.querySelectorAll(".modal:not(.hidden)");
    modals.forEach((modal) => {
      const id = modal.id;
      if (id === "uploadInvoiceModal") closeUploadInvoiceModal();
      else if (id === "dispersionModal") closeDispersionModal();
      else if (id === "editMemberModal") closeEditMemberModal();
      else if (id === "addMemberModal") closeAddMemberModal();
      else if (id === "editModal") closeEditModal();
      else if (id === "exportModal") closeExportModal();
      else if (id === "dispExportModal") {
        modal.classList.add("hidden");
        modal.style.display = "none";
        document.body.classList.remove("modal-open");
      }
    });

    // Close popup menus
    closeAllPopupMenus();
  });
  document.getElementById("inv_close_btn").onclick = closeUploadInvoiceModal;
  document.getElementById("inv_cancel").onclick = closeUploadInvoiceModal;
  document
    .getElementById("disp_close_btn")
    ?.addEventListener("click", closeDispersionModal);
  document
    .getElementById("disp_cancel")
    ?.addEventListener("click", closeDispersionModal);
  document
    .getElementById("edit_cancel_btn")
    ?.addEventListener("click", closeEditMemberModal);

  document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme first
  initTheme();

});
})();
