(() => {
  if (window.__DASHBOARD_INIT__) return;
  window.__DASHBOARD_INIT__ = true;

  let tenantData = null;
  let currentSection = "home";

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
    window.showToast?.(theme === "dark" ? "מצב כהה הופעל" : "מצב בהיר הופעל", "info", 1200);
  }
  function initTheme() {
    const saved = localStorage.getItem("theme");
    const initial = (saved === "dark" || saved === "light") ? saved : "light";
    document.documentElement.setAttribute("data-theme", initial);
    updateThemeIcon(initial);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  }
  function setTheme(theme) {
    if (theme !== "light" && theme !== "dark") return;
    applyTheme(theme);
  }

  // ---------- NAV ----------
  const sectionConfig = {
    home:      { title: "דף הבית",   subtitle: "לוח בקרה וניהול",   actionText: "חשבונית חדשה", actionIcon: "fa-plus" },
    invoices:  { title: "חשבוניות",  subtitle: "ניהול חשבוניות",    actionText: "חשבונית חדשה", actionIcon: "fa-plus" },
    customers: { title: "לקוחות",    subtitle: "ניהול לקוחות",       actionText: "הוסף לקוח",     actionIcon: "fa-user-plus" },
    suppliers: { title: "ספקים",     subtitle: "ניהול ספקים",        actionText: "הוסף ספק",      actionIcon: "fa-plus" },
    orders:    { title: "הזמנות",    subtitle: "ניהול הזמנות",       actionText: "הזמנה חדשה",    actionIcon: "fa-plus" },
    reports:   { title: "דוחות",     subtitle: "דוחות וסטטיסטיקות",  actionText: "ייצא דוח",      actionIcon: "fa-download" },
    settings:  { title: "הגדרות",    subtitle: "הגדרות מערכת",       actionText: "שמור שינויים",  actionIcon: "fa-save" }
  };
  const bottomNavItems = [
    { section: "home",      label: "בית",     icon: "fa-house" },
    { section: "invoices",  label: "חשבוניות", icon: "fa-file-invoice", feature: "invoices" },
    { section: "customers", label: "לקוחות",   icon: "fa-users",        feature: "customers" },
    { section: "suppliers", label: "ספקים",    icon: "fa-building",     feature: "suppliers" },
    { section: "orders",    label: "הזמנות",   icon: "fa-briefcase",    feature: "orders" },
    { section: "settings",  label: "הגדרות",   icon: "fa-gear" }
  ];
  function timeAgo(ts){
  const d = new Date(ts).getTime();
  const s = Math.floor((Date.now()-d)/1000);
  if (s < 60) return 'הרגע';
  const m = Math.floor(s/60); if (m < 60) return `${m} ד׳`;
  const h = Math.floor(m/60); if (h < 24) return `${h} ש׳`;
  const dd = Math.floor(h/24); return `${dd} ימ׳`;
}

function renderAction(l){
  const t = l?.target?.label || l?.target?.email || l?.target?.id || '';
  const by = (l?.actor?.name || l?.actor?.email || 'משתמש');
  const map = {
    'member:create':        `${by} הוסיף משתמש <bdi>${escapeHtml(t)}</bdi>`,
    'member:add_to_tenant': `${by} העניק גישה למשתמש <bdi>${escapeHtml(t)}</bdi>`,
    'member:update':        `${by} עדכן משתמש <bdi>${escapeHtml(t)}</bdi>`,
    'tenant:update':        `${by} עדכן את פרטי העסק`
  };
  return map[l.action] || `${by} · ${escapeHtml(l.action)}${t ? ' · ' + escapeHtml(t) : ''}`;
}

function renderLogs(items){
  const wrap = document.getElementById('logsList');
  if (!wrap) return;
  if (!items.length){
    wrap.innerHTML = `<div class="empty">אין פעילות אחרונה</div>`;
    return;
  }
  wrap.innerHTML = items.map(l => `
    <div class="log">
      <i class="fas fa-circle-dot dot"></i>
      <div class="what">${renderAction(l)}</div>
      <div class="when" title="${new Date(l.createdAt).toLocaleString('he-IL')}">${timeAgo(l.createdAt)}</div>
    </div>
  `).join('');
}

async function loadLogs(){
  try{
    const r = await fetch('/api/logs?limit=30', { credentials: 'include' });
    const data = await r.json();
    if (!data?.ok) throw 0;
    renderLogs(data.logs || []);
  }catch(e){
    renderLogs([]);
  }
}

  function renderBottomNav() {
    const el = document.getElementById("bottomNav");
    if (!el) return;
    const feats = tenantData?.features || {};
    el.innerHTML = bottomNavItems.map(item => {
      const disabled = item.feature ? !feats[item.feature] : false;
      return `
        <button class="nav-tab"
                data-section="${item.section}"
                ${disabled ? 'aria-disabled="true"' : ''}
                ${currentSection === item.section ? 'aria-current="page"' : ''}>
          <i class="fas ${item.icon}"></i>
          <span>${item.label}</span>
        </button>`;
    }).join("");
    el.querySelectorAll(".nav-tab").forEach(btn => {
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
  }
  function applyBottomNavGates() {
    const el = document.getElementById("bottomNav");
    if (!el) return;
    const feats = tenantData?.features || {};
    el.querySelectorAll(".nav-tab").forEach(btn => {
      const sec = btn.getAttribute("data-section");
      const item = bottomNavItems.find(i => i.section === sec);
      const need = item?.feature;
      const on = need ? !!feats[need] : true;
      btn.classList.toggle("disabled", !on);
      btn.setAttribute("aria-disabled", String(!on));
    });
  }
  function setActiveNav(sectionName) {
    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.toggle("active", item.getAttribute("data-section") === sectionName);
    });
    document.querySelectorAll("#bottomNav .nav-tab").forEach(btn => {
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
    if (el && el.matches('[data-feature].disabled')) {
      window.showToast?.("אין לך גישה לעמוד זה", "warning");
      location.hash = "#home";
      return;
    }
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
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
    document.querySelectorAll(".nav-item").forEach(item => {
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
      const res = await fetch("/api/tenant/info", { credentials: "include" });
      const data = await res.json();
      if (data?.ok) {
        setUserUI({
          username: data.currentUser?.name,
          role: data.currentUser?.role
        });
        tenantData = normalizeTenant(data);
        renderTenant();
        applyFeatureGates();
        return;
      }
    } catch (e) { console.error("loadTenant error", e); }
    tenantData = {
      name: "העסק שלי",
      createdAt: new Date().toISOString(),
      ownerName: "—",
      ownerEmail: "—",
      address: "",
      phone: "",
      team: [],
      features: {}
    };
    renderTenant();
    applyFeatureGates();
  }
  function normalizeTenant(payload) {
    const t = payload?.tenant || {};
    const owner = payload?.owner || null;
    const team = Array.isArray(payload?.teamMembers) ? payload.teamMembers : [];
    const feats = t.features || {};
    return {
      id: t.id || t._id || null,
      name: t.name || "העסק שלי",
      createdAt: t.createdAt || new Date().toISOString(),
      settings: t.settings || {},
      ownerName: owner?.name || "—",
      ownerEmail: owner?.email || "—",
      address: t.settings?.address || "",
      phone: t.settings?.phone || "",
      team: team.map(m => ({
        id: m.id || m._id,
        name: m.name,
        email: m.email,
        role: (m.role || "employee"),
        status: m.status || "active"
      })),
      features: feats
    };
  }
  function renderTenant() {
    if (!tenantData) return;
    const nameMain = document.getElementById("tenantName");
    const nameSidebar = document.getElementById("tenantNameSidebar");
    const createdEl = document.getElementById("tenantCreated");
    const ownerNameEl = document.getElementById("ownerName");
    const ownerEmailEl = document.getElementById("ownerEmail");
    if (nameMain) nameMain.textContent = tenantData.name;
    if (nameSidebar) nameSidebar.textContent = tenantData.name;
    if (createdEl) createdEl.textContent = formatDate(tenantData.createdAt);
    if (ownerNameEl) ownerNameEl.textContent = tenantData.ownerName || "—";
    if (ownerEmailEl) ownerEmailEl.textContent = tenantData.ownerEmail || "—";
    renderTeamList(tenantData.team);
    const teamCount = document.getElementById("teamCount");
    if (teamCount) teamCount.textContent = String(tenantData.team.length || 0);
    const sName  = document.getElementById("settingsTenantName");
    const sAddr  = document.getElementById("settingsAddress");
    const sPhone = document.getElementById("settingsPhone");
    if (sName  && document.activeElement !== sName)  sName.value  = tenantData.name || "";
    if (sAddr  && document.activeElement !== sAddr)  sAddr.value  = tenantData.address || "";
    if (sPhone && document.activeElement !== sPhone) sPhone.value = tenantData.phone || "";
  }

  // ---------- TEAM LIST ----------
  function initials(name='') {
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
function memberItemTemplate(m) {
  const role = (m.role || 'employee').toLowerCase();
const roleLabel =
  role === 'owner'         ? 'בעלים'  :
  role === 'manager'       ? 'מנהל'   :
  role === 'shift_manager' ? 'אחמ״ש'  :
                              'עובד';
  const isOwner = role === 'owner';

  return `
    <div class="member" data-id="${m.id || m._id || ''}">
      <div class="avatar">${initials(m.name || m.email || '?')}</div>

      <!-- שורה עליונה: שם + אימייל -->
      <div class="info">
        <div class="name"><bdi>${escapeHtml(m.name || m.email || '—')}</bdi></div>
        ${m.email ? `<div class="email"><i class="fas fa-envelope"></i> <bdi>${escapeHtml(m.email)}</bdi></div>` : ''}
      </div>

      <!-- שורה תחתונה: תפקיד + כפתורים -->
      <div class="meta">
        <span class="role ${role}">${roleLabel}</span>
        <div class="actions">
          ${isOwner ? '' : `
            <button class="icon-btn danger"  title="מחק" data-action="delete"><i class="fas fa-trash"></i></button>
            <button class="icon-btn primary" title="ערוך" data-action="edit"><i class="fas fa-pen"></i></button>
          `}
        </div>
      </div>
    </div>`;
}


  async function renderTeamList(team = []) {
    const wrap = document.getElementById('teamList');
    if (!wrap) return;
    if (!team.length) {
      wrap.innerHTML = `<div class="empty"><i class="fas fa-users-slash"></i> עדיין אין משתמשים</div>`;
      return;
    }
    wrap.innerHTML = team.map(memberItemTemplate).join('');
    // Delegation לכפתורי עריכה/מחיקה
wrap.onclick = (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const row = btn.closest('.member');
  const memberId = row?.dataset.id;
  const action = btn.dataset.action;
  if (row?.dataset.role === 'owner') {
    showToast?.('אי אפשר לערוך או למחוק את בעל העסק', 'info');
    return;
  }
  const member = (tenantData?.team || []).find(m => String(m.id) === String(memberId))
             || (tenantData?.team || []).find(m => m.email === row?.querySelector('.email bdi')?.textContent);

  if (action === 'edit') openEditMemberModal(member);
  if (action === 'delete') confirmDeleteMember(memberId, row);
};
  }

  // === Add Member Modal logic ===
  function openAddMemberModal(){
    const m = document.getElementById('addMemberModal');
    if (!m) return;
    document.getElementById('addMemberForm').reset();
    m.classList.remove('hidden');
    document.body.classList.add('modal-open');
    setTimeout(()=> document.getElementById('am_name')?.focus(), 50);
  }
  function closeAddMemberModal(){
    const m = document.getElementById('addMemberModal');
    if (!m) return;
    m.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }
  async function createMember(){
    const btn = document.getElementById('am_submit');
    const name = (document.getElementById('am_name')?.value || '').trim();
    const email = (document.getElementById('am_email')?.value || '').trim();
    const password = (document.getElementById('am_password')?.value || '').trim();
    const role = (document.getElementById('am_role')?.value || 'employee');
    const sendInvite = !!document.getElementById('am_sendInvite')?.checked;
    if (!name)      { showToast?.('נא להזין שם', 'warning'); return; }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { showToast?.('אימייל לא תקין', 'warning'); return; }
    if (!password || password.length < 8) { showToast?.('הסיסמה קצרה מדי (מינ׳ 8)', 'warning'); return; }
    btn.disabled = true;
    try {
      const csrf = await getCsrfToken();
      showToast?.('יוצר משתמש... זה עשוי לקחת כמה שניות', 'info');
      const res = await fetch('/api/team/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ name, email, password, role, sendInvite })
      });
      const data = await res.json().catch(()=> ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${res.status}`);
      const newMember = {
        id: data?.member?.id || data?.member?._id || null,
        name, email, role, status: 'active'
      };
      if (Array.isArray(tenantData?.team)) tenantData.team.push(newMember);
      renderTeamList(tenantData?.team || []);
      closeAddMemberModal();
      showToast?.('המשתמש נוצר בהצלחה', 'success');
    } catch (e){
      showToast?.(e?.message || 'שגיאה ביצירת משתמש', 'error');
    } finally {
      btn.disabled = false;
    }
  }
  document.getElementById('btnAddMember')?.addEventListener('click', openAddMemberModal);
  document.querySelector('#addMemberModal .modal-close')?.addEventListener('click', closeAddMemberModal);
  document.querySelector('#addMemberModal .modal-cancel')?.addEventListener('click', (e)=>{ e.preventDefault(); closeAddMemberModal(); });
  document.getElementById('am_submit')?.addEventListener('click', (e)=>{ e.preventDefault(); createMember(); });

  // === Edit Member Modal (inline, כולל יצירה אם לא קיים ב-HTML) ===
  let editingMemberId = null;
  function openEditMemberModal(member) {
    editingMemberId = member.id || member._id;
    document.getElementById("edit_name").value = member.name || "";
    document.getElementById("edit_role").value = (member.role || "employee");
    document.getElementById("edit_status").value = member.status || "active";
    document.getElementById("edit_role").disabled = (member.role === 'owner'); // אופציונלי
    document.getElementById("editMemberModal").classList.remove("hidden");
  }
  function closeEditMemberModal() {
    editingMemberId = null;
    document.getElementById("editMemberModal").classList.add("hidden");
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
        body: JSON.stringify({ name, role, status })
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
      const idx = (tenantData?.team || []).findIndex(m => String(m.id) === String(editingMemberId));
      if (idx !== -1) {
        tenantData.team[idx] = {
          ...tenantData.team[idx],
          name: data.member?.name ?? name,
          role: data.member?.role ?? role,
          status: data.member?.status ?? status
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
  // יצירת המודאל אם אין ב-HTML

  // מחיקה (אם יש לך ראוט מתאים בצד שרת)
  async function confirmDeleteMember(id, rowEl){
    if (!confirm('למחוק משתמש זה?')) return;
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`/api/users/${id}`, { method:'DELETE', credentials:'include', headers:{'x-csrf-token':csrf} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rowEl?.remove();
      showToast?.('נמחק בהצלחה', 'success');
    } catch(e){
      showToast?.(e.message || 'שגיאה במחיקה', 'error');
    }
  }

  // ---------- FEATURE GATES ----------
  function applyFeatureGates() {
    const feats = tenantData?.features || {};
    document.querySelectorAll('[data-feature]').forEach(el => {
      const key = el.getAttribute('data-feature');
      const on = !!feats[key];
      el.classList.toggle('disabled', !on);
      el.setAttribute('aria-disabled', String(!on));
    });
    const cur = (location.hash || '#home').slice(1);
    const el = document.getElementById(`section-${cur}`);
    if (el && el.matches('[data-feature].disabled')) location.hash = '#home';
    applyBottomNavGates();
  }

  // ---------- TENANT EDIT MODAL ----------
  function openEditModal() {
    const el = document.getElementById("editModal");
    if (!el) return;
    document.getElementById("editTenantName").value = tenantData?.name || "";
    document.getElementById("editTenantAddress").value = tenantData?.address || "";
    document.getElementById("editTenantPhone").value = tenantData?.phone || "";
    el.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
  function closeEditModal() {
    const el = document.getElementById("editModal");
    if (!el) return;
    el.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  // ---------- ACTIONS ----------
  function handlePrimaryAction(section) {
    switch (section) {
      case "home":
      case "invoices":  window.showToast?.("פתיחת חשבונית חדשה", "info"); break;
      case "customers": window.showToast?.("הוספת לקוח", "info"); break;
      case "suppliers": window.showToast?.("הוספת ספק", "info"); break;
      case "orders":    window.showToast?.("יצירת הזמנה חדשה", "info"); break;
      case "reports":   window.showToast?.("ייצוא דוח...", "success"); break;
      case "settings":  window.showToast?.("נשמרו שינויים", "success"); break;
      default:          window.showToast?.("פעולה ראשית", "info");
    }
  }
  async function logout() {
    try { await fetch("/logout", { method: "GET", credentials: "include" }); } catch {}
    location.href = "/login";
  }

  // ---------- HELPERS ----------
  function formatDate(dateStr) {
    try { return new Date(dateStr).toLocaleDateString("he-IL", { year: "numeric", month: "2-digit", day: "2-digit" }); }
    catch { return "—"; }
  }
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ---------- Loader (CSP-safe) ----------
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  async function waitForImages(scope = document) {
    const imgs = [...scope.querySelectorAll('img')].filter(img => !img.complete);
    if (!imgs.length) return;
    await Promise.all(imgs.map(img => new Promise(res => {
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    })));
  }
  async function flushUI(scope = document) {
    const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    await Promise.all([fontsReady, waitForImages(scope)]);
    await nextFrame(); await nextFrame();
  }
  async function withLoader(run, { text="טוען...", subtext="מביא נתונים", scopeSelector=".main-content", minShow=300 } = {}) {
    showLoader(text, subtext);
    const t0 = performance.now();
    try {
      const result = await run();
      const scope = document.querySelector(scopeSelector) || document.body;
      await flushUI(scope);
      const elapsed = performance.now() - t0;
      if (elapsed < minShow) await delay(minShow - elapsed);
      return result;
    } finally { hideLoader(); }
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
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const msg = data?.message || `HTTP ${res.status}`;
      const err = new Error(msg); err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- SETTINGS SAVE ----------
  async function saveBusinessSettings() {
    const name  = (document.getElementById("settingsTenantName")?.value || "").trim();
    const addr  = (document.getElementById("settingsAddress")?.value || "").trim();
    const phone = (document.getElementById("settingsPhone")?.value || "").trim();
    await withLoader(async () => {
      const resp = await putJSON("/api/tenant/update", { name, settings: { address: addr, phone } });
      tenantData.name    = resp?.tenant?.name || name;
      tenantData.address = resp?.tenant?.settings?.address || addr;
      tenantData.phone   = resp?.tenant?.settings?.phone   || phone;
      renderTenant();
    }, { text: "שומר הגדרות...", subtext: "מעדכן את פרטי העסק בשרת" })
    .then(() => window.showToast?.("העסק עודכן בהצלחה", "success"))
    .catch(err => {
      if (err?.status === 403) window.showToast?.("אין לך הרשאה לעדכן את העסק", "error");
      else window.showToast?.(err?.message || "שגיאה בעדכון העסק", "error");
    });
  }
  async function savePersonalSettings() {
    const newName = (document.getElementById("settingsUserName")?.value || "").trim();
    if (!newName) { window.showToast?.("יש להזין שם מלא", "warning"); return; }
    await withLoader(async () => {
      const csrf = await getCsrfToken();
      const res = await fetch("/api/user/update", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ name: newName })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${res.status}`);
      setUserUI({ username: data.user?.name || newName, role: document.getElementById("currentUserRole")?.textContent || "משתמש" });
      return data;
    }, { text: "שומר פרטים אישיים...", subtext: "מעדכן את הפרופיל שלך" })
    .then(() => window.showToast?.("הפרופיל עודכן בהצלחה", "success"))
    .catch(err => window.showToast?.(err?.message || "שגיאה בעדכון הפרופיל", "error"));
  }
  async function saveTenantChanges() {
    const name  = (document.getElementById("editTenantName")?.value || "").trim();
    const addr  = (document.getElementById("editTenantAddress")?.value || "").trim();
    const phone = (document.getElementById("editTenantPhone")?.value || "").trim();
    await withLoader(async () => {
      const resp = await putJSON("/api/tenant/update", { name, settings: { address: addr, phone } });
      tenantData.name    = resp?.tenant?.name || name;
      tenantData.address = resp?.tenant?.settings?.address || addr;
      tenantData.phone   = resp?.tenant?.settings?.phone   || phone;
      renderTenant();
    }, { text: "שומר שינויים...", subtext: "מעדכן את פרטי העסק" })
    .then(() => { closeEditModal(); window.showToast?.("פרטי העסק נשמרו", "success"); })
    .catch(err => window.showToast?.(err?.message || "שגיאה בעדכון", "error"));
  }

  // ---------- INIT ----------
  document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    await withLoader(async () => {
      const me = await fetch("/me", { credentials: "include" }).then(r => r.json());
      if (!me?.ok || !me.user) { location.href = "/login"; return; }
      setUserUI(me.user);
      const uNameEl  = document.getElementById("settingsUserName");
      const uMailEl  = document.getElementById("settingsEmail");
      if (uNameEl && !uNameEl.value) uNameEl.value = me.user.name || "";
      if (uMailEl && !uMailEl.value) uMailEl.value = me.user.email || "";
      const r = await fetch("/api/tenant/info", { credentials: "include" });
      if (!r.ok) { location.href = "/login"; return; }
      const data = await r.json();
      if (!data?.ok || !data?.tenant) { location.href = "/login"; return; }
      tenantData = normalizeTenant(data);
      renderTenant();
      await loadLogs();
// אופציונלי: רענון עדין כל דקה
setInterval(loadLogs, 60_000);
      applyFeatureGates();
      renderBottomNav();
      applyBottomNavGates();
      bindNavEvents();
      handleHashRoute();

      const primaryActionBtn = document.getElementById("primaryActionBtn");
      if (primaryActionBtn) {
        primaryActionBtn.addEventListener("click", () => {
          const s = primaryActionBtn.dataset.section || currentSection;
          handlePrimaryAction(s);
        });
      }
      document.querySelector(".theme-toggle")?.addEventListener("click", toggleTheme);
      const themeOpts = document.querySelectorAll(".theme-options .theme-option");
      if (themeOpts[0]) themeOpts[0].addEventListener("click", () => setTheme("light"));
      if (themeOpts[1]) themeOpts[1].addEventListener("click", () => setTheme("dark"));
      document.querySelector(".btn-logout")?.addEventListener("click", logout);

      document.getElementById("editTenantBtn")?.addEventListener("click", openEditModal);
      document.querySelector("#editModal .modal-close")?.addEventListener("click", closeEditModal);
      document.querySelector("closeee")?.addEventListener("click", closeEditModal);
      document.querySelector("#editModal .modal-footer .btn.btn-primary")?.addEventListener("click", saveTenantChanges);

      document.querySelector("#section-settings .card:nth-of-type(1) .btn.btn-primary")?.addEventListener("click", saveBusinessSettings);
      document.querySelector("#section-settings .card:nth-of-type(2) .btn.btn-primary")?.addEventListener("click", savePersonalSettings);
    }, {
      text: "טוען לוח בקרה...",
      subtext: "מביא נתונים מהשרת",
      scopeSelector: ".main-content",
      minShow: 300
    });
  });
  (function hookEditMemberModalEvents() {
  const saveBtn   = document.getElementById('edit_save_btn');
  const cancelBtn = document.getElementById('edit_cancel_btn');
  const modalEl   = document.getElementById('editMemberModal');

  if (saveBtn)   saveBtn.addEventListener('click', saveEditedMember);
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditMemberModal);
  if (modalEl)   modalEl.addEventListener('click', (e) => {
    if (e.target.id === 'editMemberModal') closeEditMemberModal(); // קליק על רקע
  });

  // בריחה עם ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditMemberModal();
  });
})();
// הפעלה על טעינת הדף
document.addEventListener('DOMContentLoaded', () => {
  initInvoicesUI();
});

