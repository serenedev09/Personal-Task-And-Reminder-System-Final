/**
 * MyEstia - Category Management Service
 * Manages category state, color picking, icon selection, and UI rendering.
 */

const CategoryManager = {
  categories: [],
  selectedCategoryId: '',

  async init() {
    await this.loadCategories();
    this.bindEvents();
  },

  async loadCategories() {
    try {
      const res = await API.categories.getAll();
      if (res.success) {
        this.categories = res.categories || [];
        this.renderSidebarCategories();
        this.renderTaskFilterChips();
        this.renderTaskModalSelect();
        this.renderCategoriesView();
        
        // Update sidebar count
        const countBadge = document.getElementById('sidebar-cat-count');
        if (countBadge) countBadge.textContent = this.categories.length;
      }
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  },

  renderSidebarCategories() {
    const list = document.getElementById('sidebar-category-list');
    if (!list) return;

    let html = '';
    this.categories.forEach(cat => {
      const isActive = this.selectedCategoryId === String(cat.id);
      html += `
        <div class="nav-item ${isActive ? 'active' : ''}" data-cat-id="${cat.id}" onclick="CategoryManager.selectCategory('${cat.id}')">
          <div class="nav-item-left">
            <span class="category-dot" style="background: ${cat.color};"></span>
            <span>${this.escapeHtml(cat.name)}</span>
          </div>
          <span class="nav-badge">${cat.active_tasks || 0}</span>
        </div>
      `;
    });

    list.innerHTML = html;
  },

  renderTaskFilterChips() {
    const bar = document.getElementById('tasks-category-chips');
    if (!bar) return;

    let html = `
      <div class="category-chip ${this.selectedCategoryId === '' ? 'active' : ''}" data-cat-id="" onclick="CategoryManager.selectCategory('')">
        <i class="fa-solid fa-border-all"></i> All Categories
      </div>
    `;

    this.categories.forEach(cat => {
      const isActive = this.selectedCategoryId === String(cat.id);
      html += `
        <div class="category-chip ${isActive ? 'active' : ''}" data-cat-id="${cat.id}" onclick="CategoryManager.selectCategory('${cat.id}')">
          <span class="category-dot" style="background: ${cat.color};"></span>
          <span>${this.escapeHtml(cat.name)}</span>
          <span style="font-size: 0.72rem; opacity: 0.7; margin-left: 0.2rem;">(${cat.active_tasks || 0})</span>
        </div>
      `;
    });

    bar.innerHTML = html;
  },

  renderTaskModalSelect() {
    const select = document.getElementById('task-input-category');
    if (!select) return;

    let html = '<option value="">-- No Category --</option>';
    this.categories.forEach(cat => {
      html += `<option value="${cat.id}">${this.escapeHtml(cat.name)}</option>`;
    });
    select.innerHTML = html;
  },

  renderCategoriesView() {
    const grid = document.getElementById('categories-main-grid');
    if (!grid) return;

    if (this.categories.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1.5rem; background: var(--glass-bg); border-radius: var(--radius-lg); border: var(--glass-border); color: var(--text-muted);">
          <i class="fa-solid fa-tags" style="font-size: 3.2rem; margin-bottom: 1rem; color: var(--text-subtle);"></i>
          <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-main);">No Categories Active</h3>
          <p style="max-width: 480px; margin: 0 auto 1.5rem; font-size: 0.9rem;">You can organize your tasks with custom categories or restore the suggested default categories.</p>
          <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
            <button class="btn-primary" onclick="CategoryManager.restoreDefaults()">
              <i class="fa-solid fa-rotate-left"></i> Load Suggested Categories
            </button>
            <button class="btn-secondary" onclick="CategoryManager.openCreateModal()">
              <i class="fa-solid fa-plus"></i> Create Custom Category
            </button>
          </div>
        </div>
      `;
      return;
    }

    let html = '';
    this.categories.forEach(cat => {
      const total = cat.total_tasks || 0;
      const completed = cat.completed_tasks || 0;
      const active = cat.active_tasks || 0;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      html += `
        <div class="category-card" style="border-top: 4px solid ${cat.color};">
          <div>
            <div class="cat-card-header">
              <div class="cat-icon-name">
                <div class="cat-icon-badge" style="background: ${cat.color};">
                  <i class="fa-solid ${cat.icon || 'fa-tag'}"></i>
                </div>
                <div>
                  <div class="cat-name">${this.escapeHtml(cat.name)}</div>
                  <span style="font-size: 0.78rem; color: var(--text-muted);">${total} total tasks</span>
                </div>
              </div>
              <div class="task-actions">
                <button class="btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.78rem;" title="Edit Category" onclick="CategoryManager.openEditModal(${cat.id})">
                  <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.78rem; color: var(--priority-urgent);" title="Remove Category" onclick="CategoryManager.confirmDelete(${cat.id}, '${this.escapeHtml(cat.name)}')">
                  <i class="fa-solid fa-trash"></i> Remove
                </button>
              </div>
            </div>

            <div class="cat-stats-row">
              <div class="cat-progress-text">
                <span>Completion Progress</span>
                <span>${pct}% (${completed}/${total})</span>
              </div>
              <div class="prod-progress-bar">
                <div class="prod-progress-fill" style="width: ${pct}%; background: ${cat.color};"></div>
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: var(--text-subtle); padding-top: 0.85rem; border-top: 1px solid var(--border-color);">
            <span><strong style="color: var(--text-main);">${active}</strong> Active Tasks</span>
            <button class="btn-secondary" style="padding: 0.3rem 0.75rem; font-size: 0.8rem;" onclick="CategoryManager.viewCategoryTasks(${cat.id})">
              Filter Tasks <i class="fa-solid fa-arrow-right" style="font-size: 0.65rem;"></i>
            </button>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
  },

  selectCategory(catId) {
    SoundEngine.playClick();
    this.selectedCategoryId = catId;
    this.renderSidebarCategories();
    this.renderTaskFilterChips();

    // Switch to tasks view if not already there
    App.switchView('tasks');
    TaskManager.currentFilters.category_id = catId;
    TaskManager.loadTasks();
  },

  viewCategoryTasks(catId) {
    this.selectCategory(String(catId));
  },

  openCreateModal() {
    SoundEngine.playClick();
    const form = document.getElementById('category-form');
    form.reset();
    document.getElementById('category-id').value = '';
    document.getElementById('category-modal-title').textContent = 'New Category';
    
    this.setColorActive('#6366f1');
    this.setIconActive('fa-tag');

    App.openModal('category-modal');
  },

  openEditModal(catId) {
    SoundEngine.playClick();
    const cat = this.categories.find(c => c.id === catId);
    if (!cat) return;

    document.getElementById('category-id').value = cat.id;
    document.getElementById('category-input-name').value = cat.name;
    document.getElementById('category-modal-title').textContent = 'Edit Category';

    this.setColorActive(cat.color);
    this.setIconActive(cat.icon);

    App.openModal('category-modal');
  },

  setColorActive(color) {
    document.getElementById('category-input-color').value = color;
    document.querySelectorAll('#category-color-presets .color-dot-btn').forEach(btn => {
      if (btn.dataset.color.toLowerCase() === color.toLowerCase()) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  setIconActive(icon) {
    document.getElementById('category-input-icon').value = icon;
    document.querySelectorAll('#category-icon-presets .icon-preset-btn').forEach(btn => {
      if (btn.dataset.icon === icon) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  confirmDelete(catId, catName) {
    App.openConfirmModal({
      title: `Remove Category "${catName}"?`,
      message: 'Tasks inside this category will remain completely safe and become Uncategorized (No Category).',
      actionText: 'Remove Category',
      onConfirm: async () => {
        const res = await API.categories.delete(catId);
        if (res.success) {
          API.showToast(res.message || 'Category removed', 'success');
          if (this.selectedCategoryId === String(catId)) {
            this.selectedCategoryId = '';
            TaskManager.currentFilters.category_id = '';
          }
          await this.loadCategories();
          TaskManager.loadTasks();
          Dashboard.loadStats();
        } else {
          API.showToast(res.message || 'Failed to remove category', 'error');
        }
      }
    });
  },

  confirmRemoveAll() {
    App.openConfirmModal({
      title: 'Remove All Categories?',
      message: 'All your current categories will be removed. All of your existing tasks will remain safe as Uncategorized.',
      actionText: 'Remove All Categories',
      onConfirm: async () => {
        const res = await API.categories.removeAll();
        if (res.success) {
          API.showToast('All categories removed', 'success');
          this.selectedCategoryId = '';
          TaskManager.currentFilters.category_id = '';
          await this.loadCategories();
          TaskManager.loadTasks();
          Dashboard.loadStats();
        } else {
          API.showToast(res.message || 'Operation failed', 'error');
        }
      }
    });
  },

  async restoreDefaults() {
    SoundEngine.playClick();
    const res = await API.categories.restoreDefaults();
    if (res.success) {
      API.showToast('Suggested categories restored!', 'success');
      await this.loadCategories();
      TaskManager.loadTasks();
      Dashboard.loadStats();
    } else {
      API.showToast(res.message || 'Failed to restore default categories', 'error');
    }
  },

  bindEvents() {
    const form = document.getElementById('category-form');
    const newBtn = document.getElementById('categories-btn-new');
    const quickAddSidebarBtn = document.getElementById('btn-quick-add-category');
    const removeAllBtn = document.getElementById('categories-btn-remove-all');
    const restoreDefaultsBtn = document.getElementById('categories-btn-restore-defaults');

    if (newBtn) newBtn.addEventListener('click', () => this.openCreateModal());
    if (quickAddSidebarBtn) quickAddSidebarBtn.addEventListener('click', () => this.openCreateModal());
    if (removeAllBtn) removeAllBtn.addEventListener('click', () => this.confirmRemoveAll());
    if (restoreDefaultsBtn) restoreDefaultsBtn.addEventListener('click', () => this.restoreDefaults());

    // Color presets click
    document.querySelectorAll('#category-color-presets .color-dot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setColorActive(btn.dataset.color);
      });
    });

    // Icon presets click
    document.querySelectorAll('#category-icon-presets .icon-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setIconActive(btn.dataset.icon);
      });
    });

    // Form submit
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const catId = document.getElementById('category-id').value;
        const name = document.getElementById('category-input-name').value.trim();
        const color = document.getElementById('category-input-color').value;
        const icon = document.getElementById('category-input-icon').value;

        if (!name) return;

        let res;
        if (catId) {
          res = await API.categories.update(catId, { name, color, icon });
        } else {
          res = await API.categories.create({ name, color, icon });
        }

        if (res.success) {
          API.showToast(catId ? 'Category updated!' : 'Category created!', 'success');
          App.closeModal('category-modal');
          await this.loadCategories();
          TaskManager.loadTasks();
          Dashboard.loadStats();
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
