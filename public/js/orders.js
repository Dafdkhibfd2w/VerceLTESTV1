// public/js/orders.js
// ניהול הזמנות

let currentSuppliers = [];
let currentDate = null;
const DAYS_NAMESs = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ========================================
// אתחול
// ========================================
function initOrders() {
  if (window.__ORDERS_INITIALIZED__) return;
  window.__ORDERS_INITIALIZED__ = true;

  // הגדר תאריך היום כברירת מחדל
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('orderDate');
  if (dateInput) {
    dateInput.value = today;
  }

  // כפתור טעינת ספקים
  const loadBtn = document.getElementById('loadSuppliersBtn');
  if (loadBtn) {
    loadBtn.addEventListener('click', loadSuppliersByDate);
  }

  // כפתור שמירת הזמנות
  const saveBtn = document.getElementById('saveOrdersBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveOrders);
  }

  // פילטרי סטטוס
  document.querySelectorAll('.status-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.status-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const status = btn.dataset.status;
      loadExistingOrders(currentDate, status);
    });
  });
}

// ========================================
// טעינת ספקים לפי תאריך
// ========================================
async function loadSuppliersByDate() {
  try {
    const dateInput = document.getElementById('orderDate');
    const date = dateInput.value;

    if (!date) {
      showToast('בחר תאריך', 'warning');
      return;
    }

    currentDate = date;

    // הצג loading
    const container = document.getElementById('suppliersOrdersContainer');
    container.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 16px;">טוען ספקים...</p></div>';

    // טען ספקים
    const suppliersResponse = await fetch(`/api/orders/suppliers-by-date?date=${date}`, {
      credentials: 'include',
      headers: { 'X-CSRF-Token': window.csrfToken }
    });

    if (!suppliersResponse.ok) throw new Error('Failed to load suppliers');

    const suppliersData = await suppliersResponse.json();

    if (!suppliersData.ok) {
      throw new Error(suppliersData.message || 'Failed to load suppliers');
    }

    currentSuppliers = suppliersData.suppliers || [];

    // טען הזמנות קיימות לתאריך זה
    const ordersResponse = await fetch(`/api/orders?date=${date}`, {
      credentials: 'include',
      headers: { 'X-CSRF-Token': window.csrfToken }
    });

    let existingOrders = {};
    if (ordersResponse.ok) {
      const ordersData = await ordersResponse.json();
      if (ordersData.ok && ordersData.orders) {
        // ארגן הזמנות לפי ספק
        ordersData.orders.forEach(order => {
          existingOrders[order.supplier._id || order.supplier] = order;
        });
      }
    }

    // עדכן מידע על התאריך
    const dateInfo = document.getElementById('dateInfo');
    const selectedDate = new Date(date);
    const dayName = DAYS_NAMESs[selectedDate.getDay()];
    
    const hasExistingOrders = Object.keys(existingOrders).length > 0;
    dateInfo.innerHTML = `
      ${hasExistingOrders ? '<i class="fas fa-check-circle" style="color: var(--success);"></i>' : '<i class="fas fa-calendar-day"></i>'}
      תאריך: ${new Date(date).toLocaleDateString('he-IL')} (יום ${dayName}) - ${currentSuppliers.length} ספקים
      ${hasExistingOrders ? '<span style="color: var(--success); font-weight: 600; margin-right: 12px;">• יש הזמנות שמורות</span>' : ''}
    `;
    dateInfo.style.display = 'block';

    // הצג ספקים עם הזמנות קיימות
    renderSuppliersOrders(existingOrders);

  } catch (error) {
    console.error('Error loading suppliers:', error);
    showToast(error.message || 'שגיאה בטעינת ספקים', 'error');
    document.getElementById('suppliersOrdersContainer').innerHTML = '';
  }
}

