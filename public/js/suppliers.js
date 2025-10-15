// public/js/suppliers.js
// ניהול ספקים

let allSuppliers = [];
let currentEditSupplierId = null;

// מילון ימים
const DAYS_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
const DAYS_SHORT = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\''];

// ========================================
// פונקציות Modal
// ========================================
function openSupplierModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeSupplierModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// ========================================
// טעינת ספקים
// ========================================
async function loadSuppliers() {
  try {
    const response = await fetch('/api/suppliers', {
      credentials: 'include',
      headers: { 'X-CSRF-Token': window.csrfToken }
    });
    
    if (!response.ok) throw new Error('Failed to load suppliers');
    
    const data = await response.json();
    if (data.ok) {
      allSuppliers = data.suppliers || [];
      renderSuppliers(allSuppliers);
    }
  } catch (error) {
    console.error('Error loading suppliers:', error);
    showToast('שגיאה בטעינת ספקים', 'error');
  }
}

// ========================================
// רינדור ספקים
// ========================================
function renderSuppliers(suppliers) {
  const grid = document.getElementById('suppliersGrid');
  const emptyState = document.getElementById('suppliersEmptyState');
  
  if (!suppliers || suppliers.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  
  grid.innerHTML = suppliers.map(supplier => `
    <div class="supplier-card" data-id="${supplier._id}">
      <div class="supplier-card-header">
        <div>
          <div class="supplier-name">${escapeHtml(supplier.name)}</div>
          <div class="supplier-phone">
            <i class="fas fa-phone"></i>
            ${escapeHtml(supplier.phone)}
          </div>
        </div>
        <div class="supplier-actions">
          <button class="icon-btn edit-supplier" data-id="${supplier._id}" title="עריכה">
            <i class="fas fa-edit"></i>
          </button>
          <button class="icon-btn delete delete-supplier" data-id="${supplier._id}" title="מחיקה">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      ${supplier.deliveryDays && supplier.deliveryDays.length > 0 ? `
        <div class="supplier-delivery-days">
          <div class="supplier-delivery-days-label">ימי הגעה:</div>
          <div class="delivery-days-chips">
            ${supplier.deliveryDays.sort((a, b) => a - b).map(day => `
              <span class="day-chip">${DAYS_SHORT[day]}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${supplier.products && supplier.products.length > 0 ? `
        <div class="supplier-products">
          <div class="supplier-products-label">מוצרים (${supplier.products.length}):</div>
          <div class="products-list">
            ${supplier.products.slice(0, 3).map(product => `
              <div class="product-item">
                <i class="fas fa-box"></i>
                ${escapeHtml(product.name)}
                ${product.unit ? `<span style="color: var(--text-secondary);">(${escapeHtml(product.unit)})</span>` : ''}
              </div>
            `).join('')}
            ${supplier.products.length > 3 ? `
              <div class="product-item" style="color: var(--text-secondary); font-style: italic;">
                ועוד ${supplier.products.length - 3} מוצרים...
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
      
      ${supplier.notes ? `
        <div style="margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--border); font-size: var(--text-sm); color: var(--text-secondary);">
          <i class="fas fa-sticky-note"></i> ${escapeHtml(supplier.notes)}
        </div>
      ` : ''}
    </div>
  `).join('');
  
  // Event listeners
  document.querySelectorAll('.edit-supplier').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      openEditSupplierModal(id);
    });
  });
  
  document.querySelectorAll('.delete-supplier').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteSupplier(id);
    });
  });
}

// ========================================
// חיפוש ספקים
// ========================================
function setupSupplierSearch() {
  const searchInput = document.getElementById('supplierSearch');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      renderSuppliers(allSuppliers);
      return;
    }
    
    const filtered = allSuppliers.filter(supplier => {
      return supplier.name.toLowerCase().includes(query) ||
             supplier.phone.includes(query) ||
             (supplier.products && supplier.products.some(p => p.name.toLowerCase().includes(query)));
    });
    
    renderSuppliers(filtered);
  });
}

