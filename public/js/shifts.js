// =============================================
// SHIFT MANAGEMENT JAVASCRIPT
// =============================================

class ShiftManager {
  constructor() {
    this.employees = [];
    this.tasks = {
      daily: [],
      weekly: [],
      monthly: [],
    };
    this.selectedEmployees = new Set();
    this.selectedTasks = {
      daily: new Set(),
      weekly: new Set(),
      monthly: new Set(),
    };
    this.shifts = [];
    this.currentEditingShift = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadInitialData();
  }

  // ===== EVENT BINDING =====
  bindEvents() {
    document.getElementById("createShiftBtn")?.addEventListener("click", () => {
      this.openCreateShiftModal();
    });

    // Modal close buttons
    document
      .getElementById("shiftModalClose")
      ?.addEventListener("click", () => {
        this.closeCreateShiftModal();
      });

    document.getElementById("cancelShiftBtn")?.addEventListener("click", () => {
      this.closeCreateShiftModal();
    });

    // Save shift button
    document.getElementById("saveShiftBtn")?.addEventListener("click", () => {
      this.saveShift();
    });

    // Date input change
    document.getElementById("shiftDate")?.addEventListener("change", (e) => {
      this.validateShiftDate(e.target.value);
    });

    // Select all checkboxes
    document
      .getElementById("selectAllDaily")
      ?.addEventListener("change", (e) => {
        this.toggleSelectAllTasks("daily", e.target.checked);
      });

    document
      .getElementById("selectAllWeekly")
      ?.addEventListener("change", (e) => {
        this.toggleSelectAllTasks("weekly", e.target.checked);
      });

    document
      .getElementById("selectAllMonthly")
      ?.addEventListener("change", (e) => {
        this.toggleSelectAllTasks("monthly", e.target.checked);
      });

    // Search and filters
    document.getElementById("shiftsSearch")?.addEventListener("input", (e) => {
      this.filterShifts();
    });

    document.getElementById("statusFilter")?.addEventListener("change", () => {
      this.filterShifts();
    });

    document.getElementById("monthFilter")?.addEventListener("change", () => {
      this.filterShifts();
    });

    // Modal backdrop click to close
    document
      .getElementById("createShiftModal")
      ?.addEventListener("click", (e) => {
        if (e.target.id === "createShiftModal") {
          this.closeCreateShiftModal();
        }
      });
  }

