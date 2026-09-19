/**
 * MyEstia - API Wrapper & Utility Helpers
 */

const API = {
  async request(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    try {
      const response = await fetch(endpoint, config);
      const data = await response.json();
      
      if (response.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        window.location.href = '/login';
        return { success: false, message: 'Session expired. Please log in again.' };
      }

      return data;
    } catch (error) {
      console.error(`API Error on ${endpoint}:`, error);
      return { success: false, message: error.message || 'Network request failed.' };
    }
  },

  // Auth Endpoints
  auth: {
    login: (username_or_email, password) => 
      API.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username_or_email, password }) }),
    demoLogin: () => 
      API.request('/api/auth/demo', { method: 'POST' }),
    register: (full_name, username, email, password) => 
      API.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ full_name, username, email, password }) }),
    logout: () => 
      API.request('/api/auth/logout', { method: 'POST' }),
    getCurrentUser: () => 
      API.request('/api/auth/me', { method: 'GET' }),
    updateProfile: (full_name, avatar_color) => 
      API.request('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ full_name, avatar_color }) }),
    updateTheme: (theme) => 
      API.request('/api/auth/theme', { method: 'PUT', body: JSON.stringify({ theme }) })
  },

  // Dashboard Endpoints
  dashboard: {
    getStats: () => API.request('/api/dashboard/stats', { method: 'GET' })
  },

  // Tasks Endpoints
  tasks: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return API.request(`/api/tasks?${queryString}`, { method: 'GET' });
    },
    getById: (id) => API.request(`/api/tasks/${id}`, { method: 'GET' }),
    create: (taskData) => API.request('/api/tasks', { method: 'POST', body: JSON.stringify(taskData) }),
    update: (id, taskData) => API.request(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(taskData) }),
    delete: (id) => API.request(`/api/tasks/${id}`, { method: 'DELETE' }),
    toggle: (id) => API.request(`/api/tasks/${id}/toggle`, { method: 'POST' }),
    addSubtask: (taskId, title) => API.request(`/api/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) }),
    toggleSubtask: (subtaskId) => API.request(`/api/subtasks/${subtaskId}/toggle`, { method: 'POST' }),
    deleteSubtask: (subtaskId) => API.request(`/api/subtasks/${subtaskId}`, { method: 'DELETE' }),
    batchAction: (task_ids, action, category_id = null) => 
      API.request('/api/tasks/batch-action', { method: 'POST', body: JSON.stringify({ task_ids, action, category_id }) })
  },

  // Categories Endpoints
  categories: {
    getAll: () => API.request('/api/categories', { method: 'GET' }),
    create: (data) => API.request('/api/categories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => API.request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => API.request(`/api/categories/${id}`, { method: 'DELETE' }),
    removeAll: () => API.request('/api/categories/remove-all', { method: 'POST' }),
    restoreDefaults: () => API.request('/api/categories/restore-defaults', { method: 'POST' })
  },

  // Reminders & Notifications Endpoints
  reminders: {
    getDue: () => API.request('/api/reminders/due', { method: 'GET' }),
    snooze: (taskId, minutes = 10) => API.request(`/api/reminders/${taskId}/snooze`, { method: 'POST', body: JSON.stringify({ minutes }) }),
    dismiss: (taskId) => API.request(`/api/reminders/${taskId}/dismiss`, { method: 'POST' })
  },

  notifications: {
    getAll: () => API.request('/api/notifications', { method: 'GET' }),
    markRead: () => API.request('/api/notifications/mark-read', { method: 'POST' })
  },

  // Calendar
  calendar: {
    getEvents: (month = '') => API.request(`/api/calendar/events?month=${month}`, { method: 'GET' })
  },

  // Export
  exportJSON: () => API.request('/api/export/json', { method: 'GET' }),

  // Toast Notification System
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    else if (type === 'error') iconClass = 'fa-circle-exclamation';
    else if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${iconClass} toast-icon"></i>
      <span style="flex: 1;">${message}</span>
      <button style="background:none; border:none; color:inherit; opacity: 0.6; cursor:pointer;" onclick="this.parentElement.remove()">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};