// ========================================
// פתיחת מודאל הוספת ספק
// ========================================
function openAddSupplierModal() {
  currentEditSupplierId = null;
  document.getElementById('supplierModalTitle').textContent = 'הוסף ספק חדש';
  document.getElementById('supplierEditId').value = '';
  document.getElementById('supplierForm').reset();
  
  // נקה מוצרים
  document.getElementById('productsContainer').innerHTML = '';
  
  // נקה סימון ימים
  document.querySelectorAll('input[name="deliveryDay"]').forEach(cb => cb.checked = false);
  
  openSupplierModal('supplierModal');
}

// ========================================
// פתיחת מודאל עריכת ספק
// ========================================
async function openEditSupplierModal(supplierId) {
  try {
    const response = await fetch(`/api/suppliers/${supplierId}`, {
      credentials: 'include',
      headers: { 'X-CSRF-Token': window.csrfToken }
    });
    
    if (!response.ok) throw new Error('Failed to load supplier');
    
    const data = await response.json();
    if (!data.ok || !data.supplier) throw new Error('Invalid response');
    
    const supplier = data.supplier;
    currentEditSupplierId = supplierId;
    
    // מלא את הטופס
    document.getElementById('supplierModalTitle').textContent = 'עריכת ספק';
    document.getElementById('supplierEditId').value = supplierId;
    document.getElementById('supplierName').value = supplier.name || '';
    document.getElementById('supplierPhone').value = supplier.phone || '';
    document.getElementById('supplierNotes').value = supplier.notes || '';
    
    // סמן ימי הגעה
    document.querySelectorAll('input[name="deliveryDay"]').forEach(cb => {
      cb.checked = supplier.deliveryDays && supplier.deliveryDays.includes(parseInt(cb.value));
    });
    
    // טען מוצרים
    const container = document.getElementById('productsContainer');
    container.innerHTML = '';
    if (supplier.products && supplier.products.length > 0) {
      supplier.products.forEach(product => {
        addProductRow(product);
      });
    }
    
    openSupplierModal('supplierModal');
    
  } catch (error) {
    console.error('Error loading supplier for edit:', error);
    showToast('שגיאה בטעינת נתוני ספק', 'error');
  }
}

