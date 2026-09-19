/**
 * MyEstia - Main Application Master Controller
 * Router, theme switcher, modal manager, keyboard shortcuts, and profile operations.
 */

const App = {
  currentUser: null,
  currentView: 'dashboard',
  confirmCallback: null,

  async init() {
    await this.loadUserProfile();
    this.bindNavigation();
    this.bindThemeToggle();
    this.bindModals();
    this.bindSearch();
    this.bindKeyboardShortcuts();

    // Initialize all child modules
    await CategoryManager.init();
    await TaskManager.init();
    await Dashboard.init();
    await CalendarManager.init();
    NotificationManager.init();

    // Setup Greeting and Date Header
    this.updateGreeting();
  },

  async loadUserProfile() {
    try {
      const res = await API.auth.getCurrentUser();
      if (res.success && res.user) {
        this.currentUser = res.user;
        this.applyUserProfile(res.user);
      }
    } catch (e) {
      console.error('Failed to load user profile:', e);
    }
  },

  applyUserProfile(user) {
    // Set theme
    const theme = user.theme_preference || 'dark';
    this.setTheme(theme);

    // Update Topbar
    const nameEl = document.getElementById('user-display-name');
    const avatarEl = document.getElementById('user-avatar-initials');
    const menuNameEl = document.getElementById('user-menu-full-name');
    const menuEmailEl = document.getElementById('user-menu-email');

    const firstName = user.full_name.split(' ')[0] || user.username;
    if (nameEl) nameEl.textContent = firstName;
    if (menuNameEl) menuNameEl.textContent = user.full_name;
    if (menuEmailEl) menuEmailEl.textContent = user.email;

    if (avatarEl) {
      const initials = user.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
      avatarEl.textContent = initials || 'U';
      if (user.avatar_color) {
        avatarEl.style.background = user.avatar_color;
      }
    }

    // Populate profile modal inputs
    const profileNameInput = document.getElementById('profile-input-name');
    const profileEmailInput = document.getElementById('profile-input-email');
    if (profileNameInput) profileNameInput.value = user.full_name;
    if (profileEmailInput) profileEmailInput.value = user.email;
  },

  updateGreeting() {
    const greetingEl = document.getElementById('dash-greeting');
    const dateEl = document.getElementById('dash-date-text');

    if (greetingEl) {
      const hour = new Date().getHours();
      let greeting = 'Good evening';
      if (hour < 12) greeting = 'Good morning';
      else if (hour < 18) greeting = 'Good afternoon';

      const name = this.currentUser ? this.currentUser.full_name.split(' ')[0] : '';
      greetingEl.textContent = `${greeting}${name ? ', ' + name : ''}! 👋`;
    }

    if (dateEl) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      dateEl.textContent = `Today is ${new Date().toLocaleDateString('en-US', options)}`;
    }
  },

  switchView(viewName) {
    SoundEngine.playClick();
    this.currentView = viewName;

    // Update nav links
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      if (item.dataset.view === viewName) {
        item.classList.add('active');
      } else if (item.dataset.view) {
        item.classList.remove('active');
      }
    });

    // Update view containers
    document.querySelectorAll('.view-container').forEach(view => {
      view.classList.remove('active');
    });

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
      targetView.classList.add('active');
    }

    // Trigger view-specific refreshes
    if (viewName === 'dashboard') {
      Dashboard.loadStats();
    } else if (viewName === 'tasks') {
      TaskManager.loadTasks();
    } else if (viewName === 'workflow') {
      TaskManager.loadTasks();
    } else if (viewName === 'calendar') {
      CalendarManager.loadEvents();
    } else if (viewName === 'categories') {
      CategoryManager.loadCategories();
    } else if (viewName === 'analytics') {
      Dashboard.loadStats();
    }

    // Close mobile sidebar if open
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('mobile-open');
  },

  bindNavigation() {
    // Sidebar nav clicks
    document.querySelectorAll('.sidebar .nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        this.switchView(item.dataset.view);
      });
    });

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }

    // User Menu dropdown toggle
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    if (userMenuBtn && userDropdown) {
      userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('show');
        const notifDropdown = document.getElementById('notification-dropdown');
        if (notifDropdown) notifDropdown.classList.remove('show');
      });

      document.addEventListener('click', (e) => {
        if (!userDropdown.contains(e.target) && e.target !== userMenuBtn) {
          userDropdown.classList.remove('show');
        }
      });
    }

    // Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await API.auth.logout();
        API.showToast('Logged out successfully', 'info');
        setTimeout(() => {
          window.location.href = '/login';
        }, 300);
      });
    }

    // Profile modal open
    const profileBtn = document.getElementById('btn-open-profile-modal');
    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        if (userDropdown) userDropdown.classList.remove('show');
        this.openModal('profile-modal');
      });
    }

    // Export Data JSON
    const exportBtn1 = document.getElementById('btn-export-data');
    const exportBtn2 = document.getElementById('analytics-btn-export');
    const handleExport = async () => {
      const data = await API.exportJSON();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myestia-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      API.showToast('Data exported successfully!', 'success');
    };

    if (exportBtn1) exportBtn1.addEventListener('click', handleExport);
    if (exportBtn2) exportBtn2.addEventListener('click', handleExport);
  },

  bindThemeToggle() {
    const btn = document.getElementById('btn-theme-toggle');
    const icon = document.getElementById('theme-icon');

    if (btn) {
      btn.addEventListener('click', async () => {
        SoundEngine.playClick();
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.setTheme(next);
        await API.auth.updateTheme(next);
        API.showToast(`${next === 'dark' ? '🌙 Dark' : '☀️ Light'} theme enabled`, 'info', 2000);
      });
    }
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }
  },

  bindModals() {
    // Close modal triggers
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        SoundEngine.playClick();
        this.closeModal(btn.dataset.closeModal);
      });
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Profile form submit
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('profile-input-name').value.trim();
        const avatar_color = document.getElementById('profile-input-avatar-color').value;

        const res = await API.auth.updateProfile(full_name, avatar_color);
        if (res.success) {
          API.showToast('Profile updated!', 'success');
          this.closeModal('profile-modal');
          await this.loadUserProfile();
          this.updateGreeting();
        } else {
          API.showToast(res.message || 'Profile update failed', 'error');
        }
      });
    }

    // Profile color selector
    document.querySelectorAll('#profile-color-presets .color-dot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('profile-input-avatar-color').value = btn.dataset.color;
        document.querySelectorAll('#profile-color-presets .color-dot-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Confirm modal action button
    const confirmActionBtn = document.getElementById('btn-confirm-action');
    if (confirmActionBtn) {
      confirmActionBtn.addEventListener('click', () => {
        SoundEngine.playClick();
        if (typeof this.confirmCallback === 'function') {
          this.confirmCallback();
        }
        this.closeModal('confirm-modal');
      });
    }
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
    }
  },

  openConfirmModal({ title, message, actionText = 'Confirm', onConfirm }) {
    SoundEngine.playClick();
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    document.getElementById('btn-confirm-action').textContent = actionText;
    this.confirmCallback = onConfirm;
    this.openModal('confirm-modal');
  },

  bindSearch() {
    const searchInput = document.getElementById('global-search');
    let debounceTimer;

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const query = e.target.value.trim();
          TaskManager.currentFilters.search = query;
          if (App.currentView !== 'tasks') {
            App.switchView('tasks');
          } else {
            TaskManager.loadTasks();
          }
        }, 300);
      });
    }
  },

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Focus search on '/' when not in input
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        const searchInput = document.getElementById('global-search');
        if (searchInput) searchInput.focus();
      }

      // 'N' for new task when not in input
      if ((e.key === 'n' || e.key === 'N') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        TaskManager.openCreateModal();
      }

      // 'Escape' closes any open modal
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.show').forEach(m => {
          this.closeModal(m.id);
        });
        const userDropdown = document.getElementById('user-dropdown');
        if (userDropdown) userDropdown.classList.remove('show');
        const notifDropdown = document.getElementById('notification-dropdown');
        if (notifDropdown) notifDropdown.classList.remove('show');
      }
    });
  }
};

// Initialize App when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