// ========================================
// רינדור ספקים ומוצרים
// ========================================
function renderSuppliersOrders(existingOrders = {}) {
  const container = document.getElementById('suppliersOrdersContainer');
  const saveBtn = document.getElementById('saveOrdersBtn');

  if (currentSuppliers.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <i class="fas fa-info-circle" style="font-size: 3rem; color: var(--text-light); margin-bottom: var(--space-lg);"></i>
            <h3>אין ספקים ביום זה</h3>
            <p>לא נמצאו ספקים המגיעים בתאריך שנבחר</p>
          </div>
        </div>
      </div>
    `;
    saveBtn.style.display = 'none';
    return;
  }

  saveBtn.style.display = 'inline-flex';

  container.innerHTML = currentSuppliers.map((supplier, index) => {
    const existingOrder = existingOrders[supplier._id];
    const orderNotes = existingOrder ? existingOrder.notes || '' : '';
    
    // צור מפה של מוצרים קיימים
    const existingItems = {};
    if (existingOrder && existingOrder.items) {
      existingOrder.items.forEach(item => {
        existingItems[item.productName] = item.quantity;
      });
    }

    return `
    <div class="card supplier-order-card" data-supplier-id="${supplier._id}" style="margin-bottom: var(--space-lg);">
      <div class="card-header">
        <h3>
          <i class="fas fa-building"></i>
          ${escapeHtml(supplier.name)}
          ${existingOrder ? '<span style="margin-right: 8px; padding: 4px 8px; background: var(--success); color: white; border-radius: var(--radius); font-size: var(--text-xs);">הוזמן</span>' : ''}
        </h3>
        <div style="display: flex; gap: var(--space-xs); align-items: center;">
          <button type="button" class="btn btn-sm btn-outline select-all-btn" data-index="${index}">
            <i class="fas fa-check-double"></i>
            בחר הכל
          </button>
        </div>
      </div>
      <div class="card-body">
        ${supplier.products && supplier.products.length > 0 ? `
          <div class="products-order-list">
            ${supplier.products.map((product, pIndex) => {
              const existingQty = existingItems[product.name] || 0;
              const isChecked = existingQty > 0;
              
              return `
              <div class="product-order-row">
                <div class="product-order-info">
                  <label class="product-checkbox">
                    <input type="checkbox" class="product-select" data-supplier-index="${index}" data-product-index="${pIndex}" ${isChecked ? 'checked' : ''} />
                    <span class="product-name">${escapeHtml(product.name)}</span>
                    ${product.unit ? `<span class="product-unit">(${escapeHtml(product.unit)})</span>` : ''}
                  </label>
                </div>
                <div class="product-order-quantity">
                  <input 
                    type="number" 
                    class="quantity-input" 
                    placeholder="כמות" 
                    min="0" 
                    step="0.5"
                    data-supplier-index="${index}" 
                    data-product-index="${pIndex}"
                    value="${existingQty > 0 ? existingQty : ''}"
                    ${!isChecked ? 'disabled' : ''}
                  />
                </div>
              </div>
            `;}).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <p>אין מוצרים מוגדרים לספק זה</p>
          </div>
        `}
        
        <div class="order-notes" style="margin-top: var(--space-md);">
          <label>
            <i class="fas fa-sticky-note"></i>
            הערות להזמנה
          </label>
          <textarea 
            class="order-notes-input" 
            rows="2" 
            placeholder="הערות נוספות להזמנה זו..."
            data-supplier-index="${index}"
          >${orderNotes}</textarea>
        </div>
      </div>
    </div>
  `;}).join('');

  // Event listeners
  setupOrderEventListeners();
}

// ========================================
// הגדרת Event Listeners
// ========================================
function setupOrderEventListeners() {
  // checkbox של מוצר - מאפשר/מבטל שדה כמות
  document.querySelectorAll('.product-select').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const supplierIndex = e.target.dataset.supplierIndex;
      const productIndex = e.target.dataset.productIndex;
      const quantityInput = document.querySelector(`input.quantity-input[data-supplier-index="${supplierIndex}"][data-product-index="${productIndex}"]`);
      
      if (quantityInput) {
        quantityInput.disabled = !e.target.checked;
        if (e.target.checked) {
          quantityInput.focus();
          if (!quantityInput.value) {
            quantityInput.value = 1;
          }
        } else {
          quantityInput.value = '';
        }
      }
    });
  });

  // שדה כמות - סימון אוטומטי של checkbox
  document.querySelectorAll('.quantity-input').forEach(input => {
    input.addEventListener('input', (e) => {
      if (e.target.value && parseFloat(e.target.value) > 0) {
        const supplierIndex = e.target.dataset.supplierIndex;
        const productIndex = e.target.dataset.productIndex;
        const checkbox = document.querySelector(`input.product-select[data-supplier-index="${supplierIndex}"][data-product-index="${productIndex}"]`);
        if (checkbox && !checkbox.checked) {
          checkbox.checked = true;
          e.target.disabled = false;
        }
      }
    });
  });

  // כפתור "בחר הכל"
  document.querySelectorAll('.select-all-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = e.currentTarget.dataset.index;
      const checkboxes = document.querySelectorAll(`.product-select[data-supplier-index="${index}"]`);
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      
      checkboxes.forEach(checkbox => {
        checkbox.checked = !allChecked;
        const productIndex = checkbox.dataset.productIndex;
        const quantityInput = document.querySelector(`input.quantity-input[data-supplier-index="${index}"][data-product-index="${productIndex}"]`);
        if (quantityInput) {
          quantityInput.disabled = allChecked;
          if (!allChecked && !quantityInput.value) {
            quantityInput.value = 1;
          }
        }
      });
      
      btn.innerHTML = allChecked ? 
        '<i class="fas fa-check-double"></i> בחר הכל' : 
        '<i class="fas fa-times"></i> בטל בחירה';
    });
  });
}

// ========================================
// שמירת הזמנות
// ========================================
async function saveOrders() {
  try {
    if (!currentDate) {
      showToast('בחר תאריך', 'warning');
      return;
    }

    const orders = [];

    // איסוף נתוני הזמנות
    currentSuppliers.forEach((supplier, supplierIndex) => {
      const items = [];
      
      supplier.products.forEach((product, productIndex) => {
        const checkbox = document.querySelector(`.product-select[data-supplier-index="${supplierIndex}"][data-product-index="${productIndex}"]`);
        const quantityInput = document.querySelector(`.quantity-input[data-supplier-index="${supplierIndex}"][data-product-index="${productIndex}"]`);
        
        if (checkbox && checkbox.checked && quantityInput && quantityInput.value) {
          const quantity = parseFloat(quantityInput.value);
          if (quantity > 0) {
            items.push({
              productName: product.name,
              quantity: quantity,
              unit: product.unit || '',
              notes: ''
            });
          }
        }
      });

      if (items.length > 0) {
        const notesTextarea = document.querySelector(`.order-notes-input[data-supplier-index="${supplierIndex}"]`);
        
        orders.push({
          supplierId: supplier._id,
          supplierName: supplier.name,
          items: items,
          notes: notesTextarea ? notesTextarea.value.trim() : ''
        });
      }
    });

    if (orders.length === 0) {
      showToast('בחר לפחות מוצר אחד להזמנה', 'warning');
      return;
    }

    // שמירה בשרת
    const saveBtn = document.getElementById('saveOrdersBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';

    // וודא שיש CSRF token
    if (!window.csrfToken) {
      const csrfResponse = await fetch('/csrf-token');
      const csrfData = await csrfResponse.json();
      window.csrfToken = csrfData.csrfToken;
    }

    const response = await fetch('/api/orders', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrfToken
      },
      body: JSON.stringify({
        date: currentDate,
        orders: orders
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to save orders');
    }

    showToast(data.message || 'ההזמנות נשמרו בהצלחה!', 'success');
    
    // רענן הזמנות קיימות
    loadExistingOrders(currentDate);
    
    // נקה טופס
    loadSuppliersByDate();

  } catch (error) {
    console.error('Error saving orders:', error);
    showToast(error.message || 'שגיאה בשמירת הזמנות', 'error');
  } finally {
    const saveBtn = document.getElementById('saveOrdersBtn');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save"></i> שמור הזמנות';
  }
}

// ========================================
// טעינת הזמנות קיימות
// ========================================
async function loadExistingOrders(date, status = 'all') {
  try {
    if (!date) return;

    let url = `/api/orders?date=${date}`;
    if (status && status !== 'all') {
      url += `&status=${status}`;
    }

    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'X-CSRF-Token': window.csrfToken }
    });

    if (!response.ok) throw new Error('Failed to load orders');

    const data = await response.json();

    if (data.ok) {
      renderExistingOrders(data.orders || []);
    }

  } catch (error) {
    console.error('Error loading existing orders:', error);
  }
}

// ========================================
// רינדור הזמנות קיימות
// ========================================
function renderExistingOrders(orders) {
  const list = document.getElementById('existingOrdersList');

  const statusLabels = {
    draft: 'טיוטה',
    ordered: 'הוזמן',
    received: 'התקבל',
    cancelled: 'בוטל'
  };

  const statusColors = {
    draft: '#95a5a6',
    ordered: '#3498db',
    received: '#27ae60',
    cancelled: '#e74c3c'
  };

  list.innerHTML = orders.map(order => `
    <div class="order-card" style="margin-bottom: var(--space-md); padding: var(--space-md); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-sm);">
        <div>
          <h4 style="margin: 0; font-size: var(--text-lg);">
            <i class="fas fa-building"></i>
            ${escapeHtml(order.supplierName)}
          </h4>
          <p style="margin: 4px 0 0 0; color: var(--text-secondary); font-size: var(--text-sm);">
            ${order.items.length} פריטים | סה"כ: ${order.totalItems} יחידות
          </p>
        </div>
        <span style="padding: 4px 12px; background: ${statusColors[order.status]}; color: white; border-radius: var(--radius); font-size: var(--text-sm); font-weight: 600;">
          ${statusLabels[order.status]}
        </span>
      </div>
      
      <div style="margin-top: var(--space-sm); padding-top: var(--space-sm); border-top: 1px solid var(--border);">
        ${order.items.slice(0, 3).map(item => `
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: var(--text-sm);">
            <span>${escapeHtml(item.productName)} ${item.unit ? `(${escapeHtml(item.unit)})` : ''}</span>
            <strong>${item.quantity}</strong>
          </div>
        `).join('')}
        ${order.items.length > 3 ? `<p style="margin-top: 8px; color: var(--text-secondary); font-size: var(--text-sm);">ועוד ${order.items.length - 3} פריטים...</p>` : ''}
      </div>
      
      ${order.notes ? `
        <div style="margin-top: var(--space-sm); padding: var(--space-sm); background: var(--bg-base); border-radius: var(--radius); font-size: var(--text-sm);">
          <i class="fas fa-sticky-note"></i> ${escapeHtml(order.notes)}
        </div>
      ` : ''}
    </div>
  `).join('');
}

// ========================================
// Escape HTML
// ========================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========================================
// אתחול כשעוברים לעמוד הזמנות
// ========================================
window.addEventListener('hashchange', () => {
  if (location.hash === '#orders') {
    setTimeout(initOrders, 100);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (location.hash === '#orders') {
    setTimeout(initOrders, 500);
  }
});