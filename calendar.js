/**
 * MyEstia - Interactive Calendar Timeline
 * Month grid generation, task events mapping, and click-to-schedule.
 */

const CalendarManager = {
  currentDate: new Date(),
  events: [],

  async init() {
    this.bindEvents();
    await this.loadEvents();
  },

  async loadEvents() {
    const year = this.currentDate.getFullYear();
    const month = String(this.currentDate.getMonth() + 1).padStart(2, '0');
    const monthQuery = `${year}-${month}`;

    try {
      const res = await API.calendar.getEvents(monthQuery);
      if (res.success) {
        this.events = res.events || [];
        this.renderCalendar();
      }
    } catch (e) {
      console.error('Failed to load calendar events:', e);
    }
  },

  renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('cal-month-title');
    if (!grid) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (title) title.textContent = `${monthNames[month]} ${year}`;

    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = dayHeaders.map(d => `<div class="cal-day-header">${d}</div>`).join('');

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const todayStr = new Date().toISOString().split('T')[0];

    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      html += `
        <div class="cal-day-cell other-month">
          <div class="cal-day-number">${dayNum}</div>
        </div>
      `;
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;

      // Filter events on this date
      const dayEvents = this.events.filter(e => e.due_date === dateStr);

      let eventsHtml = '';
      dayEvents.slice(0, 3).forEach(ev => {
        const bg = ev.category_color || '#6366f1';
        eventsHtml += `
          <div class="cal-event-chip" style="background: ${bg};" title="${this.escapeHtml(ev.title)}" onclick="event.stopPropagation(); TaskManager.openEditModal(${ev.id})">
            ${ev.due_time ? ev.due_time + ' ' : ''}${this.escapeHtml(ev.title)}
          </div>
        `;
      });

      if (dayEvents.length > 3) {
        eventsHtml += `
          <div style="font-size: 0.68rem; color: var(--text-subtle); padding: 0.1rem 0.2rem;">
            +${dayEvents.length - 3} more
          </div>
        `;
      }

      html += `
        <div class="cal-day-cell ${isToday ? 'today' : ''}" onclick="CalendarManager.clickDate('${dateStr}')">
          <div class="cal-day-number">${day}</div>
          <div class="cal-events-list">
            ${eventsHtml}
          </div>
        </div>
      `;
    }

    // Next month filler days to complete standard 35 or 42 grid cells
    const totalRendered = firstDayIndex + totalDays;
    const remaining = totalRendered % 7 === 0 ? 0 : 7 - (totalRendered % 7);
    for (let i = 1; i <= remaining; i++) {
      html += `
        <div class="cal-day-cell other-month">
          <div class="cal-day-number">${i}</div>
        </div>
      `;
    }

    grid.innerHTML = html;
  },

  clickDate(dateStr) {
    SoundEngine.playClick();
    TaskManager.openCreateModal();
    document.getElementById('task-input-duedate').value = dateStr;
  },

  bindEvents() {
    const prevBtn = document.getElementById('cal-btn-prev');
    const nextBtn = document.getElementById('cal-btn-next');
    const todayBtn = document.getElementById('cal-btn-today');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        SoundEngine.playClick();
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.loadEvents();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        SoundEngine.playClick();
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.loadEvents();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        SoundEngine.playClick();
        this.currentDate = new Date();
        this.loadEvents();
      });
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
};
