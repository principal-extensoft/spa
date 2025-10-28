/**
 * calendar-view.mjs
 * Calendar Month View - Monthly calendar with split-pane details
 * 
 * Responsibilities:
 * - Render monthly calendar grid with weeks
 * - Display daily stats (tasks, hours, todos, accomplishments, work sessions)
 * - Implement split-pane layout (left: calendar, right: details)
 * - Support day and week selection
 * - Handle month navigation and filters
 * - Async parallel rendering for performance
 * 
 * Dependencies: task-service, timelog-service, daily-service, project-service, state-service, ui-utils
 */

import { getTasks } from './task-service.mjs';
import { getTimeLogs } from './timelog-service.mjs';
import { getTodos, getAccomplishments, getWorkSession, saveWorkSession, deleteWorkSession } from './daily-service.mjs';
import { getProjectDisplayInfo, getPhaseDisplayInfo } from './project-service.mjs';
import { getMonthOffset, setMonthOffset, getGlobalFilters, setGlobalFilters } from './state-service.mjs';
import { getDateRange, showToast } from './ui-utils.mjs';

// Module-level variable to store filtered tasks for calendar interactions
let currentFilteredTasks = [];

// ============================================================
// CALENDAR VIEW RENDERING
// ============================================================

/**
 * Render the Calendar Month view
 * @param {HTMLElement} container - Container element to render into
 * @param {object} filters - Active filters { status, urgency, project, phase }
 * @returns {Promise<void>}
 */
