/**
 * MyEstia - Notification & Reminder Service
 * Handles live polling, desktop notifications, in-app alerts, and snooze actions.
 */

const NotificationManager = {
  activeDueReminders: [],
  alertedTaskIds: new Set(),
  pollIntervalId: null,

  init() {
    this.requestBrowserPermission();
    this.fetchReminders();
    this.startPolling();
    this.bindEvents();
  },

  requestBrowserPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },

  startPolling() {
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);
    // Check every 25 seconds
    this.pollIntervalId = setInterval(() => {
      this.fetchReminders();
    }, 25000);
  },

  async fetchReminders() {
    try {
      const res = await API.reminders.getDue();
      if (res.success) {
        this.activeDueReminders = res.reminders || [];
        this.updateBadge();
        this.renderDropdown();
        this.checkNewAlerts();
      }
    } catch (e) {
      console.error('Error fetching due reminders:', e);
    }
  },

  checkNewAlerts() {
    this.activeDueReminders.forEach(task => {
      if (!this.alertedTaskIds.has(task.id)) {
        this.alertedTaskIds.add(task.id);
        
        // Play acoustic chime
        SoundEngine.playReminderAlarm();

        // In-app alert toast
        API.showToast(`⏰ Reminder: "${task.title}" is due!`, 'warning', 6000);

        // Browser Desktop Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`⏰ MyEstia Reminder: ${task.title}`, {
              body: task.description || `Priority: ${task.priority.toUpperCase()} | Due: ${task.due_date || 'Today'} ${task.due_time || ''}`,
              icon: '/static/favicon.ico'
            });
          } catch (err) {}
        }
      }
    });
  },

  updateBadge() {
    const badgeDot = document.getElementById('notif-badge-dot');
    if (badgeDot) {
      if (this.activeDueReminders.length > 0) {
        badgeDot.classList.add('active');
      } else {
        badgeDot.classList.remove('active');
      }
    }
  },

  renderDropdown() {
    const listContainer = document.getElementById('notification-list');
    if (!listContainer) return;

    if (this.activeDueReminders.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-notifs">
          <i class="fa-regular fa-bell-slash"></i>
          <p style="font-weight: 600; font-size: 0.9rem;">No Active Reminders</p>
          <span style="font-size: 0.78rem;">You're completely up to date!</span>
        </div>
      `;
      return;
    }

    let html = '';
    this.activeDueReminders.forEach(task => {
      const isUrgent = task.priority === 'urgent';
      html += `
        <div class="notification-item ${isUrgent ? 'urgent' : ''}" data-task-id="${task.id}">
          <div class="notif-icon-box" style="${isUrgent ? 'color: var(--priority-urgent); background: var(--priority-urgent-bg);' : ''}">
            <i class="fa-solid fa-clock"></i>
          </div>
          <div class="notif-content">
            <div class="notif-title">${this.escapeHtml(task.title)}</div>
            <div class="notif-desc">
              Due: ${task.due_date || 'Today'} ${task.due_time ? 'at ' + task.due_time : ''} • 
              <span style="color: ${task.priority === 'urgent' ? 'var(--priority-urgent)' : 'var(--primary-400)'}; font-weight: 600;">
                ${task.priority.toUpperCase()}
              </span>
            </div>
            <div class="notif-actions">
              <button class="notif-action-btn" onclick="NotificationManager.snooze(${task.id}, 10)">
                <i class="fa-solid fa-clock-rotate-left"></i> +10m
              </button>
              <button class="notif-action-btn" onclick="NotificationManager.snooze(${task.id}, 60)">
                +1h
              </button>
              <button class="notif-action-btn" onclick="NotificationManager.dismiss(${task.id})">
                <i class="fa-solid fa-check"></i> Dismiss
              </button>
            </div>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;
  },

  async snooze(taskId, minutes) {
    SoundEngine.playClick();
    const res = await API.reminders.snooze(taskId, minutes);
    if (res.success) {
      API.showToast(`Snoozed reminder for ${minutes} minutes`, 'info');
      this.alertedTaskIds.delete(taskId);
      this.fetchReminders();
    }
  },

  async dismiss(taskId) {
    SoundEngine.playClick();
    const res = await API.reminders.dismiss(taskId);
    if (res.success) {
      API.showToast('Reminder dismissed', 'info');
      this.fetchReminders();
    }
  },

  bindEvents() {
    const notifBtn = document.getElementById('btn-notifications');
    const notifDropdown = document.getElementById('notification-dropdown');
    const clearBtn = document.getElementById('btn-clear-notifications');

    if (notifBtn && notifDropdown) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('show');
        const userDropdown = document.getElementById('user-dropdown');
        if (userDropdown) userDropdown.classList.remove('show');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        for (const task of this.activeDueReminders) {
          await API.reminders.dismiss(task.id);
        }
        this.fetchReminders();
        API.showToast('All active reminders cleared', 'info');
      });
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== notifBtn) {
        notifDropdown.classList.remove('show');
      }
    });
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
};
