(() => {
  if (window.__LOGIN_PAGE_INIT__) return;
  window.__LOGIN_PAGE_INIT__ = true;

  const $ = (s, el=document) => el.querySelector(s);

  // DOM refs
  const nameEl       = $('#nameInput');
  const emailEl      = $('#emailInput');
  const tenantNameEl = $('#tenantNameInput');
  const userNameEl = $('#settingsUserName');
const tenantPhoneEl = $('#tenantPhoneInput');  // 🆕 הוספנו
  const codeEl       = $('#codeInput');
  const hintEl       = $('#hint');
  const codeBlk      = $('#codeBlock');
  const sendBtn      = $('#sendEmailCodeBtn');
  const verifyBtn    = $('#verifyEmailCodeBtn');

  const getCsrf = window.getCsrf || (async function getCsrfLocal() {
    const r = await fetch("/csrf-token", { credentials: "include" });
    const j = await r.json();
    return j.csrfToken;
  });

  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e||'').toLowerCase());

  // 🔹 שליחת קוד למייל
  sendBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const name       = (nameEl?.value || '').trim();
    const email      = (emailEl?.value || '').trim().toLowerCase();
    const tenantName = (tenantNameEl?.value || '').trim();  // 🆕 קוראים את שם העסק
const tenantPhone = (tenantPhoneEl?.value || '').trim();
    // ✅ בדיקות תקינות

  if (!name || !validateEmail(email) || !tenantName || !tenantPhone) {
    if (hintEl) hintEl.textContent = "יש למלא את כל השדות";
    return;
  }

    try {
    const res = await fetch('/auth/request-email-code', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-csrf-token': await getCsrf() // ✔️ הכותרת הנכונה ל-csurf
      },
      body: JSON.stringify({ 
        name, 
        email,
        tenantName,
        tenantPhone
      }),
      credentials: "include"
    });

      const data = res.headers.get('content-type')?.includes('application/json')
        ? await res.json()
        : { ok: res.ok, message: res.ok ? 'נשלח קוד' : 'שגיאה' };

      (window.showToast || console.log)(data.message || (data.ok ? "נשלח קוד" : "שגיאה"));

      if (res.ok && (data.ok !== false)) {
        if (codeBlk) {
          codeBlk.classList.remove('hidden');
          codeBlk.style.removeProperty('display');
          codeBlk.style.display = 'grid';
        }
        codeEl?.focus();
      } else {
        if (hintEl) hintEl.textContent = data.message || "לא הצלחנו לשלוח קוד.";
      }
    } catch (err) {
      console.error('request-email-code error:', err);
      (window.showToast || console.error)("שגיאה בשליחת קוד", "error");
    }
  });

  // 🔹 אימות קוד וכניסה
  verifyBtn?.addEventListener('click', async (e) => {
    e.preventDefault();

    const email = (emailEl?.value || '').trim().toLowerCase();
    const code  = (codeEl?.value || '').trim();

    if (!validateEmail(email) || !/^\d{6}$/.test(code)) {
      if (hintEl) hintEl.textContent = "בדוק אימייל וקוד (6 ספרות).";
      return;
    }

    const res = await fetch('/auth/verify-email-code', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'CSRF-Token': await getCsrf() 
      },
      body: JSON.stringify({ email, code }),
      credentials: "include"
    });

    const data = await res.json().catch(() => ({}));
    if (data?.ok) {
      window.showToast('מחובר! מעביר לדף הבית ...', 'success')
      window.location.href = data.redirect || "/";
    } else {
      window.showToast('קוד לא תקין', 'error')
    }
  });
})();