export async function renderCalendarView(container, filters = {}) {
  console.log('Rendering Calendar Month view');
  console.log('Filters received:', JSON.stringify(filters));
  
  try {
    // Get month offset and calculate target month
    const offset = getMonthOffset();
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + offset);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    
    console.log(`Calendar: Year=${year}, Month=${month}, Offset=${offset}`);
    
    // Generate calendar structure
    const calendar = getMonthCalendar(year, month);
    
    // Get all tasks
    let tasks = await getTasks({}, true);
    console.log(`Calendar: Loaded ${tasks.length} tasks`);
    
    // Apply filters
    if (filters.status) {
      tasks = tasks.filter(task => task.status === filters.status);
    }
    if (filters.urgency) {
      tasks = tasks.filter(task => task.urgency === filters.urgency);
    }
    if (filters.project) {
      tasks = tasks.filter(task => task.projectId && task.projectId.toString() === filters.project);
    }
    if (filters.phase) {
      tasks = tasks.filter(task => task.phaseKey === filters.phase);
    }
    
    console.log(`Calendar: ${tasks.length} tasks after filters`);
    
    // Store filtered tasks for use by other functions
    currentFilteredTasks = tasks;
  
  // Build calendar HTML header
  const periodLabel = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const calendarHTML = `
    <div class="calendar-header">
      <!-- Navigation & Period Label -->
      <div class="calendar-nav-section">
        <button class="btn btn-outline-primary btn-sm" id="calendarPrevMonth">
          <i class="fas fa-chevron-left"></i>
        </button>
        <h5 class="mb-0 mx-3" id="calendarPeriodLabel">${periodLabel}</h5>
        <button class="btn btn-outline-primary btn-sm" id="calendarNextMonth">
          <i class="fas fa-chevron-right"></i>
        </button>
        <button class="btn btn-outline-secondary btn-sm ms-2" id="calendarTodayButton">Today</button>
      </div>
      
      <!-- Filters -->
      <div class="calendar-filters-compact">
        <select id="calendarStatusFilter" class="form-select form-select-sm" title="Filter by status">
          <option value="">All Status</option>
          <option value="Ready">Ready</option>
          <option value="Estimated">Estimated</option>
          <option value="InProgress">In Progress</option>
          <option value="Blocked">Blocked</option>
          <option value="Backburner">Backburner</option>
          <option value="OnHold">On Hold</option>
          <option value="Completed">Completed</option>
          <option value="Abandoned">Abandoned</option>
          <option value="Archived">Archived</option>
        </select>
        <select id="calendarUrgencyFilter" class="form-select form-select-sm" title="Filter by urgency">
          <option value="">All Urgency</option>
          <option value="High">High</option>
          <option value="Med">Med</option>
          <option value="Low">Low</option>
        </select>
        <button class="btn btn-outline-secondary btn-sm" id="clearCalendarFilters" title="Clear all filters">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <!-- Monthly Summary -->
      <div class="month-summary-compact">
        <div class="summary-item">
          <i class="fas fa-tasks text-primary"></i>
          <span class="summary-value" id="monthTotalTasks">0</span>
        </div>
        <div class="summary-item">
          <i class="fas fa-clock text-success"></i>
          <span class="summary-value" id="monthTotalHours">0h</span>
        </div>
        <div class="summary-item">
          <i class="fas fa-calendar-check text-info"></i>
          <span class="summary-value" id="monthWorkDays">0</span>
        </div>
      </div>
    </div>
  `;
  
  // Calculate daily stats for all days in the calendar
  const dailyStats = await calculateDailyStats(tasks, year, month);
  
  // Build the calendar table with async day content (pass filtered tasks)
  const calendarTable = await buildCalendarTable(calendar, dailyStats, year, month, tasks);
  
  // Combine all HTML parts
  const fullCalendarHTML = `
    <div class="month-split-view">
      <!-- Left Pane: Calendar -->
      <div class="month-calendar-pane">
        ${calendarHTML}
        ${calendarTable}
      </div>
      
      <!-- Right Pane: Details -->
      <div class="month-details-pane">
        <div class="month-details-header">
          <h6 id="selectedPeriodTitle" class="mb-0">Select a day or week</h6>
          <small id="selectedPeriodSubtitle" class="text-muted"></small>
        </div>
        <div id="selectedPeriodContent">
          <div class="text-muted text-center py-4">
            <i class="fas fa-calendar-alt fa-2x opacity-50 mb-3"></i>
            <p>Click on a day or week to view details</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = fullCalendarHTML;
  
  // Update monthly summary
  updateMonthlySummary(dailyStats);
  
  // Reset initialization flag since we just recreated the DOM
  isCalendarControlsInitialized = false;
  
  // Initialize interactions
  initializeCalendarInteractions(dailyStats, year, month);
  initializeCalendarControls();
  restoreCalendarFilters();
  
  console.log('✅ Calendar view rendered successfully');
  
  } catch (error) {
    console.error('❌ Error rendering calendar view:', error);
    container.innerHTML = `
      <div class="alert alert-danger m-3">
        <h5><i class="fas fa-exclamation-triangle"></i> Calendar View Error</h5>
        <p>Failed to load calendar view: ${error.message}</p>
        <button class="btn btn-primary btn-sm" onclick="location.reload()">Reload Page</button>
      </div>
    `;
  }
}

// ============================================================
// CALENDAR GENERATION
// ============================================================

/**
 * Generate calendar structure for a given month
 * @param {number} year - Year (e.g., 2025)
 * @param {number} month - Month (1-12)
 * @returns {Array<Array<number|null>>} Array of weeks, each containing 7 days (or null for empty cells)
 */
export function getMonthCalendar(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = lastDay.getDate();
  
  const calendar = [];
  let week = new Array(7).fill(null);
  
  // Fill in the first week
  for (let i = firstDayOfWeek; i < 7; i++) {
    week[i] = i - firstDayOfWeek + 1;
  }
  calendar.push(week);
  
  // Fill in the remaining weeks
  let day = 8 - firstDayOfWeek;
  while (day <= daysInMonth) {
    week = [];
    for (let i = 0; i < 7; i++) {
      if (day <= daysInMonth) {
        week.push(day);
        day++;
      } else {
        week.push(null);
      }
    }
    calendar.push(week);
  }
  
  return calendar;
}

// ============================================================
// DAILY STATS CALCULATION
// ============================================================

/**
 * Calculate daily statistics for all days in the month
 * @param {Array} tasks - All tasks
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<object>} Daily stats keyed by date string (YYYY-MM-DD)
 */
async function calculateDailyStats(tasks, year, month) {
  const dailyStats = {};
  
  // Add tasks to their due dates
  for (const task of tasks) {
    if (task.dueOn) {
      if (!dailyStats[task.dueOn]) {
        dailyStats[task.dueOn] = {
          tasks: [],
          totalHours: 0,
          todos: 0,
          accomplishments: 0,
          workSession: null
        };
      }
      dailyStats[task.dueOn].tasks.push(task);
    }
    
    // Also add completed/abandoned tasks to their completion date
    const completionDate = getTaskCompletionDate(task);
    if (completionDate && completionDate !== task.dueOn) {
      if (!dailyStats[completionDate]) {
        dailyStats[completionDate] = {
          tasks: [],
          totalHours: 0,
          todos: 0,
          accomplishments: 0,
          workSession: null
        };
      }
      // Only add if not already included on due date
      const alreadyIncluded = dailyStats[completionDate].tasks.some(t => t.id === task.id);
      if (!alreadyIncluded) {
        dailyStats[completionDate].tasks.push(task);
      }
    }
  }
  
  // Get time logs for the month
  const startOfMonth = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endOfMonth = `${year}-${month.toString().padStart(2, '0')}-${new Date(year, month, 0).getDate().toString().padStart(2, '0')}`;
  
  for (const dateStr in dailyStats) {
    for (const task of dailyStats[dateStr].tasks) {
      const logs = await getTimeLogs(task.id, dateStr, dateStr);
      dailyStats[dateStr].totalHours += logs.reduce((sum, log) => sum + log.hours, 0);
    }
  }
  
  // Get work sessions for the month (placeholder - needs work session service)
  // const workSessions = await getWorkSessionsForDateRange(startOfMonth, endOfMonth);
  // workSessions.forEach(session => { ... });
  
  // Get todos and accomplishments for the month
  try {
    const allTodos = await getTodos(true);
    const allAccomplishments = await getAccomplishments();
    
    allTodos.forEach(todo => {
      const todoDate = todo.createdAt?.split('T')[0];
      if (todoDate) {
        if (!dailyStats[todoDate]) {
          dailyStats[todoDate] = { tasks: [], totalHours: 0, todos: 0, accomplishments: 0, workSession: null };
        }
        dailyStats[todoDate].todos++;
      }
    });
    
    allAccomplishments.forEach(acc => {
      const accDate = acc.createdAt?.split('T')[0];
      if (accDate) {
        if (!dailyStats[accDate]) {
          dailyStats[accDate] = { tasks: [], totalHours: 0, todos: 0, accomplishments: 0, workSession: null };
        }
        dailyStats[accDate].accomplishments++;
      }
    });
  } catch (err) {
    console.error('Error loading calendar data:', err);
  }
  
  return dailyStats;
}

/**
 * Get task completion date
 * @param {object} task - Task object
 * @returns {string|null} ISO date string or null
 */
function getTaskCompletionDate(task) {
  if (['Completed', 'Abandoned', 'Archived'].includes(task.status)) {
    return task.completedOn || task.lastModified?.split('T')[0] || null;
  }
  return null;
}

// ============================================================
// CALENDAR TABLE BUILDING
// ============================================================

/**
 * Build the calendar table HTML with async day content
 * @param {Array<Array>} calendar - Calendar structure
 * @param {object} dailyStats - Daily statistics
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {Array} filteredTasks - Filtered task list
 * @returns {Promise<string>} HTML string
 */
async function buildCalendarTable(calendar, dailyStats, year, month, filteredTasks) {
  let html = '<div class="calendar-table-container"><table class="table calendar-table"><thead><tr>';
  html += '<th class="week-selector-header" title="Select Week"><i class="fas fa-calendar-week"></i></th>';
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => html += `<th>${day}</th>`);
  html += '</tr></thead><tbody>';
  
  let weekIndex = 0;
  for (const week of calendar) {
    html += `<tr class="calendar-week-row" data-week="${weekIndex}">`;
    html += `<td class="week-selector-cell clickable-week-header" data-week="${weekIndex}">
      <span class="week-number">W${weekIndex + 1}</span>
    </td>`;
    
    // Build all day contents for this week in parallel
    const weekDays = week.slice(0, 7);
    const dayPromises = weekDays.map(async (day) => {
      if (!day) return { day: null, content: '' };
      
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const dayStats = dailyStats[dateStr] || { tasks: [], totalHours: 0, todos: 0, accomplishments: 0, workSession: null };
      const isToday = dateStr === new Date().toISOString().split('T')[0];
      
      const dueBadge = await buildDueDateBadge(dayStats.tasks, dateStr);
      const timeIndicators = await buildTimeIndicators(dayStats.tasks, dateStr, dayStats.workSession, filteredTasks);
      const progressBars = await buildProgressBars(dayStats.tasks, dateStr, filteredTasks);
      
      return {
        day,
        dateStr,
        isToday,
        content: `
          <div class="calendar-day-inner">
            <div class="calendar-day-header">
              <div class="day-number-row">
                <span class="calendar-day-number">${day}</span>
                ${dueBadge}
              </div>
            </div>
            <div class="calendar-day-content">
              ${timeIndicators}
              <div class="calendar-progress-bars">
                ${progressBars}
              </div>
            </div>
          </div>
        `
      };
    });
    
    // Wait for all days in this week to be processed
    const dayContents = await Promise.all(dayPromises);
    
    // Add each day to the calendar table
    for (const dayData of dayContents) {
      if (dayData.day) {
        html += `<td class="calendar-day ${dayData.isToday ? 'today' : ''}" data-date="${dayData.dateStr}">`;
        html += dayData.content;
        html += '</td>';
      } else {
        html += '<td class="calendar-day empty-day"></td>';
      }
    }
    
    html += '</tr>';
    weekIndex++;
  }
  
  html += '</tbody></table></div>';
  return html;
}

/**
 * Build due date badge for a day
 * @param {Array} tasks - Tasks for the day
 * @param {string} dateStr - Date string
 * @returns {Promise<string>} HTML string
 */
async function buildDueDateBadge(tasks, dateStr) {
  const dueTasks = tasks.filter(t => t.dueOn === dateStr);
  if (dueTasks.length === 0) return '';
  
  // Create individual badges for each task due on this day
  const badges = dueTasks.map(task => {
    const statusClass = `status-${task.status.toLowerCase()}`;
    const urgencyClass = `urgency-${task.urgency.toLowerCase()}`;
    const isOverdue = task.dueOn < new Date().toISOString().split('T')[0] && 
                     !['Completed', 'Abandoned', 'Archived'].includes(task.status);
    
    return `<span class="due-task-badge ${statusClass} ${urgencyClass} ${isOverdue ? 'overdue-badge' : ''}" 
                  title="${task.title} - ${task.status}">
              <i class="fas fa-circle"></i>
            </span>`;
  }).join('');
  
  return `<div class="due-badges-container">${badges}</div>`;
}

/**
 * Build time indicators for a day (shows hours worked)
 * @param {Array} tasks - Tasks for the day (not used - kept for compatibility)
 * @param {string} dateStr - Date string
 * @param {object} workSession - Work session for the day
 * @returns {Promise<string>} HTML string
 */
async function buildTimeIndicators(tasks, dateStr, workSession, filteredTasks) {
  // Get ALL time logs for this specific date (not just for tasks due that day)
  const allTimeLogs = await getTimeLogs(null, dateStr, dateStr);
  
  // Filter time logs to only include tasks that pass the filter
  const filteredTaskIds = new Set(filteredTasks.map(t => t.id));
  const filteredTimeLogs = allTimeLogs.filter(log => filteredTaskIds.has(log.taskId));
  
  const totalHours = filteredTimeLogs.reduce((sum, log) => sum + log.hours, 0);
  
  if (totalHours === 0) {
    return '';
  }
  
  return `<div class="day-time-summary"><span class="hours-worked"><i class="fas fa-clock"></i> ${totalHours.toFixed(1)}h</span></div>`;
}

/**
 * Build progress bars for tasks on a day
 * @param {Array} tasksForDay - Tasks already in dayStats (due/completed on this day)
 * @param {string} dateStr - Date string
 * @param {Array} filteredTasks - Filtered task list
 * @returns {Promise<string>} HTML string
 */
async function buildProgressBars(tasksForDay, dateStr, filteredTasks) {
  // Get ALL time logs for this date
  const dayLogs = await getTimeLogs(null, dateStr, dateStr);
  
  if (dayLogs.length === 0) return '';
  
  // Filter time logs to only include tasks that pass the filter
  const filteredTaskIds = new Set(filteredTasks.map(t => t.id));
  const filteredDayLogs = dayLogs.filter(log => filteredTaskIds.has(log.taskId));
  
  if (filteredDayLogs.length === 0) return '';
  
  // Get unique task IDs that have time logged on this day (and pass filters)
  const taskIdsWithTime = [...new Set(filteredDayLogs.map(log => log.taskId))];
  
  // Build progress bars for each task with time logged on this day
  let html = '';
  
  for (const taskId of taskIdsWithTime) {
    const task = filteredTasks.find(t => t.id === taskId);
    if (!task) continue;
    
    const taskDayLogs = filteredDayLogs.filter(log => log.taskId === taskId);
    const dayHours = taskDayLogs.reduce((sum, log) => sum + log.hours, 0);
    
    // Get total hours for progress calculation
    const allTaskLogs = await getTimeLogs(taskId);
    const totalHours = allTaskLogs.reduce((sum, log) => sum + log.hours, 0);
    const estimate = task.estimate || 0;
    const remaining = task.remainingHours || 0;
    
    if (estimate > 0) {
      const progress = Math.min((totalHours / estimate) * 100, 100);
      const remainingPercent = Math.max(0, 100 - progress);
      
      html += `
        <div class="mini-progress-bar" title="${task.title}: ${dayHours.toFixed(1)}h logged on ${dateStr} (${totalHours.toFixed(1)}h / ${estimate}h total)">
          <div class="mini-progress-fill status-${task.status.toLowerCase()}" style="width: ${progress}%"></div>
          <div class="mini-progress-remaining" style="width: ${remainingPercent}%; left: ${progress}%"></div>
        </div>
      `;
    } else {
      // For tasks without estimates, show a simple indicator bar
      html += `
        <div class="mini-progress-bar no-estimate" title="${task.title}: ${dayHours.toFixed(1)}h logged on ${dateStr} (${totalHours.toFixed(1)}h total)">
          <div class="mini-progress-fill status-${task.status.toLowerCase()}" style="width: 100%"></div>
        </div>
      `;
    }
  }
  
  return html;
}

// ============================================================
// CALENDAR INTERACTIONS
// ============================================================

/**
 * Initialize calendar interactions (day/week selection)
 * @param {object} dailyStats - Daily statistics
 * @param {number} year - Year
 * @param {number} month - Month
 */
function initializeCalendarInteractions(dailyStats, year, month) {
  const weekHeaders = document.querySelectorAll('.clickable-week-header');
  const calendarDays = document.querySelectorAll('.calendar-day[data-date]');
  
  // Week selection handlers
  weekHeaders.forEach(header => {
    header.addEventListener('click', (e) => {
      const weekIndex = parseInt(e.currentTarget.dataset.week);
      const weekRow = document.querySelector(`[data-week="${weekIndex}"]`);
      
      // Clear previous selections
      document.querySelectorAll('.calendar-week-row').forEach(row => row.classList.remove('selected-week'));
      document.querySelectorAll('.clickable-week-header').forEach(h => h.classList.remove('selected-week-header'));
      document.querySelectorAll('.calendar-day').forEach(day => day.classList.remove('selected-day'));
      
      // Select the week
      weekRow.classList.add('selected-week');
      e.currentTarget.classList.add('selected-week-header');
      
      // Get week date range and stats
      const weekDays = Array.from(weekRow.querySelectorAll('.calendar-day[data-date]'))
        .map(day => day.dataset.date)
        .filter(date => date);
      
      if (weekDays.length > 0) {
        const weekStart = weekDays[0];
        const weekEnd = weekDays[weekDays.length - 1];
        displayWeekDetails(weekDays, dailyStats, weekStart, weekEnd);
      }
    });
  });
  
  // Day selection handlers
  calendarDays.forEach(day => {
    day.addEventListener('click', (e) => {
      const dateStr = e.currentTarget.dataset.date;
      if (!dateStr) return;
      
      // Clear previous selections
      document.querySelectorAll('.calendar-week-row').forEach(row => row.classList.remove('selected-week'));
      document.querySelectorAll('.clickable-week-header').forEach(h => h.classList.remove('selected-week-header'));
      document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected-day'));
      
      // Select the day
      e.currentTarget.classList.add('selected-day');
      
      displayDayDetails(dateStr, dailyStats);
    });
  });
}

/**
 * Display details for a selected week
 * @param {Array<string>} weekDays - Array of date strings
 * @param {object} dailyStats - Daily statistics
 * @param {string} weekStart - Start date
 * @param {string} weekEnd - End date
 */
async function displayWeekDetails(weekDays, dailyStats, weekStart, weekEnd) {
  const titleElement = document.getElementById('selectedPeriodTitle');
  const subtitleElement = document.getElementById('selectedPeriodSubtitle');
  const contentElement = document.getElementById('selectedPeriodContent');
  
  const startDate = new Date(weekStart);
  const endDate = new Date(weekEnd);
  const weekLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  
  titleElement.textContent = `Week: ${weekLabel}`;
  subtitleElement.textContent = 'Weekly Tasks';
  
  // Collect all tasks from the week: tasks due + tasks with time logged
  const weekTasks = new Map();
  
  // First, add tasks due during the week from dailyStats
  weekDays.forEach(dateStr => {
    const dayStats = dailyStats[dateStr];
    if (dayStats && dayStats.tasks) {
      dayStats.tasks.forEach(task => {
        if (!weekTasks.has(task.id)) {
          // For completed/abandoned tasks, only include if they were completed during this week
          if (['Completed', 'Abandoned'].includes(task.status)) {
            const completionDate = getTaskCompletionDate(task);
            if (completionDate && weekDays.includes(completionDate)) {
              weekTasks.set(task.id, { task, reason: 'due' });
            }
          } else {
            weekTasks.set(task.id, { task, reason: 'due' });
          }
        }
      });
    }
  });
  
  // Now add tasks with time logged during this week
  const weekTimeLogs = await getTimeLogs(null, weekStart, weekEnd);
  const tasksWithTime = new Set(weekTimeLogs.map(log => log.taskId));
  
  // Get all tasks to look up the ones with time logged
  if (tasksWithTime.size > 0) {
    for (const taskId of tasksWithTime) {
      if (!weekTasks.has(taskId)) {
        // This task has time logged but isn't in our due list - add it
        const task = currentFilteredTasks.find(t => t.id === taskId);
        if (task) {
          weekTasks.set(taskId, { task, reason: 'time' });
        }
      } else {
        // Task is already in the list due to being due - mark as both
        weekTasks.get(taskId).reason = 'both';
      }
    }
  }
  
  const allWeekTasks = Array.from(weekTasks.values()).map(item => item.task);
  
  // Calculate task progress
  const taskProgressData = await calculateTaskProgressData(weekStart, allWeekTasks);
  
  let content = `<div class="week-details">`;
  
  // Task cards for the week
  if (allWeekTasks.length > 0) {
    content += '<div class="tasks-section">';
    for (const taskItem of Array.from(weekTasks.values())) {
      const task = taskItem.task;
      const reason = taskItem.reason;
      const progressData = taskProgressData[task.id] || { totalHours: 0, todayHours: 0 };
      const statusClass = `status-${task.status.toLowerCase()}`;
      const progressPercent = task.estimate ? Math.min((progressData.totalHours / task.estimate) * 100, 100) : 0;
      const isOverdue = task.dueOn < weekEnd && !['Completed', 'Abandoned', 'Archived'].includes(task.status);
      
      const badgesHTML = await generateTaskBadgesHTML(task);
      
      // Add indicator for why this task is shown
      let reasonBadge = '';
      if (reason === 'due') {
        reasonBadge = '<span class="task-reason-badge due-badge-reason" title="Task due this week"><i class="fas fa-calendar-check"></i> Due</span>';
      } else if (reason === 'time') {
        reasonBadge = '<span class="task-reason-badge time-badge-reason" title="Time logged this week"><i class="fas fa-clock"></i> Logged</span>';
      } else if (reason === 'both') {
        reasonBadge = '<span class="task-reason-badge both-badge-reason" title="Due & time logged this week"><i class="fas fa-calendar-check"></i> <i class="fas fa-clock"></i></span>';
      }
      
      content += `
        <div class="progress-task-card ${isOverdue ? 'overdue' : ''}">
          <div class="task-card-header ${statusClass}">
            <div class="status-info">
              <span class="status-label">${task.status}</span>
              <span class="urgency-indicator urgency-${task.urgency.toLowerCase()}">${task.urgency}</span>
            </div>
            <div class="task-card-header-actions">
              ${reasonBadge}
              <button class="btn btn-sm btn-outline-info work-task-btn" data-task-id="${task.id}" title="Edit task in Work view">
                <i class="fas fa-edit"></i>
              </button>
            </div>
          </div>
          ${badgesHTML}
          <div class="task-card-body">
            <div class="task-title">${task.title}</div>
            <div class="task-progress-section">
              ${task.estimate ? `
                <div class="progress-bar-container">
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                  </div>
                  <div class="progress-text">${progressData.totalHours.toFixed(1)}h / ${task.estimate}h (${progressPercent.toFixed(0)}%)</div>
                </div>
              ` : `
                <div class="progress-text">Total: ${progressData.totalHours.toFixed(1)}h logged</div>
              `}
            </div>
            <div class="task-meta">
              <span class="task-due ${isOverdue ? 'overdue-text' : ''}">
                <i class="fas fa-calendar"></i> Due: ${new Date(task.dueOn).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      `;
    }
    content += '</div>';
  } else {
    content += `
      <div class="no-tasks-message">
        <i class="fas fa-calendar-week fa-2x text-muted mb-3"></i>
        <p class="text-muted">No tasks scheduled or worked on this week</p>
      </div>
    `;
  }
  
  content += '</div>';
  contentElement.innerHTML = content;
}

/**
 * Display details for a selected day
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {object} dailyStats - Daily statistics
 */
async function displayDayDetails(dateStr, dailyStats) {
  const titleElement = document.getElementById('selectedPeriodTitle');
  const subtitleElement = document.getElementById('selectedPeriodSubtitle');
  const contentElement = document.getElementById('selectedPeriodContent');
  
  const date = new Date(dateStr);
  const dayLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const dayStats = dailyStats[dateStr] || { tasks: [], totalHours: 0, todos: 0, accomplishments: 0 };
  
  titleElement.textContent = dayLabel;
  const isToday = dateStr === new Date().toISOString().split('T')[0];
  subtitleElement.textContent = isToday ? 'Today' : '';
  
  // Get ALL tasks for this day: tasks due on this day + tasks with time logged on this day
  const tasksForDay = new Map();
  
  // Add tasks from dailyStats (tasks due on this day)
  dayStats.tasks.forEach(task => {
    tasksForDay.set(task.id, { task, reason: 'due' });
  });
  
  // Add tasks with time logged on this day
  const dayTimeLogs = await getTimeLogs(null, dateStr, dateStr);
  
  // Filter to only show tasks that pass the current filters
  const filteredTaskIds = new Set(currentFilteredTasks.map(t => t.id));
  const filteredDayLogs = dayTimeLogs.filter(log => filteredTaskIds.has(log.taskId));
  
  for (const log of filteredDayLogs) {
    const task = currentFilteredTasks.find(t => t.id === log.taskId);
    if (task && !tasksForDay.has(task.id)) {
      tasksForDay.set(task.id, { task, reason: 'time' });
    } else if (task && tasksForDay.has(task.id)) {
      // Task is both due and has time - mark as both
      tasksForDay.get(task.id).reason = 'both';
    }
  }
  
  // Calculate task progress for all tasks
  const taskProgressData = await calculateTaskProgressData(dateStr, Array.from(tasksForDay.values()).map(item => item.task));
  
  let content = `<div class="day-details">`;
  
  // Task cards
  if (tasksForDay.size > 0) {
    content += '<div class="tasks-section">';
    
    for (const [taskId, { task, reason }] of tasksForDay) {
      const progressData = taskProgressData[task.id] || { totalHours: 0, todayHours: 0 };
      const statusClass = `status-${task.status.toLowerCase()}`;
      const progressPercent = task.estimate ? Math.min((progressData.totalHours / task.estimate) * 100, 100) : 0;
      const isOverdue = task.dueOn < dateStr && !['Completed', 'Abandoned', 'Archived'].includes(task.status);
      
      const badgesHTML = await generateTaskBadgesHTML(task);
      
      // Add indicator for why this task is shown
      let reasonBadge = '';
      if (reason === 'due') {
        reasonBadge = '<span class="task-reason-badge due-badge-reason" title="Task due on this day"><i class="fas fa-calendar-check"></i> Due</span>';
      } else if (reason === 'time') {
        reasonBadge = '<span class="task-reason-badge time-badge-reason" title="Time logged on this day"><i class="fas fa-clock"></i> Logged</span>';
      } else if (reason === 'both') {
        reasonBadge = '<span class="task-reason-badge both-badge-reason" title="Due & time logged"><i class="fas fa-calendar-check"></i> <i class="fas fa-clock"></i></span>';
      }
      
      content += `
        <div class="progress-task-card ${isOverdue ? 'overdue' : ''}">
          <div class="task-card-header ${statusClass}">
            <div class="status-info">
              <span class="status-label">${task.status}</span>
              <span class="urgency-indicator urgency-${task.urgency.toLowerCase()}">${task.urgency}</span>
            </div>
            <div class="task-card-header-actions">
              ${reasonBadge}
              <button class="btn btn-sm btn-outline-info work-task-btn" data-task-id="${task.id}" title="Edit task in Work view">
                <i class="fas fa-edit"></i>
              </button>
            </div>
          </div>
          ${badgesHTML}
          <div class="task-card-body">
            <div class="task-title">${task.title}</div>
            <div class="task-progress-section">
              ${task.estimate ? `
                <div class="progress-bar-container">
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                  </div>
                  <div class="progress-text">${progressData.totalHours.toFixed(1)}h / ${task.estimate}h (${progressPercent.toFixed(0)}%)</div>
                </div>
              ` : `
                <div class="progress-text">Total: ${progressData.totalHours.toFixed(1)}h logged</div>
              `}
              ${progressData.todayHours > 0 ? `
                <div class="today-hours">
                  <i class="fas fa-clock text-primary"></i> ${progressData.todayHours.toFixed(1)}h on this day
                </div>
              ` : ''}
            </div>
            <div class="task-meta">
              <span class="task-due ${isOverdue ? 'overdue-text' : ''}">
                <i class="fas fa-calendar"></i> Due: ${new Date(task.dueOn).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      `;
    }
    content += '</div>';
  } else {
    content += `
      <div class="no-tasks-message">
        <i class="fas fa-calendar-check fa-2x text-muted mb-3"></i>
        <p class="text-muted">No tasks scheduled or worked on this day</p>
      </div>
    `;
  }
  
  // Add Work Session section
  content += await generateWorkSessionSection(dateStr);
  
  content += '</div>';
  contentElement.innerHTML = content;
  
  // Initialize work session edit button
  initializeWorkSessionEditButton(dateStr);
}

/**
 * Generate Work Session section HTML
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {Promise<string>} HTML string
 */
async function generateWorkSessionSection(dateStr) {
  const session = await getWorkSession(dateStr);
  
  let sessionHTML = '';
  
  if (session) {
    const punchInTime = session.punchIn ? new Date(session.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const punchOutTime = session.punchOut ? new Date(session.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not Punched Out';
    const duration = session.totalHours ? `${session.totalHours.toFixed(2)}h` : 'In Progress';
    const isPunchedOut = !!session.punchOut;
    
    sessionHTML = `
      <div class="work-session-info">
        <div class="work-session-row">
          <span class="work-session-label">
            <i class="fas fa-sign-in-alt text-success"></i> Punch In:
          </span>
          <span class="work-session-value">${punchInTime}</span>
        </div>
        <div class="work-session-row">
          <span class="work-session-label">
            <i class="fas fa-sign-out-alt ${isPunchedOut ? 'text-danger' : 'text-muted'}"></i> Punch Out:
          </span>
          <span class="work-session-value ${!isPunchedOut ? 'text-muted' : ''}">${punchOutTime}</span>
        </div>
        <div class="work-session-row">
          <span class="work-session-label">
            <i class="fas fa-clock text-primary"></i> Duration:
          </span>
          <span class="work-session-value fw-bold text-primary">${duration}</span>
        </div>
      </div>
    `;
  } else {
    sessionHTML = `
      <div class="no-session-message text-muted text-center py-2">
        <i class="fas fa-briefcase me-1"></i>
        No work session recorded for this day
      </div>
    `;
  }
  
  return `
    <div class="work-session-section mt-4">
      <h6 class="mb-3">
        <i class="fas fa-briefcase me-2"></i>
        Work Session
      </h6>
      ${sessionHTML}
      <div class="mt-3 d-flex gap-2">
        <button class="btn btn-sm btn-outline-primary flex-fill" id="editWorkSessionBtn" data-date="${dateStr}">
          <i class="fas fa-edit me-1"></i>
          ${session ? 'Edit Session' : 'Add Session'}
        </button>
        ${session ? `
          <button class="btn btn-sm btn-outline-danger" id="deleteWorkSessionBtn" data-session-id="${session.id}" data-date="${dateStr}">
            <i class="fas fa-trash"></i>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Initialize work session edit button handler
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 */
function initializeWorkSessionEditButton(dateStr) {
  const editBtn = document.getElementById('editWorkSessionBtn');
  const deleteBtn = document.getElementById('deleteWorkSessionBtn');
  
  if (editBtn) {
    editBtn.addEventListener('click', async () => {
      await openWorkSessionModal(dateStr);
    });
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const sessionId = parseInt(deleteBtn.dataset.sessionId);
      if (confirm('Are you sure you want to delete this work session?')) {
        const success = await deleteWorkSession(sessionId);
        if (success) {
          showToast('Work session deleted', 'success');
          // Refresh the day details
          await displayDayDetails(dateStr, {});
          // Re-render calendar to update hours worked
          if (window.renderTasks) {
            window.renderTasks('month');
          }
        }
      }
    });
  }
}

/**
 * Calculate task progress data (total hours and today's hours)
 * @param {string} dateStr - Reference date
 * @param {Array} tasks - Tasks to calculate progress for
 * @returns {Promise<object>} Progress data keyed by task ID
 */
async function calculateTaskProgressData(dateStr, tasks) {
  const progressData = {};
  
  for (const task of tasks) {
    const allLogs = await getTimeLogs(task.id);
    const totalHours = allLogs.reduce((sum, log) => sum + log.hours, 0);
    
    const todayLogs = await getTimeLogs(task.id, dateStr, dateStr);
    const todayHours = todayLogs.reduce((sum, log) => sum + log.hours, 0);
    
    progressData[task.id] = { totalHours, todayHours };
  }
  
  return progressData;
}

/**
 * Generate task badges HTML
 * @param {object} task - Task object
 * @returns {Promise<string>} HTML string
 */
async function generateTaskBadgesHTML(task) {
  const badges = [];
  
  if (task.projectId) {
    const projectInfo = await getProjectDisplayInfo(task.projectId);
    if (projectInfo) {
      badges.push(`
        <span class="badge badge-project" style="background-color: ${projectInfo.color || '#6c757d'}">
          ${projectInfo.name}
        </span>
      `);
    }
  }
  
  if (task.phaseKey) {
    const phaseInfo = await getPhaseDisplayInfo(task.phaseKey);
    if (phaseInfo) {
      badges.push(`
        <span class="badge badge-phase" style="background-color: ${phaseInfo.color || '#6c757d'}">
          ${phaseInfo.name}
        </span>
      `);
    }
  }
  
  if (badges.length > 0) {
    return `<div class="card-badges">${badges.join('')}</div>`;
  }
  
  return '';
}

// ============================================================
// CALENDAR CONTROLS
// ============================================================

// ============================================================
// INITIALIZATION GUARDS
// ============================================================

let isCalendarControlsInitialized = false;

/**
 * Initialize calendar navigation and filter controls
 */
function initializeCalendarControls() {
  // Prevent duplicate event listeners
  if (isCalendarControlsInitialized) {
    console.log('⚠️ Calendar controls already initialized, skipping');
    return;
  }
  
  console.log('🔧 Initializing calendar controls...');
  
  const prevButton = document.getElementById('calendarPrevMonth');
  const nextButton = document.getElementById('calendarNextMonth');
  const todayButton = document.getElementById('calendarTodayButton');
  const statusFilter = document.getElementById('calendarStatusFilter');
  const urgencyFilter = document.getElementById('calendarUrgencyFilter');
  const clearFiltersBtn = document.getElementById('clearCalendarFilters');
  
  console.log('Calendar buttons found:', { 
    prev: !!prevButton, 
    next: !!nextButton, 
    today: !!todayButton 
  });
  
  if (prevButton) {
    prevButton.addEventListener('click', () => {
      console.log('📅 Previous month clicked, current offset:', getMonthOffset());
      setMonthOffset(getMonthOffset() - 1);
      console.log('📅 New offset:', getMonthOffset());
      if (window.renderTasks) {
        window.renderTasks('month');
      }
    });
  }
  
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      console.log('📅 Next month clicked, current offset:', getMonthOffset());
      setMonthOffset(getMonthOffset() + 1);
      console.log('📅 New offset:', getMonthOffset());
      console.log('window.renderTasks exists?', !!window.renderTasks);
      if (window.renderTasks) {
        console.log('Calling window.renderTasks("month")');
        window.renderTasks('month');
      } else {
        console.error('❌ window.renderTasks is not defined!');
      }
    });
  }
  
  if (todayButton) {
    todayButton.addEventListener('click', () => {
      console.log('📅 Today clicked, resetting offset to 0');
      setMonthOffset(0);
      if (window.renderTasks) {
        window.renderTasks('month');
      }
    });
  }
  
  // Filter handlers
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      localStorage.setItem('calendarStatusFilter', statusFilter.value);
      updateFilterStyling(statusFilter);
      
      // Update global filters
      const currentFilters = getGlobalFilters();
      setGlobalFilters({ ...currentFilters, status: statusFilter.value || null });
      
      if (window.renderTasks) {
        window.renderTasks('month');
      }
    });
  }
  
  if (urgencyFilter) {
    urgencyFilter.addEventListener('change', () => {
      localStorage.setItem('calendarUrgencyFilter', urgencyFilter.value);
      updateFilterStyling(urgencyFilter);
      
      // Update global filters
      const currentFilters = getGlobalFilters();
      setGlobalFilters({ ...currentFilters, urgency: urgencyFilter.value || null });
      
      if (window.renderTasks) {
        window.renderTasks('month');
      }
    });
  }
  
  // Clear filters
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (statusFilter) {
        statusFilter.value = '';
        localStorage.removeItem('calendarStatusFilter');
        updateFilterStyling(statusFilter);
      }
      if (urgencyFilter) {
        urgencyFilter.value = '';
        localStorage.removeItem('calendarUrgencyFilter');
        updateFilterStyling(urgencyFilter);
      }
      
      // Clear global filters for status and urgency
      const currentFilters = getGlobalFilters();
      setGlobalFilters({ ...currentFilters, status: null, urgency: null });
      
      if (window.renderTasks) {
        window.renderTasks('month');
      }
    });
  }
  
  isCalendarControlsInitialized = true;
  console.log('✅ Calendar controls initialized successfully');
}

/**
 * Update filter styling to show active state
 * @param {HTMLElement} filterElement - Filter select element
 */
function updateFilterStyling(filterElement) {
  if (filterElement.value !== '') {
    filterElement.style.borderColor = '#007bff';
    filterElement.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
  } else {
    filterElement.style.borderColor = '';
    filterElement.style.backgroundColor = '';
  }
}

/**
 * Restore saved calendar filter values
 */
function restoreCalendarFilters() {
  const statusFilter = document.getElementById('calendarStatusFilter');
  const urgencyFilter = document.getElementById('calendarUrgencyFilter');
  
  if (statusFilter) {
    const savedStatus = localStorage.getItem('calendarStatusFilter');
    if (savedStatus) {
      statusFilter.value = savedStatus;
      updateFilterStyling(statusFilter);
    }
  }
  
  if (urgencyFilter) {
    const savedUrgency = localStorage.getItem('calendarUrgencyFilter');
    if (savedUrgency) {
      urgencyFilter.value = savedUrgency;
      updateFilterStyling(urgencyFilter);
    }
  }
}

// ============================================================
// MONTHLY SUMMARY
// ============================================================

/**
 * Update monthly summary statistics
 * @param {object} dailyStats - Daily statistics
 */
function updateMonthlySummary(dailyStats) {
  const taskIds = new Set();
  let totalHours = 0;
  let workDays = 0;
  
  for (const dateStr in dailyStats) {
    const dayStats = dailyStats[dateStr];
    
    // Count unique tasks
    dayStats.tasks.forEach(task => taskIds.add(task.id));
    
    // Sum hours
    totalHours += dayStats.totalHours;
    
    // Count work days (days with hours logged or work sessions)
    if (dayStats.totalHours > 0 || dayStats.workSession) {
      workDays++;
    }
  }
  
  document.getElementById('monthTotalTasks').textContent = taskIds.size;
  document.getElementById('monthTotalHours').textContent = `${totalHours.toFixed(1)}h`;
  document.getElementById('monthWorkDays').textContent = workDays;
}

// ============================================================
// WORK SESSION MODAL
// ============================================================

/**
 * Open work session edit modal
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 */
async function openWorkSessionModal(dateStr) {
  const session = await getWorkSession(dateStr);
  
  // Create modal HTML if it doesn't exist
  let modal = document.getElementById('workSessionModal');
  if (!modal) {
    const modalHTML = `
      <div class="modal fade" id="workSessionModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="fas fa-briefcase me-2"></i>
                <span id="workSessionModalTitle">Edit Work Session</span>
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="workSessionForm">
                <div class="mb-3">
                  <label for="workSessionDate" class="form-label">Date</label>
                  <input type="date" class="form-control" id="workSessionDate" required>
                </div>
                
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label for="workSessionPunchIn" class="form-label">
                      <i class="fas fa-sign-in-alt text-success me-1"></i>
                      Punch In Time
                    </label>
                    <input type="time" class="form-control" id="workSessionPunchIn" required>
                  </div>
                  
                  <div class="col-md-6 mb-3">
                    <label for="workSessionPunchOut" class="form-label">
                      <i class="fas fa-sign-out-alt text-danger me-1"></i>
                      Punch Out Time
                    </label>
                    <input type="time" class="form-control" id="workSessionPunchOut">
                    <div class="form-text">Leave empty if still in progress</div>
                  </div>
                </div>
                
                <div class="alert alert-info" id="workSessionDuration">
                  <i class="fas fa-clock me-2"></i>
                  <span id="durationDisplay">Duration will be calculated</span>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="saveWorkSessionBtn">
                <i class="fas fa-save me-1"></i>Save
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    modal = document.getElementById('workSessionModal');
  }
  
  // Populate form
  document.getElementById('workSessionDate').value = dateStr;
  
  if (session) {
    document.getElementById('workSessionModalTitle').textContent = 'Edit Work Session';
    
    // Convert ISO timestamps to date and time
    if (session.punchIn) {
      const punchInDate = new Date(session.punchIn);
      document.getElementById('workSessionPunchIn').value = punchInDate.toTimeString().slice(0, 5);
    }
    
    if (session.punchOut) {
      const punchOutDate = new Date(session.punchOut);
      document.getElementById('workSessionPunchOut').value = punchOutDate.toTimeString().slice(0, 5);
    } else {
      document.getElementById('workSessionPunchOut').value = '';
    }
  } else {
    document.getElementById('workSessionModalTitle').textContent = 'Add Work Session';
    document.getElementById('workSessionPunchIn').value = '09:00';
    document.getElementById('workSessionPunchOut').value = '';
  }
  
  // Calculate duration on time change
  const updateDuration = () => {
    const punchIn = document.getElementById('workSessionPunchIn').value;
    const punchOut = document.getElementById('workSessionPunchOut').value;
    
    if (punchIn && punchOut) {
      const date = document.getElementById('workSessionDate').value;
      const punchInDate = new Date(`${date}T${punchIn}`);
      const punchOutDate = new Date(`${date}T${punchOut}`);
      
      const diff = punchOutDate - punchInDate;
      if (diff > 0) {
        const hours = (diff / (1000 * 60 * 60)).toFixed(2);
        document.getElementById('durationDisplay').textContent = `Duration: ${hours} hours`;
      } else {
        document.getElementById('durationDisplay').textContent = 'Invalid: Punch out must be after punch in';
      }
    } else if (punchIn) {
      document.getElementById('durationDisplay').textContent = 'In Progress (no punch out time)';
    } else {
      document.getElementById('durationDisplay').textContent = 'Duration will be calculated';
    }
  };
  
  document.getElementById('workSessionPunchIn').addEventListener('change', updateDuration);
  document.getElementById('workSessionPunchOut').addEventListener('change', updateDuration);
  updateDuration();
  
  // Save button handler
  const saveBtn = document.getElementById('saveWorkSessionBtn');
  const newHandler = async () => {
    const date = document.getElementById('workSessionDate').value;
    const punchInTime = document.getElementById('workSessionPunchIn').value;
    const punchOutTime = document.getElementById('workSessionPunchOut').value;
    
    if (!date || !punchInTime) {
      showToast('Date and punch in time are required', 'error');
      return;
    }
    
    // Build ISO timestamps
    const punchIn = `${date}T${punchInTime}:00`;
    const punchOut = punchOutTime ? `${date}T${punchOutTime}:00` : null;
    
    const sessionData = {
      id: session?.id,
      date: date,
      punchIn: punchIn,
      punchOut: punchOut,
      activities: session?.activities || [],
      breaks: session?.breaks || []
    };
    
    const saved = await saveWorkSession(sessionData);
    if (saved) {
      showToast('Work session saved', 'success');
      
      // Close modal
      const modalInstance = bootstrap.Modal.getInstance(modal);
      modalInstance.hide();
      
      // Refresh day details if viewing that date
      await displayDayDetails(dateStr, {});
      
      // Re-render calendar to update hours
      if (window.renderTasks) {
        window.renderTasks('month');
      }
    }
  };
  
  // Remove old listeners and add new one
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  document.getElementById('saveWorkSessionBtn').addEventListener('click', newHandler);
  
  // Show modal
  const modalInstance = new bootstrap.Modal(modal);
  modalInstance.show();
}

// ============================================================
// PUBLIC API
// ============================================================

export {
  initializeCalendarControls,
  initializeCalendarInteractions,
  updateMonthlySummary,
  displayDayDetails,
  displayWeekDetails
};
