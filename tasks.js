/**
 * MyEstia - Task Management Service
 * Full CRUD, Done/Not Done toggle, Subtasks, Filters, Sorting, Search, Confetti celebration, and Workflow support.
 */

const TaskManager = {
  tasks: [],
  currentFilters: {
    search: '',
    category_id: '',
    priority: '',
    status: '',
    due_filter: 'all',
    sort_by: 'due_date',
    sort_order: 'asc'
  },
  modalSubtasks: [],
  batchMode: false,
  selectedTaskIds: new Set(),

  async init() {
    await this.loadTasks();
    this.bindEvents();
  },

  async loadTasks() {
    try {
      const res = await API.tasks.getAll(this.currentFilters);
      if (res.success) {
        this.tasks = res.tasks || [];
        this.renderTasksList();
        this.renderWorkflowView();
        
        // Update sidebar count
        const countBadge = document.getElementById('sidebar-task-count');
        if (countBadge) countBadge.textContent = this.tasks.length;
      }
    } catch (e) {
      console.error('Failed to load tasks:', e);
    }
  },

  renderTasksList() {
    const container = document.getElementById('tasks-main-list');
    if (!container) return;

    if (this.tasks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted); background: var(--glass-bg); border-radius: var(--radius-lg); border: var(--glass-border);">
          <i class="fa-solid fa-list-check" style="font-size: 3rem; margin-bottom: 1rem; color: var(--text-subtle);"></i>
          <h3>No Tasks Found</h3>
          <p style="margin-top: 0.25rem;">Try adjusting your filters or click "+ Add New Task" above to get started.</p>
        </div>
      `;
      return;
    }

    let html = '';
    const todayStr = new Date().toISOString().split('T')[0];

    this.tasks.forEach(task => {
      const isCompleted = task.is_completed === 1;
      const priorityClass = `badge-priority-${task.priority}`;
      const isSelected = this.selectedTaskIds.has(task.id);

      // Due date formatting & status
      let dueDateBadge = '';
      if (task.due_date) {
        let isToday = task.due_date === todayStr;
        let isOverdue = task.due_date < todayStr && !isCompleted;
        let dueClass = isOverdue ? 'overdue' : (isToday ? 'today' : '');
        let dueIcon = isOverdue ? 'fa-triangle-exclamation' : 'fa-calendar-day';
        let dueLabel = isToday ? 'Today' : task.due_date;
        if (task.due_time) dueLabel += ` at ${task.due_time}`;

        dueDateBadge = `
          <span class="badge badge-due ${dueClass}">
            <i class="fa-solid ${dueIcon}"></i> ${dueLabel}
          </span>
        `;
      }

      // Category badge
      let categoryBadge = '';
      if (task.category_name) {
        categoryBadge = `
          <span class="badge badge-category" style="border-left: 3px solid ${task.category_color || '#6366f1'};">
            <i class="fa-solid ${task.category_icon || 'fa-tag'}" style="color: ${task.category_color || '#6366f1'};"></i>
            ${this.escapeHtml(task.category_name)}
          </span>
        `;
      }

      // Subtask progress
      let subtasksBadge = '';
      const subTotal = task.subtask_total || 0;
      const subDone = task.subtask_completed || 0;
      if (subTotal > 0) {
        subtasksBadge = `
          <span class="badge badge-subtasks" onclick="TaskManager.toggleSubtasksPanel(${task.id})">
            <i class="fa-solid fa-square-check"></i> ${subDone}/${subTotal} Subtasks
          </span>
        `;
      }

      // Reminder icon badge
      let reminderBadge = '';
      if (task.reminder_enabled) {
        reminderBadge = `
          <span class="badge" style="background: rgba(99, 102, 241, 0.15); color: var(--primary-400); border: 1px solid rgba(99, 102, 241, 0.3);" title="Reminder Enabled">
            <i class="fa-solid fa-bell"></i>
          </span>
        `;
      }

      html += `
        <div class="task-card ${task.priority} ${isCompleted ? 'completed' : ''}" id="task-card-${task.id}">
          ${this.batchMode ? `
            <div style="margin-top: 0.15rem;">
              <input type="checkbox" style="width: 18px; height: 18px; accent-color: var(--primary-500); cursor: pointer;" 
                ${isSelected ? 'checked' : ''} onchange="TaskManager.toggleSelectTask(${task.id}, this.checked)">
            </div>
          ` : `
            <div class="task-check-wrapper">
              <div class="custom-checkbox ${isCompleted ? 'checked' : ''}" onclick="TaskManager.toggleTaskDone(${task.id}, event)" title="Toggle Done / Not Done">
                ${isCompleted ? '<i class="fa-solid fa-check"></i>' : ''}
              </div>
            </div>
          `}

          <div class="task-content">
            <div class="task-header-row">
              <span class="task-title" onclick="TaskManager.openEditModal(${task.id})" style="cursor: pointer;">
                ${this.escapeHtml(task.title)}
              </span>
              <div class="task-actions">
                <button class="task-action-btn" title="Edit Task" onclick="TaskManager.openEditModal(${task.id})">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="task-action-btn delete" title="Delete Task" onclick="TaskManager.confirmDeleteTask(${task.id}, '${this.escapeHtml(task.title)}')">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>

            ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}

            <div class="task-meta-row">
              <span class="badge ${priorityClass}">
                <i class="fa-solid fa-flag"></i> ${task.priority.toUpperCase()}
              </span>
              ${categoryBadge}
              ${dueDateBadge}
              ${subtasksBadge}
              ${reminderBadge}
            </div>

            <!-- Subtasks checklist expandable panel -->
            <div class="task-subtasks-panel" id="subtasks-panel-${task.id}" style="display: none;">
              ${(task.subtasks || []).map(st => `
                <div class="subtask-item ${st.is_completed ? 'completed' : ''}">
                  <div class="subtask-checkbox ${st.is_completed ? 'checked' : ''}" onclick="TaskManager.toggleSubtask(${st.id}, ${task.id})">
                    ${st.is_completed ? '<i class="fa-solid fa-check"></i>' : ''}
                  </div>
                  <span>${this.escapeHtml(st.title)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  renderWorkflowView() {
    const listTodo = document.getElementById('workflow-list-todo');
    const listInProgress = document.getElementById('workflow-list-inprogress');
    const listCompleted = document.getElementById('workflow-list-completed');

    if (!listTodo || !listInProgress || !listCompleted) return;

    let todoHtml = '';
    let inProgressHtml = '';
    let completedHtml = '';

    let cntTodo = 0, cntInProgress = 0, cntCompleted = 0;

    this.tasks.forEach(task => {
      const priorityClass = `badge-priority-${task.priority}`;
      const categoryTag = task.category_name ? `
        <span class="badge badge-category" style="border-left: 2px solid ${task.category_color || '#6366f1'}; font-size: 0.72rem;">
          <i class="fa-solid ${task.category_icon || 'fa-tag'}" style="color: ${task.category_color || '#6366f1'};"></i>
          ${this.escapeHtml(task.category_name)}
        </span>
      ` : '';

      const dueTag = task.due_date ? `
        <span style="font-size: 0.76rem; color: var(--text-subtle);">
          <i class="fa-regular fa-calendar"></i> ${task.due_date}
        </span>
      ` : '';

      if (task.is_completed === 1 || task.status === 'completed') {
        cntCompleted++;
        completedHtml += `
          <div class="workflow-task-row">
            <div class="workflow-task-main">
              <i class="fa-solid fa-circle-check" style="color: var(--accent-emerald); font-size: 1.1rem;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.92rem; text-decoration: line-through; opacity: 0.7; cursor: pointer;" onclick="TaskManager.openEditModal(${task.id})">
                  ${this.escapeHtml(task.title)}
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.2rem;">
                  <span class="badge ${priorityClass}" style="font-size: 0.68rem;">${task.priority.toUpperCase()}</span>
                  ${categoryTag}
                  ${dueTag}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="workflow-stage-btn reopen" title="Move back to To Do" onclick="TaskManager.advanceTaskStage(${task.id}, 'pending')">
                <i class="fa-solid fa-rotate-left"></i> Reopen to To Do
              </button>
            </div>
          </div>
        `;
      } else if (task.status === 'in_progress') {
        cntInProgress++;
        inProgressHtml += `
          <div class="workflow-task-row">
            <div class="workflow-task-main">
              <i class="fa-solid fa-spinner fa-spin-pulse" style="color: var(--accent-cyan); font-size: 1.1rem;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.92rem; cursor: pointer;" onclick="TaskManager.openEditModal(${task.id})">
                  ${this.escapeHtml(task.title)}
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.2rem;">
                  <span class="badge ${priorityClass}" style="font-size: 0.68rem;">${task.priority.toUpperCase()}</span>
                  ${categoryTag}
                  ${dueTag}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="workflow-stage-btn reopen" title="Move back to To Do" onclick="TaskManager.advanceTaskStage(${task.id}, 'pending')">
                <i class="fa-solid fa-arrow-left"></i> To Do
              </button>
              <button class="workflow-stage-btn complete" title="Complete task" onclick="TaskManager.advanceTaskStage(${task.id}, 'completed')">
                <i class="fa-solid fa-check"></i> Complete
              </button>
            </div>
          </div>
        `;
      } else {
        cntTodo++;
        todoHtml += `
          <div class="workflow-task-row">
            <div class="workflow-task-main">
              <i class="fa-regular fa-circle" style="color: var(--accent-amber); font-size: 1.1rem;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.92rem; cursor: pointer;" onclick="TaskManager.openEditModal(${task.id})">
                  ${this.escapeHtml(task.title)}
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.2rem;">
                  <span class="badge ${priorityClass}" style="font-size: 0.68rem;">${task.priority.toUpperCase()}</span>
                  ${categoryTag}
                  ${dueTag}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="workflow-stage-btn start" title="Start task" onclick="TaskManager.advanceTaskStage(${task.id}, 'in_progress')">
                Start Working <i class="fa-solid fa-arrow-right"></i>
              </button>
              <button class="workflow-stage-btn complete" title="Complete task directly" onclick="TaskManager.advanceTaskStage(${task.id}, 'completed')">
                <i class="fa-solid fa-check"></i>
              </button>
            </div>
          </div>
        `;
      }
    });

    listTodo.innerHTML = todoHtml || '<div style="padding: 1.5rem; text-align: center; color: var(--text-subtle); font-size: 0.88rem;">No tasks waiting in To Do stage.</div>';
    listInProgress.innerHTML = inProgressHtml || '<div style="padding: 1.5rem; text-align: center; color: var(--text-subtle); font-size: 0.88rem;">No active tasks currently In Progress.</div>';
    listCompleted.innerHTML = completedHtml || '<div style="padding: 1.5rem; text-align: center; color: var(--text-subtle); font-size: 0.88rem;">No completed tasks yet.</div>';

    // Update Stage Badges and Pipeline Counters
    const elCountTodo = document.getElementById('workflow-count-todo');
    const elCountInProgress = document.getElementById('workflow-count-inprogress');
    const elCountCompleted = document.getElementById('workflow-count-completed');
    const elBadgeTodo = document.getElementById('workflow-badge-todo');
    const elBadgeInProgress = document.getElementById('workflow-badge-inprogress');
    const elBadgeCompleted = document.getElementById('workflow-badge-completed');

    if (elCountTodo) elCountTodo.textContent = `${cntTodo} tasks`;
    if (elCountInProgress) elCountInProgress.textContent = `${cntInProgress} tasks`;
    if (elCountCompleted) elCountCompleted.textContent = `${cntCompleted} tasks`;

    if (elBadgeTodo) elBadgeTodo.textContent = `${cntTodo} Tasks`;
    if (elBadgeInProgress) elBadgeInProgress.textContent = `${cntInProgress} Tasks`;
    if (elBadgeCompleted) elBadgeCompleted.textContent = `${cntCompleted} Tasks`;
  },

  async advanceTaskStage(taskId, newStatus) {
    SoundEngine.playClick();
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const isCompleted = newStatus === 'completed' ? 1 : 0;
    const payload = {
      title: task.title,
      description: task.description,
      category_id: task.category_id,
      priority: task.priority,
      status: newStatus,
      is_completed: isCompleted,
      due_date: task.due_date,
      due_time: task.due_time,
      reminder_enabled: task.reminder_enabled,
      reminder_offset: task.reminder_offset,
      recurrence: task.recurrence
    };

    const res = await API.tasks.update(taskId, payload);
    if (res.success) {
      if (newStatus === 'completed') {
        SoundEngine.playTaskDone();
        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.75 }
          });
        } catch (e) {}
        API.showToast('🎉 Task advanced to Completed!', 'success');
      } else if (newStatus === 'in_progress') {
        API.showToast('⚡ Task moved to In Progress stage', 'info');
      } else {
        API.showToast('Task moved back to To Do stage', 'info');
      }

      await this.loadTasks();
      Dashboard.loadStats();
      CategoryManager.loadCategories();
      CalendarManager.loadEvents();
    }
  },

  async toggleTaskDone(taskId, event) {
    if (event) event.stopPropagation();
    SoundEngine.playClick();

    const res = await API.tasks.toggle(taskId);
    if (res.success) {
      if (res.is_completed === 1) {
        // Play harmonious completion melody
        SoundEngine.playTaskDone();

        // Confetti Celebration
        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.75 }
          });
        } catch (e) {}

        API.showToast('🎉 Task marked as Done!', 'success');
      } else {
        API.showToast('Task marked as Pending', 'info');
      }

      await this.loadTasks();
      Dashboard.loadStats();
      CategoryManager.loadCategories();
      CalendarManager.loadEvents();
    }
  },

  toggleSubtasksPanel(taskId) {
    const panel = document.getElementById(`subtasks-panel-${taskId}`);
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    }
  },

  async toggleSubtask(subtaskId, taskId) {
    SoundEngine.playClick();
    const res = await API.tasks.toggleSubtask(subtaskId);
    if (res.success) {
      await this.loadTasks();
      Dashboard.loadStats();
    }
  },

  openCreateModal() {
    SoundEngine.playClick();
    const form = document.getElementById('task-form');
    form.reset();
    document.getElementById('task-id').value = '';
    document.getElementById('task-modal-title').textContent = 'Create New Task';

    // Set default due date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('task-input-duedate').value = today;
    document.getElementById('task-input-duetime').value = '17:00';
    document.getElementById('task-input-priority').value = 'medium';
    document.getElementById('task-input-status').value = 'pending';

    // Reset reminder options
    document.getElementById('task-input-reminder-enabled').checked = true;
    document.getElementById('reminder-options-container').style.display = 'block';

    // Reset subtasks list
    this.modalSubtasks = [];
    this.renderModalSubtasks();

    App.openModal('task-modal');
  },

  async openEditModal(taskId) {
    SoundEngine.playClick();
    const res = await API.tasks.getById(taskId);
    if (!res.success || !res.task) {
      API.showToast('Failed to load task details', 'error');
      return;
    }

    const t = res.task;
    document.getElementById('task-id').value = t.id;
    document.getElementById('task-modal-title').textContent = 'Edit Task';
    document.getElementById('task-input-title').value = t.title;
    document.getElementById('task-input-desc').value = t.description || '';
    document.getElementById('task-input-category').value = t.category_id || '';
    document.getElementById('task-input-priority').value = t.priority;
    document.getElementById('task-input-status').value = t.status;
    document.getElementById('task-input-duedate').value = t.due_date || '';
    document.getElementById('task-input-duetime').value = t.due_time || '12:00';
    document.getElementById('task-input-recurrence').value = t.recurrence || 'none';

    const reminderCheckbox = document.getElementById('task-input-reminder-enabled');
    reminderCheckbox.checked = t.reminder_enabled === 1;
    document.getElementById('reminder-options-container').style.display = t.reminder_enabled === 1 ? 'block' : 'none';
    document.getElementById('task-input-reminder-offset').value = t.reminder_offset || '10m_before';

    this.modalSubtasks = t.subtasks ? t.subtasks.map(s => ({ title: s.title, is_completed: s.is_completed })) : [];
    this.renderModalSubtasks();

    App.openModal('task-modal');
  },

  renderModalSubtasks() {
    const list = document.getElementById('modal-subtasks-list');
    if (!list) return;

    if (this.modalSubtasks.length === 0) {
      list.innerHTML = '<span style="font-size: 0.78rem; color: var(--text-subtle);">No checklist items yet.</span>';
      return;
    }

    let html = '';
    this.modalSubtasks.forEach((st, idx) => {
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-card); padding: 0.35rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.85rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" style="accent-color: var(--primary-500);" ${st.is_completed ? 'checked' : ''} onchange="TaskManager.modalSubtasks[${idx}].is_completed = this.checked ? 1 : 0">
            <span style="${st.is_completed ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${this.escapeHtml(st.title)}</span>
          </label>
          <button type="button" style="background: none; border: none; color: var(--priority-urgent); cursor: pointer;" onclick="TaskManager.removeModalSubtask(${idx})">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
    });

    list.innerHTML = html;
  },

  addModalSubtask() {
    const input = document.getElementById('modal-new-subtask-input');
    const val = input.value.trim();
    if (!val) return;
    this.modalSubtasks.push({ title: val, is_completed: 0 });
    input.value = '';
    this.renderModalSubtasks();
  },

  removeModalSubtask(idx) {
    this.modalSubtasks.splice(idx, 1);
    this.renderModalSubtasks();
  },

  confirmDeleteTask(taskId, taskTitle) {
    App.openConfirmModal({
      title: `Delete Task?`,
      message: `Are you sure you want to permanently delete "${taskTitle}"?`,
      actionText: 'Delete Task',
      onConfirm: async () => {
        const res = await API.tasks.delete(taskId);
        if (res.success) {
          API.showToast('Task deleted', 'success');
          await this.loadTasks();
          Dashboard.loadStats();
          CategoryManager.loadCategories();
          CalendarManager.loadEvents();
        } else {
          API.showToast(res.message || 'Failed to delete task', 'error');
        }
      }
    });
  },

  toggleBatchMode() {
    this.batchMode = !this.batchMode;
    this.selectedTaskIds.clear();
    const batchBar = document.getElementById('batch-actions-bar');
    if (batchBar) batchBar.style.display = this.batchMode ? 'flex' : 'none';
    const batchBtn = document.getElementById('btn-batch-mode');
    if (batchBtn) batchBtn.classList.toggle('active', this.batchMode);
    this.renderTasksList();
  },

  toggleSelectTask(taskId, isChecked) {
    if (isChecked) {
      this.selectedTaskIds.add(taskId);
    } else {
      this.selectedTaskIds.delete(taskId);
    }
    const countSpan = document.getElementById('batch-selected-count');
    if (countSpan) countSpan.textContent = this.selectedTaskIds.size;
  },

  bindEvents() {
    const form = document.getElementById('task-form');
    const quickAddInput = document.getElementById('quick-add-input');
    const quickAddBtn = document.getElementById('btn-quick-add');
    const newBtn1 = document.getElementById('tasks-btn-new-task');
    const newBtn2 = document.getElementById('dash-btn-new-task');
    const newBtn3 = document.getElementById('btn-header-new-task');
    const newBtn4 = document.getElementById('workflow-btn-new-task');
    const newBtn5 = document.getElementById('cal-btn-new-task');
    const addSubtaskBtn = document.getElementById('btn-modal-add-subtask');
    const subtaskInput = document.getElementById('modal-new-subtask-input');
    const reminderCheckbox = document.getElementById('task-input-reminder-enabled');
    const batchToggleBtn = document.getElementById('btn-batch-mode');
    const batchCancelBtn = document.getElementById('btn-batch-cancel');

    [newBtn1, newBtn2, newBtn3, newBtn4, newBtn5].forEach(btn => {
      if (btn) btn.addEventListener('click', () => this.openCreateModal());
    });

    if (reminderCheckbox) {
      reminderCheckbox.addEventListener('change', (e) => {
        document.getElementById('reminder-options-container').style.display = e.target.checked ? 'block' : 'none';
      });
    }

    if (addSubtaskBtn) {
      addSubtaskBtn.addEventListener('click', () => this.addModalSubtask());
    }
    if (subtaskInput) {
      subtaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addModalSubtask();
        }
      });
    }

    // Quick Add Bar
    const handleQuickAdd = async () => {
      const title = quickAddInput.value.trim();
      if (!title) return;
      SoundEngine.playClick();
      const res = await API.tasks.create({
        title,
        priority: 'medium',
        category_id: this.currentFilters.category_id || null,
        due_date: new Date().toISOString().split('T')[0]
      });
      if (res.success) {
        API.showToast('Task added!', 'success');
        quickAddInput.value = '';
        await this.loadTasks();
        Dashboard.loadStats();
        CategoryManager.loadCategories();
        CalendarManager.loadEvents();
      }
    };

    if (quickAddBtn) quickAddBtn.addEventListener('click', handleQuickAdd);
    if (quickAddInput) {
      quickAddInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleQuickAdd();
      });
    }

    // Status Filter Pills
    document.querySelectorAll('#tasks-status-filters .filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        SoundEngine.playClick();
        document.querySelectorAll('#tasks-status-filters .filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentFilters.due_filter = pill.dataset.dueFilter;
        this.loadTasks();
      });
    });

    // Priority Filter Select
    const prioritySelect = document.getElementById('filter-select-priority');
    if (prioritySelect) {
      prioritySelect.addEventListener('change', (e) => {
        this.currentFilters.priority = e.target.value;
        this.loadTasks();
      });
    }

    // Sort Select
    const sortSelect = document.getElementById('filter-select-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.currentFilters.sort_by = sortBy;
        this.currentFilters.sort_order = sortOrder;
        this.loadTasks();
      });
    }

    // Batch Actions
    if (batchToggleBtn) batchToggleBtn.addEventListener('click', () => this.toggleBatchMode());
    if (batchCancelBtn) batchCancelBtn.addEventListener('click', () => this.toggleBatchMode());

    const batchCompleteBtn = document.getElementById('btn-batch-complete');
    const batchIncompleteBtn = document.getElementById('btn-batch-incomplete');
    const batchDeleteBtn = document.getElementById('btn-batch-delete');

    if (batchCompleteBtn) {
      batchCompleteBtn.addEventListener('click', async () => {
        if (this.selectedTaskIds.size === 0) return;
        await API.tasks.batchAction(Array.from(this.selectedTaskIds), 'complete');
        API.showToast('Selected tasks marked completed', 'success');
        this.toggleBatchMode();
        this.loadTasks();
        Dashboard.loadStats();
      });
    }

    if (batchIncompleteBtn) {
      batchIncompleteBtn.addEventListener('click', async () => {
        if (this.selectedTaskIds.size === 0) return;
        await API.tasks.batchAction(Array.from(this.selectedTaskIds), 'incomplete');
        API.showToast('Selected tasks marked pending', 'info');
        this.toggleBatchMode();
        this.loadTasks();
        Dashboard.loadStats();
      });
    }

    if (batchDeleteBtn) {
      batchDeleteBtn.addEventListener('click', async () => {
        if (this.selectedTaskIds.size === 0) return;
        App.openConfirmModal({
          title: `Delete ${this.selectedTaskIds.size} tasks?`,
          message: 'This will permanently remove the selected tasks.',
          actionText: 'Delete Selected',
          onConfirm: async () => {
            await API.tasks.batchAction(Array.from(this.selectedTaskIds), 'delete');
            API.showToast('Selected tasks deleted', 'success');
            this.toggleBatchMode();
            this.loadTasks();
            Dashboard.loadStats();
          }
        });
      });
    }

    // Form Submit
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskId = document.getElementById('task-id').value;
        const title = document.getElementById('task-input-title').value.trim();
        const description = document.getElementById('task-input-desc').value.trim();
        const category_id = document.getElementById('task-input-category').value || null;
        const priority = document.getElementById('task-input-priority').value;
        const status = document.getElementById('task-input-status').value;
        const due_date = document.getElementById('task-input-duedate').value || null;
        const due_time = document.getElementById('task-input-duetime').value || null;
        const recurrence = document.getElementById('task-input-recurrence').value;
        const reminder_enabled = document.getElementById('task-input-reminder-enabled').checked;
        const reminder_offset = document.getElementById('task-input-reminder-offset').value;

        if (!title) return;

        const payload = {
          title,
          description,
          category_id,
          priority,
          status,
          due_date,
          due_time,
          recurrence,
          reminder_enabled,
          reminder_offset,
          subtasks: this.modalSubtasks
        };

        let res;
        if (taskId) {
          res = await API.tasks.update(taskId, payload);
        } else {
          res = await API.tasks.create(payload);
        }

        if (res.success) {
          API.showToast(taskId ? 'Task updated!' : 'Task created!', 'success');
          App.closeModal('task-modal');
          await this.loadTasks();
          Dashboard.loadStats();
          CategoryManager.loadCategories();
          CalendarManager.loadEvents();
        } else {
          API.showToast(res.message || 'Operation failed', 'error');
        }
      });
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
};
