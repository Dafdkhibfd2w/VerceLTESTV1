function showToast(message, type = "info") {
  // צור קונטיינר אם לא קיים
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  // אייקונים לפי סוג
  const icons = {
    success: "fa-check-circle",
    error: "fa-times-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle"
  };

  // צור טוסט
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // הסרה אוטומטית אחרי 4 שניות
  setTimeout(() => {
    toast.remove();
    if (container.children.length === 0) container.remove();
  }, 4000);
}

let __loaderCount = 0;

function injectLoader() {
  if (document.getElementById("loadingOverlay")) return;
  const wrap = document.createElement("div");
  wrap.id = "loadingOverlay";
  wrap.className = "loading-overlay";
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-live", "polite");
  wrap.innerHTML = `
    <div class="loading-card" aria-label="טוען נתונים">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-text" id="loadingText">טוען נתונים...</div>
      <div class="loading-subtext" id="loadingSubtext">מחבר למסד נתונים, נא להמתין</div>
      <div class="loading-bar" aria-hidden="true"></div>
    </div>
  `;
  document.body.appendChild(wrap);
}

function showLoader(text = "טוען נתונים...", subtext = "מביא מידע מהשרת", { forceAnim = true } = {}) {
  injectLoader();
  const overlay = document.getElementById("loadingOverlay");
  const t = document.getElementById("loadingText");
  const st = document.getElementById("loadingSubtext");
  if (t) t.textContent = text;
  if (st) st.textContent = subtext;

  if (forceAnim) overlay.classList.add("force-anim");
  __loaderCount++;
  overlay.classList.add("active");
  document.body.setAttribute("aria-busy", "true");
  document.body.classList.add("loading");
}

function hideLoader(force = false) {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  if (force) __loaderCount = 0;
  else __loaderCount = Math.max(0, __loaderCount - 1);

  if (__loaderCount === 0) {
    overlay.classList.remove("active");
    document.body.removeAttribute("aria-busy");
    document.body.classList.remove("loading");
  }
}

