/**
 * MyEstia - Dashboard & Analytics Service
 * Manages KPI rollups, Chart.js visualizations, Today's Focus agenda, and velocity trends.
 */

const Dashboard = {
  charts: {},

  async init() {
    await this.loadStats();
    this.bindEvents();
  },

  async loadStats() {
    try {
      const res = await API.dashboard.getStats();
      if (res.success && res.stats) {
        const s = res.stats;
        this.updateKPIs(s);
        this.renderFocusList(s.upcoming_focus || []);
        this.renderWeeklyActivityChart(s.weekly_activity || []);
        this.renderPriorityChart(s.priority_distribution || {});
        this.renderCategoryChart(s.category_distribution || []);
        this.renderAnalyticsTable(s.category_distribution || []);
      }
    } catch (e) {
      console.error('Failed to load dashboard stats:', e);
    }
  },

  updateKPIs(stats) {
    this.animateCounter('kpi-total', stats.total_tasks || 0);
    this.animateCounter('kpi-completed', stats.completed_tasks || 0);
    this.animateCounter('kpi-pending', stats.pending_tasks || 0);
    this.animateCounter('kpi-due-today', stats.due_today_tasks || 0);
    this.animateCounter('kpi-overdue', stats.overdue_tasks || 0);
    
    const rateEl = document.getElementById('kpi-rate');
    if (rateEl) rateEl.textContent = `${stats.completion_rate || 0}%`;

    // Sidebar Goal Mini Card
    const sideProdBar = document.getElementById('sidebar-prod-bar');
    const sideProdPct = document.getElementById('sidebar-prod-percent');
    const sideProdRatio = document.getElementById('sidebar-prod-ratio');

    if (sideProdBar) sideProdBar.style.width = `${stats.completion_rate || 0}%`;
    if (sideProdPct) sideProdPct.textContent = `${stats.completion_rate || 0}%`;
    if (sideProdRatio) sideProdRatio.textContent = `${stats.completed_tasks || 0}/${stats.total_tasks || 0}`;
  },

  animateCounter(id, targetVal) {
    const el = document.getElementById(id);
    if (!el) return;
    const startVal = parseInt(el.textContent) || 0;
    const duration = 400;
    const startTime = performance.now();

    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.floor(startVal + (targetVal - startVal) * progress);
      el.textContent = current;
      if (progress < 1) requestAnimationFrame(update);
      else el.textContent = targetVal;
    };
    requestAnimationFrame(update);
  },

  renderFocusList(tasks) {
    const container = document.getElementById('dash-focus-list');
    if (!container) return;

    if (tasks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
          <i class="fa-solid fa-champagne-glasses" style="font-size: 2.2rem; color: var(--accent-emerald); margin-bottom: 0.5rem;"></i>
          <p style="font-weight: 600;">All caught up for today!</p>
          <span style="font-size: 0.8rem;">No urgent or pending tasks scheduled.</span>
        </div>
      `;
      return;
    }

    let html = '';
    tasks.forEach(task => {
      const isCompleted = task.is_completed === 1;
      const priorityClass = `badge-priority-${task.priority}`;

      html += `
        <div class="task-card ${task.priority}" style="padding: 0.85rem 1rem;">
          <div class="task-check-wrapper">
            <div class="custom-checkbox ${isCompleted ? 'checked' : ''}" onclick="TaskManager.toggleTaskDone(${task.id}, event)">
              ${isCompleted ? '<i class="fa-solid fa-check"></i>' : ''}
            </div>
          </div>
          <div class="task-content">
            <div class="task-header-row">
              <span class="task-title" style="font-size: 0.92rem; cursor: pointer;" onclick="TaskManager.openEditModal(${task.id})">
                ${this.escapeHtml(task.title)}
              </span>
              <span class="badge ${priorityClass}" style="font-size: 0.68rem;">
                ${task.priority.toUpperCase()}
              </span>
            </div>
            <div class="task-meta-row" style="font-size: 0.78rem;">
              ${task.category_name ? `
                <span style="color: ${task.category_color || 'var(--text-muted)'};">
                  <i class="fa-solid ${task.category_icon || 'fa-tag'}"></i> ${this.escapeHtml(task.category_name)}
                </span>
              ` : ''}
              <span style="color: var(--text-subtle);">
                <i class="fa-regular fa-calendar"></i> ${task.due_date || 'No Date'} ${task.due_time ? 'at ' + task.due_time : ''}
              </span>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  renderWeeklyActivityChart(weeklyData) {
    const ctx = document.getElementById('chart-weekly-activity');
    if (!ctx) return;

    const labels = weeklyData.map(d => d.label);
    const createdData = weeklyData.map(d => d.created);
    const completedData = weeklyData.map(d => d.completed);

    if (this.charts.weekly) this.charts.weekly.destroy();

    this.charts.weekly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Completed',
            data: completedData,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Created',
            data: createdData,
            backgroundColor: 'rgba(99, 102, 241, 0.45)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: 'Inter' } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#94a3b8', stepSize: 1 }
          }
        }
      }
    });

    // Mirror to Analytics View
    const ctxAnalytics = document.getElementById('chart-analytics-velocity');
    if (ctxAnalytics) {
      if (this.charts.analyticsVelocity) this.charts.analyticsVelocity.destroy();
      this.charts.analyticsVelocity = new Chart(ctxAnalytics, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Tasks Completed',
              data: completedData,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              fill: true,
              tension: 0.4
            },
            {
              label: 'Tasks Created',
              data: createdData,
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              fill: true,
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8' } }
          },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
            y: { ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.06)' } }
          }
        }
      });
    }
  },

  renderPriorityChart(priorityData) {
    const ctx = document.getElementById('chart-priority-dist');
    if (!ctx) return;

    if (this.charts.priority) this.charts.priority.destroy();

    this.charts.priority = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Urgent', 'High', 'Medium', 'Low'],
        datasets: [{
          data: [
            priorityData.urgent || 0,
            priorityData.high || 0,
            priorityData.medium || 0,
            priorityData.low || 0
          ],
          backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#64748b'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
          }
        },
        cutout: '68%'
      }
    });
  },

  renderCategoryChart(categoryData) {
    const ctx = document.getElementById('chart-category-dist');
    if (!ctx) return;

    if (this.charts.category) this.charts.category.destroy();

    const labels = categoryData.map(c => c.name);
    const counts = categoryData.map(c => c.task_count || 0);
    const colors = categoryData.map(c => c.color || '#6366f1');

    this.charts.category = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['No Categories'],
        datasets: [{
          data: counts.length ? counts : [1],
          backgroundColor: colors.length ? colors : ['#64748b'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
          }
        },
        cutout: '68%'
      }
    });

    // Mirror to Analytics view
    const ctxAnalytics = document.getElementById('chart-analytics-categories');
    if (ctxAnalytics) {
      if (this.charts.analyticsCat) this.charts.analyticsCat.destroy();
      this.charts.analyticsCat = new Chart(ctxAnalytics, {
        type: 'polarArea',
        data: {
          labels: labels,
          datasets: [{
            data: counts,
            backgroundColor: colors.map(c => c + 'AA'),
            borderColor: colors
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8' } }
          }
        }
      });
    }
  },

  renderAnalyticsTable(categories) {
    const tbody = document.getElementById('analytics-table-body');
    if (!tbody) return;

    let html = '';
    categories.forEach(cat => {
      const total = cat.task_count || 0;
      const completed = cat.completed_count || 0;
      const active = total - completed;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      html += `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 0.85rem 1rem; font-weight: 600;">
            <span class="category-dot" style="background: ${cat.color}; margin-right: 0.5rem;"></span>
            ${this.escapeHtml(cat.name)}
          </td>
          <td style="padding: 0.85rem 1rem;">${total}</td>
          <td style="padding: 0.85rem 1rem; color: var(--accent-amber);">${active}</td>
          <td style="padding: 0.85rem 1rem; color: var(--accent-emerald);">${completed}</td>
          <td style="padding: 0.85rem 1rem; width: 180px;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="prod-progress-bar" style="flex: 1; margin-bottom: 0;">
                <div class="prod-progress-fill" style="width: ${pct}%; background: ${cat.color};"></div>
              </div>
              <span style="font-size: 0.78rem; font-weight: 600; width: 35px;">${pct}%</span>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  bindEvents() {
    const viewAllBtn = document.getElementById('dash-btn-view-all-tasks');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        SoundEngine.playClick();
        App.switchView('tasks');
      });
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
};
