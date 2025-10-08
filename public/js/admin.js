(() => {
  if (window.__ADMIN_INIT__) return;
  window.__ADMIN_INIT__ = true;

  // ===== TEAM TOKEN HANDLER =====
  const TEAM_TOKEN =
    new URLSearchParams(location.search).get("token") ||
    localStorage.getItem("teamToken") || "";

  if (TEAM_TOKEN) localStorage.setItem("teamToken", TEAM_TOKEN);

  // עטיפת fetch כך שתכלול תמיד את הטוקן (גם כ-Header וגם כ-Query Param)
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

  // עטיפה שמוודאת JSON ומחזירה אובייקט; זורקת שגיאה אם Non-JSON/!ok
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

  // ===== THEME =====
  function updateThemeIcon(theme) {
    const icon = document.getElementById("themeIcon");
    if (!icon) return;
    icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    updateThemeIcon(theme);
  }
  function initTheme() {
    const saved = localStorage.getItem("theme");
    applyTheme(saved === "dark" || saved === "light" ? saved : "light");
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  }

  // ===== CSRF =====
  async function getCsrfToken() {
    if (window.csrfToken) return window.csrfToken;
    const r = await fetchTeam("/csrf-token", { credentials: "include" });
    const j = await r.json();
    window.csrfToken = j.csrfToken;
    return window.csrfToken;
  }

  // ===== Data =====
  let TENANTS = [];
  let FEATURE_CATALOG = {};

  async function loadFeatureCatalog() {
    const data = await fetchTeamJSON("/api/admin/features-catalog");
    FEATURE_CATALOG = data.features || {};
  }

  function statusChip(on) {
    return `<span class="chip ${on ? "chip-on" : "chip-off"}">${on ? "פתוח" : "סגור"}</span>`;
  }

  function featureToggleHTML(tenantId, key, enabled) {
    const meta = FEATURE_CATALOG[key] || { label: key, icon: "" };
    return `
      <div class="feature-pill" data-tenant="${tenantId}" data-key="${key}" title="${meta.label}">
        <i class="fas ${meta.icon || ""}"></i>
        <span class="feature-label">${meta.label}</span>
        <label class="switch">
          <input type="checkbox" class="feature-toggle" ${enabled ? "checked" : ""}>
          <span class="slider"></span>
        </label>
        <span class="chip ${enabled ? "chip-on" : "chip-off"}">${enabled ? "פתוח" : "סגור"}</span>
      </div>`;
  }

  // if want address in table | <div class="t-sub">${t.settings?.address || ""}</div>
  function tenantRow(t) {
    return `
    <tr data-id="${t.id}">
      <td class="col-name" data-label="עסק">
        <div class="t-row">
          <div class="t-avatar badge">${(t.name || " ")[0]?.toUpperCase() || "A"}</div>
          <div class="t-info">
            <div class="t-title">${t.name || "—"}</div>
            <div class="t-sub">${new Date(t.createdAt).toLocaleDateString("he-IL")}</div>
          </div>
        </div>
      </td>

      <td class="col-owner" data-label="בעלים">
        <div class="t-row">
          <div class="t-avatar"><i class="fas fa-user"></i></div>
          <div class="t-info">
            <div class="t-title">${t.owner?.name || "—"}</div>
            <div class="t-sub">${t.owner?.email || ""}</div>
          </div>
        </div>
      </td>

      <td class="col-contact" data-label="פרטי התקשרות">
        <div class="t-info">
          <div class="t-title">${t.settings?.phone || "—"}</div>
        </div>
      </td>

      <td class="col-features center" data-label="פיצ'רים">
        <button class="btn btn-outline btn-sm btn-features" data-id="${t.id}">
          <i class="fas fa-sliders-h"></i> פיצ'רים
        </button>
      </td>
    </tr>`;
  }

  function renderTable(list) {
    const wrap = document.getElementById("tenantsTableWrap");
    if (!wrap) return;
    if (!list?.length) {
      wrap.innerHTML = `<div class="empty-state"><i class="fas fa-briefcase"></i><h3>אין עסקים</h3></div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>עסק</th>
            <th>בעלים</th>
            <th>פרטי התקשרות</th>
            <th class="center">פיצ'רים</th>
          </tr>
        </thead>
        <tbody>${list.map(tenantRow).join("")}</tbody>
      </table>
    `;

    let __sheetTenantId = null;
    let __sheetDraft = {};

    function getTenantById(id) {
      return TENANTS.find((t) => t.id === id);
    }

    function featuresToPlain(feats) {
      if (!feats) return {};
      if (feats instanceof Map) return Object.fromEntries(feats);
      return { ...feats };
    }

    function onOpenFeaturesSheet(e) {
      const id = e.currentTarget?.dataset?.id;
      const t = getTenantById(id);
      if (!t) return;

      __sheetTenantId = id;
      __sheetDraft = { ...featuresToPlain(t.features) };

      const sheet = document.getElementById("featuresSheet");
      const title = document.getElementById("sheetTitle");
      const list = document.getElementById("featuresList");
      if (!sheet || !list) return;

      title.textContent = `פיצ'רים – ${t.name || "עסק"}`;
      list.innerHTML = "";

      // בנה כרטיס לכל פיצ'ר מהקטלוג
      Object.entries(FEATURE_CATALOG).forEach(([key, meta]) => {
        const on = !!__sheetDraft[key];
        const item = document.createElement("div");
        item.className = "feature-item";
        item.innerHTML = `
          <i class="fas ${meta.icon || ""}" style="opacity:.85"></i>
          <div class="meta">
            <div class="title">${meta.label || key}</div>
            <div class="desc">${meta.desc || ""}</div>
          </div>
          <label class="switch">
            <input type="checkbox" data-key="${key}" ${on ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        `;
        list.appendChild(item);
      });

      // שינוי טוגל → עדכון דרפט
      list.onchange = (ev) => {
        const inp = ev.target.closest('input[type="checkbox"][data-key]');
        if (!inp) return;
        __sheetDraft[inp.dataset.key] = inp.checked;
      };

      sheet.classList.add("show");
    }

    async function onSaveFeaturesSheet() {
      if (!__sheetTenantId) return;
      try {
        showLoader?.("שומר פיצ'רים...", "מעדכן עסק", { forceAnim: true });
        const csrf = await getCsrfToken();
        await fetchTeamJSON(`/api/admin/tenants/${__sheetTenantId}/features`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify(__sheetDraft),
        });
        const idx = TENANTS.findIndex((t) => t.id === __sheetTenantId);
        if (idx >= 0) TENANTS[idx].features = { ...(__sheetDraft || {}) };
        closeFeaturesSheet();
        window.showToast?.("הפיצ'רים נשמרו", "success");
      } catch (err) {
        window.showToast?.(err?.message || "שגיאה בשמירת פיצ'רים", "error");
      } finally {
        hideLoader?.(true);
      }
    }

    function closeFeaturesSheet() {
      document.getElementById("featuresSheet")?.classList.remove("show");
      __sheetTenantId = null;
      __sheetDraft = {};
    }

    // האזנות גלובליות ל-Sheet
    document.addEventListener("click", (e) => {
      if (e.target.closest("#sheetSave")) onSaveFeaturesSheet();
      if (e.target.closest("#sheetCancel") || e.target.closest(".sheet-close")) closeFeaturesSheet();
      if (e.target.matches(".sheet-overlay.show")) closeFeaturesSheet();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeFeaturesSheet();
    });

    // חיבור כפתורי פתיחת ה-Sheet
    wrap.querySelectorAll(".btn-features").forEach((btn) => {
      btn.addEventListener("click", onOpenFeaturesSheet);
    });
  }

  async function onToggleFeature(e) {
    const pill = e.target.closest(".feature-pill");
    const tenantId = pill?.getAttribute("data-tenant");
    const key = pill?.getAttribute("data-key");
    if (!tenantId || !key) return;

    const newVal = !!e.target.checked;
    const chip = pill.querySelector(".chip");
    if (chip) {
      chip.classList.toggle("chip-on", newVal);
      chip.classList.toggle("chip-off", !newVal);
      chip.textContent = newVal ? "פתוח" : "סגור";
    }

    try {
      const csrf = await getCsrfToken();
      await fetchTeamJSON(`/api/admin/tenants/${tenantId}/features`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ key, value: newVal }),
      });
      const idx = TENANTS.findIndex((t) => t.id === tenantId);
      if (idx >= 0) {
        TENANTS[idx].features = { ...(TENANTS[idx].features || {}), [key]: newVal };
      }
      window.showToast?.("עודכן בהצלחה", "success");
    } catch (err) {
      // rollback
      e.target.checked = !newVal;
      const chip2 = pill.querySelector(".chip");
      if (chip2) {
        chip2.classList.toggle("chip-on", !newVal);
        chip2.classList.toggle("chip-off", newVal);
        chip2.textContent = !newVal ? "פתוח" : "סגור";
      }
      window.showToast?.(err?.message || "שגיאה בעדכון", "error");
    }
  }

  function bindSearch() {
    const inp = document.getElementById("tenantSearch");
    if (!inp) return;
    inp.addEventListener("input", () => {
      const q = (inp.value || "").trim().toLowerCase();
      if (!q) {
        renderTable(TENANTS);
        return;
      }
      const filtered = TENANTS.filter((t) =>
        String(t.name || "").toLowerCase().includes(q) ||
        String(t.owner?.name || "").toLowerCase().includes(q) ||
        String(t.owner?.email || "").toLowerCase().includes(q) ||
        String(t.settings?.phone || "").toLowerCase().includes(q) ||
        String(t.settings?.address || "").toLowerCase().includes(q)
      );
      renderTable(filtered);
    });
  }

  // ===== INIT =====
  document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    document.getElementById("themeToggleBtn")?.addEventListener("click", toggleTheme);

    // guard – אם תרצה לאכוף התחברות אדמין פלטפורמה, תוכל להשתמש ב-me כאן
    const me = await fetchTeamJSON('/me').catch(()=> ({}));
    // if (!me?.ok || !me.user) { location.href = '/login'; return; }
    // if (!me.isPlatformAdmin) { location.href = '/'; return; }

    showLoader?.();
    try {
      await loadFeatureCatalog();
      const data = await fetchTeamJSON("/api/admin/tenants");
      TENANTS = data.tenants || [];
      renderTable(TENANTS);
      bindSearch();
    } catch (err) {
      const wrap = document.getElementById("tenantsTableWrap");
      if (wrap) {
        wrap.innerHTML = `<div class="empty-state">
          <i class="fas fa-triangle-exclamation"></i>
          <h3>${err?.message || "שגיאה בטעינת נתונים"}</h3>
        </div>`;
      }
    } finally {
      hideLoader?.();
    }
  });

  // ===== CREATE TENANT MODAL =====
  const modal = document.getElementById("createTenantModal");
  const openBtn = document.querySelector(".createtenant");
  const cancelBtn = document.getElementById("cancelModal");
  const form = document.getElementById("createTenantForm");
  const submitBtn = form?.querySelector("button[type=submit]");

  openBtn?.addEventListener("click", () => {
    if (modal) modal.style.display = "flex";
  });
  cancelBtn?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });
  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "יוצר...";
    }

    const data = {
      tenantName: document.getElementById("tenantName").value.trim(),
      tenantPhone: document.getElementById("tenantPhone").value.trim(),
      name: document.getElementById("ownerName").value.trim(),
      email: document.getElementById("ownerEmail").value.trim().toLowerCase(),
    };

    if (!data.tenantName || !data.tenantPhone || !data.name || !data.email) {
      window.showToast?.("נא למלא את כל השדות", "error");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "צור עסק";
      }
      return;
    }

    try {
      const csrf = await getCsrfToken();

      await fetchTeamJSON("/auth/request-email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CSRF-Token": csrf },
        body: JSON.stringify(data),
      });

      await fetchTeamJSON("/auth/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CSRF-Token": csrf },
        body: JSON.stringify({ email: data.email }),
      });

      window.showToast?.("✅ העסק נוצר והוזמנה נשלחה לבעל העסק!", "success");
      setTimeout(() => { if (modal) modal.style.display = "none"; }, 1500);
      form.reset();
    } catch (err) {
      console.error("create tenant error:", err);
      window.showToast?.(err.message || "שגיאה בלתי צפויה", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "צור עסק";
      }
    }
  });
})();