// ========================================
// הוספת שורת מוצר
// ========================================
function addProductRow(product = null) {
  const container = document.getElementById('productsContainer');
  const productId = Date.now() + Math.random();
  
  const row = document.createElement('div');
  row.className = 'product-row';
  row.dataset.productId = productId;
  
  row.innerHTML = `
    <div class="product-fields">
      <input type="text" 
             class="product-name" 
             placeholder="שם המוצר *" 
             value="${product ? escapeHtml(product.name) : ''}" 
             required />
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm);">
        <input type="text" 
               class="product-unit" 
               placeholder="יחידה (ק״ג, יח׳...)" 
               value="${product && product.unit ? escapeHtml(product.unit) : ''}" />
        <input type="number" 
               class="product-price" 
               placeholder="מחיר אחרון" 
               step="0.01"
               value="${product && product.lastPrice ? product.lastPrice : ''}" />
      </div>
      <input type="text" 
             class="product-notes" 
             placeholder="הערות למוצר" 
             value="${product && product.notes ? escapeHtml(product.notes) : ''}" />
    </div>
    <div class="product-row-actions">
      <button type="button" class="remove-product-btn">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  
  // הוסף event listener לכפתור המחיקה
  const removeBtn = row.querySelector('.remove-product-btn');
  removeBtn.addEventListener('click', () => removeProductRow(productId));
  
  container.appendChild(row);
}

// ========================================
// הסרת שורת מוצר
// ========================================
function removeProductRow(productId) {
  const row = document.querySelector(`[data-product-id="${productId}"]`);
  if (row) row.remove();
}

// ========================================
// שליחת טופס ספק
// ========================================
async function handleSupplierFormSubmit(e) {
  e.preventDefault();
  
  const supplierId = document.getElementById('supplierEditId').value;
  const name = document.getElementById('supplierName').value.trim();
  const phone = document.getElementById('supplierPhone').value.trim();
  const notes = document.getElementById('supplierNotes').value.trim();
  
  // קבל ימי הגעה
  const deliveryDays = [];
  document.querySelectorAll('input[name="deliveryDay"]:checked').forEach(cb => {
    deliveryDays.push(parseInt(cb.value));
  });
  
  // קבל מוצרים
  const products = [];
  document.querySelectorAll('#productsContainer .product-row').forEach(row => {
    const productName = row.querySelector('.product-name').value.trim();
    if (productName) {
      products.push({
        name: productName,
        unit: row.querySelector('.product-unit').value.trim(),
        lastPrice: parseFloat(row.querySelector('.product-price').value) || undefined,
        notes: row.querySelector('.product-notes').value.trim()
      });
    }
  });
  
  const supplierData = {
    name,
    phone,
    deliveryDays,
    products,
    notes
  };
  
  try {
    // וודא שיש CSRF token
    if (!window.csrfToken) {
      console.warn('CSRF token missing, fetching new one...');
      const csrfResponse = await fetch('/csrf-token');
      const csrfData = await csrfResponse.json();
      window.csrfToken = csrfData.csrfToken;
    }
    
    const url = supplierId ? `/api/suppliers/${supplierId}` : '/api/suppliers';
    const method = supplierId ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrfToken
      },
      credentials: 'include',
      body: JSON.stringify(supplierData)
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to save supplier');
    }
    
    showToast(data.message || 'הספק נשמר בהצלחה', 'success');
    closeSupplierModal('supplierModal');
    await loadSuppliers();
    
  } catch (error) {
    console.error('Error saving supplier:', error);
    showToast(error.message || 'שגיאה בשמירת ספק', 'error');
  }
}

// ========================================
// מחיקת ספק
// ========================================
async function deleteSupplier(supplierId) {
  const supplier = allSuppliers.find(s => s._id === supplierId);
  if (!supplier) return;
  
  if (!confirm(`האם אתה בטוח שברצונך למחוק את הספק "${supplier.name}"?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/suppliers/${supplierId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRF-Token': window.csrfToken }
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to delete supplier');
    }
    
    showToast(data.message || 'הספק נמחק בהצלחה', 'success');
    await loadSuppliers();
    
  } catch (error) {
    console.error('Error deleting supplier:', error);
    showToast(error.message || 'שגיאה במחיקת ספק', 'error');
  }
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
// אתחול
// ========================================
function initSuppliers() {
  // בדיקה אם כבר אותחלנו
  if (window.__SUPPLIERS_INITIALIZED__) {
    loadSuppliers(); // רק טען מחדש
    return;
  }
  window.__SUPPLIERS_INITIALIZED__ = true;
  
  // כפתור הוספת ספק
  const addBtn = document.getElementById('addSupplierBtn');
  if (addBtn) {
    addBtn.addEventListener('click', openAddSupplierModal);
  }
  
  // כפתור הוספת מוצר
  const addProductBtn = document.getElementById('addProductBtn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', () => addProductRow());
  }
  
  // טופס ספק
  const form = document.getElementById('supplierForm');
  if (form) {
    form.addEventListener('submit', handleSupplierFormSubmit);
  }
  
  // כפתורי סגירת מודל
  const modal = document.getElementById('supplierModal');
  if (modal) {
    // כפתור X
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeSupplierModal('supplierModal'));
    }
    
    // כפתור ביטול
    const cancelBtns = modal.querySelectorAll('.btn-outline.modal-close');
    cancelBtns.forEach(btn => {
      btn.addEventListener('click', () => closeSupplierModal('supplierModal'));
    });
    
    // סגירה בלחיצה על הרקע
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeSupplierModal('supplierModal');
      }
    });
  }
  
  // חיפוש
  setupSupplierSearch();
  
  // טען ספקים
  loadSuppliers();
}

// האזן לשינויי hash כדי לזהות מתי עוברים לעמוד ספקים
window.addEventListener('hashchange', () => {
  if (location.hash === '#suppliers') {
    setTimeout(initSuppliers, 100);
  }
});

// אתחול ראשוני אם כבר נמצאים בעמוד ספקים
document.addEventListener('DOMContentLoaded', () => {
  if (location.hash === '#suppliers') {
    setTimeout(initSuppliers, 500);
  }
});