async function initInvoicesUI() {
  const sec = document.querySelector('#section-invoices');
  if (!sec) return;

  // מודאל פעם אחת
  ensureUploadInvoiceModal();

  // כפתור "העלה חשבונית" פותח מודאל
  document.getElementById('btnUploadInvoice')?.addEventListener('click', (e) => {
    e.preventDefault();
    openUploadInvoiceModal();
  });

  // חיפוש לפי תיאור
  const header = sec.querySelector('.card-header .header-filters') || sec.querySelector('.card-header');
  if (header && !document.getElementById('invoicesSearchInput')) {
    const box = document.createElement('div');
    box.className = 'search-box';
    box.style.marginInlineStart = '8px';
    box.innerHTML = `<i class="fas fa-search"></i><input id="invoicesSearchInput" type="search" placeholder="חפש לפי תיאור" />`;
    header.prepend(box);
    const onSearch = debounce((v)=>loadInvoices(v),250);
    box.querySelector('input').addEventListener('input',(e)=>onSearch(e.target.value));
  }

  // טעינה ראשונית
  try { await loadInvoices(''); } catch(e){ console.error(e); }
}

function ensureUploadInvoiceModal() {
  if (document.getElementById('uploadInvoiceModal')) return;

  const modal = document.createElement('div');
  modal.id = 'uploadInvoiceModal';
  modal.className = 'modal hidden';
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
          <input type="text" id="inv_desc" placeholder="לדוגמה: חשבונית מס #1024 - לקוח כהן">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="inv_cancel">ביטול</button>
        <button class="btn btn-primary" id="inv_submit" type="button">העלה</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // מאזינים
  document.getElementById('inv_close_btn').onclick = closeUploadInvoiceModal;
  document.getElementById('inv_cancel').onclick    = closeUploadInvoiceModal;
  document.getElementById('inv_submit').onclick    = onSubmitUpload;
  modal.addEventListener('click', (e) => { if (e.target.id === 'uploadInvoiceModal') closeUploadInvoiceModal(); });

  // פידבק כשנבחר קובץ
  modal.querySelector('#inv_file').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) showToast?.(`נבחר: ${f.name}`, 'info', 900);
  });
}