  // ===== MODAL MANAGEMENT =====
  openCreateShiftModal() {
    this.resetForm();
    this.loadEmployees();
    this.loadTasks();

    // Set default date to today
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("shiftDate").value = today;

    document.getElementById("createShiftModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  closeCreateShiftModal() {
    document.getElementById("createShiftModal").classList.add("hidden");
    document.body.style.overflow = "";
    this.resetForm();
  }

  resetForm() {
    // Reset form values
    document.getElementById("createShiftForm").reset();

    // Reset selections
    this.selectedEmployees.clear();
    this.selectedTasks = {
      daily: new Set(),
      weekly: new Set(),
      monthly: new Set(),
    };

    // Reset UI
    this.updateEmployeeSelection();
    this.updateTaskSelection();

    // Reset default times
    document.getElementById("startTime").value = "16:00";
    document.getElementById("endTime").value = "00:00";
  }

  // ===== DATA LOADING =====
  async loadInitialData() {
    await Promise.all([this.loadShifts(), this.loadTasks()]);
  }

  async loadEmployees() {
    try {
      const loadingEl = document.getElementById("employeesLoading");
      const listEl = document.getElementById("employeesList");
      const managerSelect = document.getElementById("shiftManager");

      loadingEl.style.display = "flex";
      listEl.style.display = "none";

      const response = await fetch("/api/employees", {
        headers: {
          "X-CSRF-Token": window.csrfToken,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load employees");
      }

      const data = await response.json();
      this.employees = data.employees || [];

      this.renderEmployeesGrid();
      this.renderManagerOptions();

      loadingEl.style.display = "none";
      listEl.style.display = "grid";
    } catch (error) {
      console.error("Error loading employees:", error);
      this.showToast("שגיאה בטעינת רשימת העובדים", "error");

      document.getElementById("employeesLoading").innerHTML =
        '<i class="fas fa-exclamation-triangle"></i> שגיאה בטעינת העובדים';
    }
  }

  async loadTasks() {
    try {
      const response = await fetch("/api/tasks?activeOnly=true", {
        headers: {
          "X-CSRF-Token": window.csrfToken,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load tasks");
      }

      const data = await response.json();
      const tasks = data.tasks || [];

      // Group tasks by category
      this.tasks = {
        daily: tasks.filter((task) => task.category === "daily"),
        weekly: tasks.filter((task) => task.category === "weekly"),
        monthly: tasks.filter((task) => task.category === "monthly"),
      };

      this.renderTasksGrids();
    } catch (error) {
      console.error("Error loading tasks:", error);
      this.showToast("שגיאה בטעינת רשימת המשימות", "error");
    }
  }

  async loadShifts() {
    try {
      const response = await fetch("/api/shifts?limit=50", {
        headers: {
          "X-CSRF-Token": window.csrfToken,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load shifts");
      }

      const data = await response.json();
      this.shifts = data.shifts || [];

      this.renderShiftsList();
    } catch (error) {
      console.error("Error loading shifts:", error);
      this.showToast("שגיאה בטעינת רשימת המשמרות", "error");
    }
  }

  // ===== RENDERING METHODS =====
  renderEmployeesGrid() {
    const container = document.getElementById("employeesList");
    if (!container || !this.employees.length) return;

    container.innerHTML = this.employees
      .map(
        (employee) => `
      <div class="employee-card" data-employee-id="${employee._id}" onclick="shiftManager.toggleEmployeeSelection('${employee._id}')">
        <div class="employee-info">
          <div class="employee-avatar">
            ${this.getInitials(employee.name)}
          </div>
          <div class="employee-details">
            <h5>${this.escapeHtml(employee.name)}</h5>
            <div class="employee-role">${this.getRoleDisplay(employee.role)}</div>
          </div>
        </div>
      </div>
    `,
      )
      .join("");
  }

  renderManagerOptions() {
    const select = document.getElementById("shiftManager");
    if (!select || !this.employees.length) return;

    // Filter employees who can be managers (shift_manager, manager, owner)
    const managers = this.employees.filter((emp) =>
      ["shift_manager", "manager", "owner"].includes(emp.role),
    );

    select.innerHTML =
      '<option value="">-- בחר מנהל --</option>' +
      managers
        .map(
          (manager) => `
        <option value="${manager._id}">${this.escapeHtml(manager.name)} (${this.getRoleDisplay(manager.role)})</option>
      `,
        )
        .join("");
  }

  renderTasksGrids() {
    ["daily", "weekly", "monthly"].forEach((category) => {
      this.renderTasksGrid(category);
    });
  }

  renderTasksGrid(category) {
    const loadingEl = document.getElementById(`${category}TasksLoading`);
    const listEl = document.getElementById(`${category}TasksList`);

    if (!loadingEl || !listEl) return;

    const tasks = this.tasks[category] || [];

    if (tasks.length === 0) {
      loadingEl.innerHTML = `<i class="fas fa-info-circle"></i> אין משימות ${this.getCategoryDisplay(category)} זמינות`;
      return;
    }

    listEl.innerHTML = tasks
      .map(
        (task) => `
      <div class="task-card" data-task-id="${task._id}" onclick="shiftManager.toggleTaskSelection('${category}', '${task._id}')">
        <input type="checkbox" class="task-checkbox" data-category="${category}" data-task-id="${task._id}">
        <div class="task-header">
          <h6 class="task-title">${this.escapeHtml(task.title)}</h6>
          <span class="task-priority ${task.priority}">${this.getPriorityDisplay(task.priority)}</span>
        </div>
        ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ""}
        <div class="task-meta">
          ${
            task.estimatedDuration
              ? `
            <div class="task-duration">
              <i class="fas fa-clock"></i>
              <span>${task.estimatedDuration} דק'</span>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `,
      )
      .join("");

    loadingEl.style.display = "none";
    listEl.style.display = "grid";
  }

  renderShiftsList() {
    const emptyState = document.getElementById("shiftsEmpty");
    const shiftsList = document.getElementById("shiftsList");

    if (!emptyState || !shiftsList) return;

    if (this.shifts.length === 0) {
      emptyState.style.display = "flex";
      shiftsList.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    shiftsList.style.display = "grid";

    shiftsList.innerHTML = this.shifts
      .map((shift) => this.renderShiftCard(shift))
      .join("");
  }

  renderShiftCard(shift) {
    const date = new Date(shift.date).toLocaleDateString("he-IL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const employeesCount = shift.employees ? shift.employees.length : 0;
    const tasksCount = shift.tasks ? shift.tasks.length : 0;
    const completedTasks = shift.tasks
      ? shift.tasks.filter((t) => t.isCompleted).length
      : 0;
    const completionPercentage =
      tasksCount > 0 ? Math.round((completedTasks / tasksCount) * 100) : 0;

    return `
      <div class="shift-card ${shift.status}" data-shift-id="${shift._id}">
        <div class="shift-header">
          <div>
            <h4 class="shift-date">${date}</h4>
            <div class="shift-time">
              <i class="fas fa-clock"></i>
              ${shift.startTime} - ${shift.endTime}
            </div>
          </div>
          <span class="shift-status ${shift.status}">${this.getStatusDisplay(shift.status)}</span>
        </div>

        <div class="shift-info">
          <div class="shift-info-item">
            <i class="fas fa-user-tie"></i>
            <span>מנהל: <strong class="shift-manager">${shift.manager ? this.escapeHtml(shift.manager.name) : "לא צוין"}</strong></span>
          </div>
          <div class="shift-info-item">
            <i class="fas fa-users"></i>
            <span class="shift-employees">${employeesCount} עובדים</span>
          </div>
          <div class="shift-info-item">
            <i class="fas fa-tasks"></i>
            <span>${tasksCount} משימות</span>
          </div>
        </div>

        ${
          tasksCount > 0
            ? `
          <div class="task-progress">
            <div class="progress-header">
              <span class="progress-label">התקדמות משימות</span>
              <span class="progress-percentage">${completionPercentage}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${completionPercentage}%"></div>
            </div>
          </div>
        `
            : ""
        }

        <div class="shift-actions">
          <button class="btn btn-outline btn-sm" onclick="shiftManager.viewShift('${shift._id}')">
            <i class="fas fa-eye"></i>
            צפה
          </button>
          ${
            shift.status === "planned"
              ? `
            <button class="btn btn-primary btn-sm" onclick="shiftManager.editShift('${shift._id}')">
              <i class="fas fa-edit"></i>
              ערוך
            </button>
          `
              : ""
          }
          ${
            ["planned"].includes(shift.status)
              ? `
            <button class="btn btn-error btn-sm" onclick="shiftManager.deleteShift('${shift._id}')">
              <i class="fas fa-trash"></i>
              מחק
            </button>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  // ===== SELECTION METHODS =====
  toggleEmployeeSelection(employeeId) {
    const card = document.querySelector(`[data-employee-id="${employeeId}"]`);
    if (!card) return;

    if (this.selectedEmployees.has(employeeId)) {
      this.selectedEmployees.delete(employeeId);
      card.classList.remove("selected");
    } else {
      this.selectedEmployees.add(employeeId);
      card.classList.add("selected");
    }

    this.updateEmployeeSelection();
  }

  toggleTaskSelection(category, taskId) {
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    const checkbox = card?.querySelector(".task-checkbox");

    if (!card || !checkbox) return;

    if (this.selectedTasks[category].has(taskId)) {
      this.selectedTasks[category].delete(taskId);
      card.classList.remove("selected");
      checkbox.checked = false;
    } else {
      this.selectedTasks[category].add(taskId);
      card.classList.add("selected");
      checkbox.checked = true;
    }

    this.updateTaskSelection();
    this.updateSelectAllCheckbox(category);
  }

  toggleSelectAllTasks(category, selectAll) {
    const tasks = this.tasks[category] || [];

    if (selectAll) {
      tasks.forEach((task) => {
        this.selectedTasks[category].add(task._id);
        const card = document.querySelector(`[data-task-id="${task._id}"]`);
        const checkbox = card?.querySelector(".task-checkbox");
        if (card) card.classList.add("selected");
        if (checkbox) checkbox.checked = true;
      });
    } else {
      this.selectedTasks[category].clear();
      tasks.forEach((task) => {
        const card = document.querySelector(`[data-task-id="${task._id}"]`);
        const checkbox = card?.querySelector(".task-checkbox");
        if (card) card.classList.remove("selected");
        if (checkbox) checkbox.checked = false;
      });
    }

    this.updateTaskSelection();
  }

  updateEmployeeSelection() {
    // Update manager dropdown to only show selected employees who can be managers
    const managerSelect = document.getElementById("shiftManager");
    const currentManager = managerSelect?.value;

    if (managerSelect) {
      const selectedManagerCandidates = this.employees.filter(
        (emp) =>
          this.selectedEmployees.has(emp._id) &&
          ["shift_manager", "manager", "owner"].includes(emp.role),
      );

      managerSelect.innerHTML =
        '<option value="">-- בחר מנהל --</option>' +
        selectedManagerCandidates
          .map(
            (manager) => `
          <option value="${manager._id}" ${currentManager === manager._id ? "selected" : ""}>
            ${this.escapeHtml(manager.name)} (${this.getRoleDisplay(manager.role)})
          </option>
        `,
          )
          .join("");
    }
  }

  updateTaskSelection() {
    // Could add summary of selected tasks if needed
  }

  updateSelectAllCheckbox(category) {
    const selectAllCheckbox = document.getElementById(
      `selectAll${category.charAt(0).toUpperCase() + category.slice(1)}`,
    );
    const totalTasks = this.tasks[category]?.length || 0;
    const selectedTasks = this.selectedTasks[category].size;

    if (selectAllCheckbox && totalTasks > 0) {
      selectAllCheckbox.indeterminate =
        selectedTasks > 0 && selectedTasks < totalTasks;
      selectAllCheckbox.checked = selectedTasks === totalTasks;
    }
  }

  // ===== VALIDATION =====
  validateShiftDate(dateString) {
    if (!dateString) return false;

    const selectedDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      this.showToast("לא ניתן ליצור משמרת בתאריך העבר", "warning");
      return false;
    }

    // Check if shift already exists for this date
    const existingShift = this.shifts.find((shift) => {
      const shiftDate = new Date(shift.date);
      return (
        shiftDate.toDateString() === selectedDate.toDateString() &&
        shift.type === "evening"
      );
    });

    if (existingShift) {
      this.showToast("משמרת ערב כבר קיימת לתאריך זה", "warning");
      return false;
    }

    return true;
  }

  validateForm() {
    const date = document.getElementById("shiftDate")?.value;
    const manager = document.getElementById("shiftManager")?.value;

    if (!date) {
      this.showToast("נא בחר תאריך למשמרת", "error");
      return false;
    }

    if (!this.validateShiftDate(date)) {
      return false;
    }

    if (!manager) {
      this.showToast("נא בחר מנהל למשמרת", "error");
      return false;
    }

    if (this.selectedEmployees.size === 0) {
      this.showToast("נא בחר לפחות עובד אחד למשמרת", "error");
      return false;
    }

    if (!this.selectedEmployees.has(manager)) {
      this.showToast("מנהל המשמרת חייב להיות כלול ברשימת העובדים", "error");
      return false;
    }

    return true;
  }

  // ===== SAVE SHIFT =====
  async saveShift() {
    if (!this.validateForm()) return;

    const saveBtn = document.getElementById("saveShiftBtn");
    const originalText = saveBtn.innerHTML;

    try {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';

      const shiftData = this.collectFormData();

      const response = await fetch("/api/shifts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken,
        },
        body: JSON.stringify(shiftData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "שגיאה ביצירת המשמרת");
      }

      this.showToast("משמרת נוצרה בהצלחה!", "success");
      this.closeCreateShiftModal();
      await this.loadShifts();
    } catch (error) {
      console.error("Error saving shift:", error);
      this.showToast(error.message || "שגיאה ביצירת המשמרת", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
    }
  }

  collectFormData() {
    const date = document.getElementById("shiftDate").value;
    const startTime = document.getElementById("startTime").value;
    const endTime = document.getElementById("endTime").value;
    const manager = document.getElementById("shiftManager").value;

    // Collect selected tasks
    const tasks = [];
    ["daily", "weekly", "monthly"].forEach((category) => {
      this.selectedTasks[category].forEach((taskId) => {
        const task = this.tasks[category].find((t) => t._id === taskId);
        if (task) {
          tasks.push({
            taskId: task._id,
            category,
            title: task.title,
            description: task.description,
            priority: task.priority,
            estimatedDuration: task.estimatedDuration,
          });
        }
      });
    });

    return {
      date,
      startTime,
      endTime,
      employees: Array.from(this.selectedEmployees),
      manager,
      tasks,
      type: "evening",
    };
  }

  // ===== SHIFT ACTIONS =====
  async viewShift(shiftId) {
    // Navigate to shift view page or open detailed modal
    // For now, show details in console
    const shift = this.shifts.find((s) => s._id === shiftId);
    console.log("Viewing shift:", shift);
    this.showToast("תצוגת משמרת - בפיתוח", "info");
  }

  async editShift(shiftId) {
    // Open edit modal with shift data
    console.log("Editing shift:", shiftId);
    this.showToast("עריכת משמרת - בפיתוח", "info");
  }

  async deleteShift(shiftId) {
    if (!confirm("האם אתה בטוח שברצונך למחוק את המשמרת?")) {
      return;
    }

    try {
      const response = await fetch(`/api/shifts/${shiftId}`, {
        method: "DELETE",
        headers: {
          "X-CSRF-Token": window.csrfToken,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "שגיאה במחיקת המשמרת");
      }

      this.showToast("המשמרת נמחקה בהצלחה", "success");
      await this.loadShifts();
    } catch (error) {
      console.error("Error deleting shift:", error);
      this.showToast(error.message || "שגיאה במחיקת המשמרת", "error");
    }
  }

  // ===== FILTERING =====
  filterShifts() {
    const searchTerm =
      document.getElementById("shiftsSearch")?.value.toLowerCase() || "";
    const statusFilter = document.getElementById("statusFilter")?.value || "";
    const monthFilter = document.getElementById("monthFilter")?.value || "";

    let filteredShifts = this.shifts;

    // Filter by search term (manager name, date)
    if (searchTerm) {
      filteredShifts = filteredShifts.filter((shift) => {
        const managerName = shift.manager?.name?.toLowerCase() || "";
        const date = new Date(shift.date)
          .toLocaleDateString("he-IL")
          .toLowerCase();
        return managerName.includes(searchTerm) || date.includes(searchTerm);
      });
    }

    // Filter by status
    if (statusFilter) {
      filteredShifts = filteredShifts.filter(
        (shift) => shift.status === statusFilter,
      );
    }

    // Filter by month
    if (monthFilter) {
      const [year, month] = monthFilter.split("-");
      filteredShifts = filteredShifts.filter((shift) => {
        const shiftDate = new Date(shift.date);
        return (
          shiftDate.getFullYear() === parseInt(year) &&
          shiftDate.getMonth() + 1 === parseInt(month)
        );
      });
    }

    this.renderFilteredShifts(filteredShifts);
  }

  renderFilteredShifts(shifts) {
    const emptyState = document.getElementById("shiftsEmpty");
    const shiftsList = document.getElementById("shiftsList");

    if (!emptyState || !shiftsList) return;

    if (shifts.length === 0) {
      emptyState.style.display = "flex";
      emptyState.innerHTML = `
        <i class="fas fa-search" style="font-size: 4rem; color: var(--text-light); margin-bottom: var(--space-lg);"></i>
        <h3>לא נמצאו משמרות</h3>
        <p>נסה לשנות את הפילטרים או החיפוש</p>
      `;
      shiftsList.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    shiftsList.style.display = "grid";
    shiftsList.innerHTML = shifts
      .map((shift) => this.renderShiftCard(shift))
      .join("");
  }

  // ===== UTILITY METHODS =====
  getInitials(name) {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n.charAt(0))
      .join("")
      .substring(0, 2)
      .toUpperCase();
  }

  getRoleDisplay(role) {
    const roles = {
      employee: "עובד",
      shift_manager: 'אחמ"ש',
      manager: "מנהל",
      owner: "בעלים",
    };
    return roles[role] || role;
  }

  getStatusDisplay(status) {
    const statuses = {
      planned: "מתוכננת",
      active: "פעילה",
      completed: "הושלמה",
      cancelled: "בוטלה",
    };
    return statuses[status] || status;
  }

  getPriorityDisplay(priority) {
    const priorities = {
      low: "נמוכה",
      medium: "בינונית",
      high: "גבוהה",
    };
    return priorities[priority] || priority;
  }

  getCategoryDisplay(category) {
    const categories = {
      daily: "יומיות",
      weekly: "שבועיות",
      monthly: "חודשיות",
    };
    return categories[category] || category;
  }

  escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(message, type = "info") {
    // Use existing toast system if available, otherwise use alert
    if (window.toast) {
      window.toast(message, type);
    } else if (window.showToast) {
      window.showToast(message, type);
    } else {
      console.log(`${type.toUpperCase()}: ${message}`);
      // Fallback to console for now - in production you'd want a proper toast system
      if (type === "error") {
        alert(`שגיאה: ${message}`);
      }
    }
  }
}

// Initialize shift manager when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  initShiftsUI();
});

async function initShiftsUI() {
  const sec = document.querySelector("#section-shifts");
  if (!sec) return;
  if (!window.tenantData?.features?.shifts) return;
  if (sec.matches("[data-feature].disabled")) return;

  // Only initialize if we're on the shifts section and feature is enabled
  window.shiftManager = new ShiftManager();
}
