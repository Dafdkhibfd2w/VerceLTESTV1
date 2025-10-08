(() => {
  "use strict";

  // ======= CONFIG (התאם אם הראוטים שונים אצלך) =======
  const ROUTES = {
    csrf: "/csrf-token", // אופציונלי: אם יש אצלך נתיב כזה – יתווסף X-CSRF-TOKEN
    sendCode: "/auth/request-email-code",
    verifyCode: "/auth/verify-email-code",
    employeeLogin: "/auth/employee/login",       // התחברות עובד (אימייל+סיסמה)
    employeeForgot: "/auth/employee/forgot",     // איפוס סיסמה (קישור במייל)
    afterLoginRedirect: "/"                      // לאן לנווט אחרי התחברות מוצלחת
  };

  // ======= State =======
  let csrfToken = null;
  let busy = false;
  const loaderEl = document.getElementById("pageLoader");

  // ======= Helpers =======
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const setBusy = (val) => {
    busy = !!val;
    if (loaderEl) loaderEl.style.display = busy ? "block" : "none";
    $$("button").forEach(b => b.disabled = busy);
  };

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }

  function trim(v) { return String(v || "").trim(); }

  async function withTimeout(promise, ms = 15000) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error("Timeout")), ms);
    });
    try { return await Promise.race([promise, timeout]); }
    finally { clearTimeout(t); }
  }

  function toast(msg, type = "info") {
    // נוטיפיקציה קלה – אפשר לחבר למערכת הטוסט שלך אם קיימת
    console.log(`[${type.toUpperCase()}] ${msg}`);
    const hint = $("#ownerHint");
    if (hint) { hint.textContent = msg; }
  }

  function setText(el, msg) {
    if (!el) return;
    el.textContent = msg || "";
  }

  async function fetchCSRF() {
    if (!ROUTES.csrf) return null;
    try {
      const res = await withTimeout(fetch(ROUTES.csrf, { credentials: "include" }));
      if (!res.ok) return null;
      const data = await res.json();
      csrfToken = data?.csrfToken || null;
      return csrfToken;
    } catch { return null; }
  }

  function buildHeaders(isJSON = true) {
    const h = {};
    if (isJSON) h["Content-Type"] = "application/json";
    if (csrfToken) h["X-CSRF-TOKEN"] = csrfToken;
    return h;
  }

  async function safeFetch(url, options = {}) {
    const opts = {
      method: options.method || "GET",
      credentials: "include",
      headers: { ...(options.headers || {}) },
      body: options.body
    };
    if (!opts.headers["Content-Type"] && options.json !== false) {
      opts.headers["Content-Type"] = "application/json";
    }
    if (csrfToken) opts.headers["X-CSRF-TOKEN"] = csrfToken;

    return withTimeout(fetch(url, opts));
  }

  // ======= Tabs init =======
  (function initTabs() {
    const tabs = [
      { btn: $("#tab-owner"),    panel: $("#panel-owner") },
      { btn: $("#tab-employee"), panel: $("#panel-employee") }
    ];
    tabs.forEach(t => t.btn?.addEventListener("click", () => {
      tabs.forEach(x => {
        x.btn.setAttribute("aria-selected", String(x === t));
        x.panel.classList.toggle("active", x === t);
      });
      // נקה הודעות קודמות
      setText($("#ownerHint"), "");
      setText($("#empHint"), "");
    }));
  })();

  // ======= Owner/Manager (OTP) =======
  const ownerEls = {
    form: $("#ownerForm"),
    name: $("#nameInput"),
    email: $("#emailInput"),
    tenantName: $("#tenantNameInput"),
    tenantPhone: $("#tenantPhoneInput"),
    codeBlock: $("#codeBlock"),
    code: $("#codeInput"),
    sendBtn: $("#sendEmailCodeBtn"),
    verifyBtn: $("#verifyEmailCodeBtn"),
    hint: $("#ownerHint")
  };

  function validateOwnerInputs() {
    const name = trim(ownerEls.name.value);
    const email = trim(ownerEls.email.value).toLowerCase();
    const tenantName = trim(ownerEls.tenantName.value);
    if (!name || !tenantName || !isEmail(email)) {
      setText(ownerEls.hint, "בדוק שם, אימייל ושם עסק — חובה למלא בצורה תקינה.");
      return null;
    }
    return { name, email, tenantName, tenantPhone: trim(ownerEls.tenantPhone.value) };
  }

  ownerEls?.sendBtn?.addEventListener("click", async () => {
    if (busy) return;
    const rec = validateOwnerInputs();
    if (!rec) return;

    try {
      setBusy(true);
      await fetchCSRF(); // אופציונלי
      const res = await safeFetch(ROUTES.sendCode, {
        method: "POST",
        body: JSON.stringify({
          name: rec.name,
          email: rec.email,
          tenantName: rec.tenantName,
          tenantPhone: rec.tenantPhone
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setText(ownerEls.hint, data?.message || "שליחת קוד נכשלה.");
        return;
      }
      setText(ownerEls.hint, "שלחנו קוד למייל. הזן את הקוד ולחץ על 'אמת והתחבר'.");
      ownerEls.codeBlock?.classList.remove("hidden");
      ownerEls.codeBlock?.setAttribute("aria-hidden", "false");
      ownerEls.code?.focus();
    } catch (err) {
      setText(ownerEls.hint, "שגיאה ברשת. נסה שוב.");
    } finally { setBusy(false); }
  });

  ownerEls?.verifyBtn?.addEventListener("click", async () => {
    if (busy) return;
    const email = trim(ownerEls.email.value).toLowerCase();
    const code = trim(ownerEls.code.value);
    if (!isEmail(email) || !/^\d{4,8}$/.test(code)) {
      setText(ownerEls.hint, "קוד אימות לא תקין / אימייל שגוי.");
      return;
    }

    try {
      setBusy(true);
      await fetchCSRF(); // אופציונלי
      const res = await safeFetch(ROUTES.verifyCode, {
        method: "POST",
        body: JSON.stringify({ email, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setText(ownerEls.hint, data?.message || "האימות נכשל.");
        return;
      }
      // הצלחה → ניווט
      window.location.assign(data?.redirect || ROUTES.afterLoginRedirect);
    } catch (err) {
      setText(ownerEls.hint, "שגיאה באימות. נסה שוב.");
    } finally { setBusy(false); }
  });

  // ======= Employee (email + password) =======
  const empEls = {
    form: $("#employeeForm"),
    email: $("#empEmailInput"),
    password: $("#empPasswordInput"),
    loginBtn: $("#empLoginBtn"),
    forgotBtn: $("#empForgotBtn"),
    hint: $("#empHint"),
  };

  empEls?.form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;

    const email = trim(empEls.email.value).toLowerCase();
    const password = trim(empEls.password.value);

    if (!isEmail(email) || password.length < 6) {
      setText(empEls.hint, "בדוק אימייל וסיסמה (לפחות 6 תווים).");
      return;
    }

    try {
      setBusy(true);
      await fetchCSRF(); // אופציונלי
      const res = await safeFetch(ROUTES.employeeLogin, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setText(empEls.hint, data?.message || "התחברות נכשלה.");
        return;
      }
      window.location.assign(data?.redirect || ROUTES.afterLoginRedirect);
    } catch (err) {
      setText(empEls.hint, "שגיאה ברשת. נסה שוב.");
    } finally { setBusy(false); }
  });

  empEls?.forgotBtn?.addEventListener("click", async () => {
    if (busy) return;

    const email = trim(empEls.email.value).toLowerCase();
    if (!isEmail(email)) {
      setText(empEls.hint, "הכנס אימייל תקין כדי לאפס סיסמה.");
      empEls.email?.focus();
      return;
    }

    try {
      setBusy(true);
      await fetchCSRF(); // אופציונלי
      const res = await safeFetch(ROUTES.employeeForgot, {
        method: "POST",
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setText(empEls.hint, data?.message || "לא הצלחנו לשלוח קישור איפוס.");
        return;
      }
      setText(empEls.hint, "שלחנו לך מייל לאיפוס סיסמה. בדוק דואר נכנס/ספאם.");
    } catch (err) {
      setText(empEls.hint, "שגיאה ברשת. נסה שוב.");
    } finally { setBusy(false); }
  });
(async function initInviteFlow() {
  const params = new URLSearchParams(location.search);
  const token = params.get("invite");
  if (!token) return;

  // נעבור לטאב "עובד"
  document.getElementById("tab-employee")?.click();

  const emailEl   = document.getElementById("empEmailInput");
  const passEl    = document.getElementById("empPasswordInput");
  const nameRow   = document.querySelector("#panel-employee .invite-extra");
  const nameEl    = document.getElementById("empNameInput");
  const hintEl    = document.getElementById("empHint");
  const noteEl    = document.getElementById("empInviteNote");
  const formEl    = document.getElementById("employeeForm");
  const submitBtn = document.getElementById("empLoginBtn");

  try {
    // נטען פרטי הזמנה
    const res = await fetch(`/auth/invite/${encodeURIComponent(token)}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok || data?.ok === false) {
    //   (noteEl || hintEl).textContent = data?.message || "הזמנה לא תקפה.";
      showToast(data?.message || "הזמנה לא תקפה.", 'error')
      return;
    }

    // מצב הזמנה: ננעל אימייל, נציג שדה שם, נשנה טקסט כפתור
    if (emailEl) {
      emailEl.value = data.email || "";
      emailEl.readOnly = true;
      emailEl.setAttribute("aria-readonly", "true");
    }
    if (nameRow) nameRow.style.display = "";
    if (submitBtn) showToast("הצטרפות והגדרת סיסמה", 'success');
    if (noteEl) showToast(`הזמנה ל-${data.tenant?.name || "העסק"} (${data.role || "employee"})`, 'error');
    

    // מחליפים את ה-submit: עובר ל-accept invite
    formEl?.addEventListener("submit", async (e) => {
            const tRes = await fetch('/csrf-token', { credentials: 'include' });
    const tJson = await tRes.json();
    const csrf = tJson?.csrfToken;
      e.preventDefault();
      const name = (nameEl?.value || "").trim();
      const password = (passEl?.value || "").trim();
      if (!name || password.length < 8) {
        (hintEl || noteEl).textContent = "יש למלא שם מלא וסיסמה (לפחות 8 תווים).";
        return;
      }
      try {
    const r = await fetch('/auth/accept-invite', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf
      },
      body: JSON.stringify({ token, name, password })
    });
        const j = await r.json();
        if (!r.ok || j?.ok === false) {
          showToast(j?.message || "קבלת ההזמנה נכשלה.", 'error');
          showToast(j?.message || "קבלת ההזמנה נכשלה.", 'error');

          return;
        }
        location.assign(j?.redirect || "/");
      } catch {
          showToast('שגיאה ברשת. נסה שוב.', 'error');
      }
    }, { once: true });

  } catch {
          showToast('שגיאה בטעינת ההזמנה.', 'error');
  }
})();



document.getElementById('ownerLoginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('ownerEmail').value.trim();
  const password = document.getElementById('ownerPass').value;
  const hint = document.getElementById('ownerHint');

  try {
    const t = await fetch('/csrf-token', { credentials: 'include' }).then(r=>r.json());
    const res = await fetch('/auth/owner/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': t.csrfToken },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${res.status}`);
    location.href = data.redirect || '/';
  } catch (err) {
    hint.textContent = err.message || 'שגיאה בהתחברות';
  }
});

})();