function openUploadInvoiceModal() {
  document.getElementById('inv_file').value = '';
  document.getElementById('inv_desc').value = '';
  document.getElementById('uploadInvoiceModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeUploadInvoiceModal() {
  document.getElementById('uploadInvoiceModal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

async function onSubmitUpload(e) {
  e?.preventDefault?.();

  const modal  = document.getElementById('uploadInvoiceModal');
  const fileEl = modal?.querySelector('#inv_file');
  const descEl = modal?.querySelector('#inv_desc');

  const f    = fileEl?.files?.[0] || null;
  const desc = (descEl?.value || '').trim();

  if (!f)    { showToast?.('לא נבחר קובץ', 'warning'); return; }
  if (!desc) { showToast?.('יש להזין תיאור לחשבונית', 'warning'); return; }

  try {
    const csrf = await getCsrfToken();
const fd = new FormData();
fd.append('file', f);          // ← השם חייב להיות 'file'
fd.append('description', desc);

    showToast?.('מעלה חשבונית...', 'info');
    const res = await fetch('/api/invoices/upload', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': csrf }, // לא לשים Content-Type ידנית
      body: fd
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${res.status}`);

    await loadInvoices('');
    closeUploadInvoiceModal();
    showToast?.('החשבונית הועלתה בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    showToast?.(err.message || 'שגיאה בהעלאת החשבונית', 'error');
  }
}

// חיפוש/רשימה
async function loadInvoices(query='') {
  const listBox = document.getElementById('invoicesList');
  const emptyBox = document.getElementById('invoicesEmpty');
  if (!listBox || !emptyBox) return;

  listBox.innerHTML = `<div class="loading">טוען...</div>`;
  const url = query.trim()
    ? `/api/invoices/search?q=${encodeURIComponent(query.trim())}`
    : `/api/invoices/list`;

  const res  = await fetch(url, { credentials: 'include' });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${res.status}`);

  const arr = data.items || data.invoices || [];
  if (!arr.length) {
    listBox.style.display = 'none';
    emptyBox.style.display = '';
    return;
  }
  renderInvoices(arr);
  emptyBox.style.display = 'none';
  listBox.style.display = '';
}

function renderInvoices(items=[]) {
  const listBox = document.getElementById('invoicesList');
  if (!listBox) return;
  listBox.innerHTML = items.map(invoiceCardTemplate).join('');
}
// ---------- HELPERS ----------
function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0, val = n;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  const num = val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1);
  return `${num} ${units[i]}`;
}

function invoiceCardTemplate(it){
  const isPdf = (it.mimetype||'').includes('pdf') || /\.pdf$/i.test(it.originalname||'');
  const url   = it.file?.url || it.url;
  const desc  = it.description || '';
  const uploader = it.username || it.uploadedByN || it.uploadedBy?.name || it.uploadedBy?.email || 'לא ידוע';
  const size  = it.size || it.file?.bytes || 0;
  const at    = it.createdAt || it.uploadedAt || new Date().toISOString();

  const id = it.id || it._id; // נתמך משני הכיוונים

  return `
  <div class="invoice-card" data-id="${id}">
    <a class="link" href="${url?url:'#'}" ${url?'target="_blank" rel="noopener"':''}>
      <div class="meta">
        <div class="name" data-label='תיאור'><bdi>${escapeHtml(desc || 'חשבונית')}</bdi></div><br>
        <div class="sub" data-label='הועלה'><bdi>${escapeHtml(uploader)}</bdi></div><br>
        <div class="sub" data-label='תאריך'><bdi>${new Date(at).toLocaleString('he-IL')}</div>

      </div>
    </a>
    <button class="icon-btn danger btn-del-invoice" title="מחק"><i class="fas fa-trash"></i></button>
  </div>`;
}

function debounce(fn,ms=250){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
// מחיקת חשבונית מה־UI
document.getElementById('invoicesList')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-del-invoice');
  if (!btn) return;

  const card = btn.closest('.invoice-card');
  const id = card?.dataset.id;
  if (!id) return;

  if (!confirm('למחוק את החשבונית?')) return;

  try {
    const csrf = await getCsrfToken();
    const res = await fetch(`/api/invoices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'x-csrf-token': csrf }
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${res.status}`);

    // הסרה מה־DOM
    card.remove();

    // אם אין יותר חשבוניות – חזור למסך ריק והכפתור
    if (!document.querySelector('#invoicesList .invoice-card')) {
      document.getElementById('invoicesEmpty')?.style.removeProperty('display');
      document.getElementById('invoicesList')?.style.setProperty('display','none');
    }

    showToast?.('נמחק בהצלחה', 'success');
  } catch (err) {
    showToast?.(err.message || 'שגיאה במחיקה', 'error');
  }
});

})();


