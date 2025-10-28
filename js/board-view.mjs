/**
 * board-view.mjs
 * Kanban Board View - Visual task board with drag-and-drop
 * 
 * Responsibilities:
 * - Render Kanban board with 4 lanes (Backlog/InProgress/Blocked/Done)
 * - Display task cards with status, urgency, badges, progress
 * - Implement drag-and-drop for status transitions
 * - Show task detail pane in split-view
 * - Handle task selection and quick time logging
 * 
 * Dependencies: task-service, timelog-service, project-service, ui-utils, state-service
 */

import { getTasks, saveTask } from './task-service.mjs';
import { getTimeLogs } from './timelog-service.mjs';
import { getProjectDisplayInfo, getPhaseDisplayInfo } from './project-service.mjs';
import { getStatusColor, showToast } from './ui-utils.mjs';
import { getGlobalFilters } from './state-service.mjs';

// ============================================================
// BOARD VIEW RENDERING
// ============================================================

/**
 * Render the Kanban Board view
 * @param {HTMLElement} container - Container element to render into
 * @param {object} filters - Active filters { status, urgency, project, phase }
 * @param {string} timeFilter - Time period filter ('today', 'thisWeek', 'nextWeek', 'all')
 * @returns {Promise<void>}
 */
export async function renderBoardView(container, filters = {}, timeFilter = 'all') {
  console.log('Rendering Kanban Board view');
  
  // Get all tasks (board shows all statuses)
  let tasks = await getTasks({}, true);
  
  // Apply filters
  if (filters.project) {
    tasks = tasks.filter(task => task.projectId && task.projectId.toString() === filters.project);
  }
  if (filters.phase) {
    tasks = tasks.filter(task => task.phaseKey === filters.phase);
  }
  
  // Create board split-pane container
  const splitView = document.createElement('div');
  splitView.className = 'board-split-view';
  
  // Create left pane for kanban board
  const kanbanPane = document.createElement('div');
  kanbanPane.className = 'board-kanban-pane';
  
  // Create Kanban board
  const board = document.createElement('div');
  board.className = 'kanban-board';
  
  // Define lanes with their corresponding statuses
  const lanes = [
    {
      id: 'backlog',
      title: 'Backlog',
      statuses: ['Ready', 'Estimated'],
      className: 'lane-backlog'
    },
    {
      id: 'inprogress',
      title: 'In Progress',
      statuses: ['InProgress'],
      className: 'lane-inprogress'
    },
    {
      id: 'blocked',
      title: 'Blocked / Backburner',
      statuses: ['Blocked', 'Backburner', 'OnHold'],
      className: 'lane-blocked'
    },
    {
      id: 'done',
      title: 'Done',
      statuses: ['Completed', 'Abandoned', 'Archived'],
      className: 'lane-done'
    }
  ];
  
  // Build each lane
  for (const lane of lanes) {
    let laneTasks = tasks.filter(task => lane.statuses.includes(task.status));
    
    // Apply time-period filtering for Done lane based on completion dates
    if (lane.id === 'done' && timeFilter !== 'all') {
      laneTasks = laneTasks.filter(task => {
        const completionDate = getTaskCompletionDate(task);
        if (!completionDate) return false;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (timeFilter === 'today') {
          const todayStr = today.toISOString().split('T')[0];
          return completionDate === todayStr;
        } else if (timeFilter === 'thisWeek') {
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          
          const startStr = weekStart.toISOString().split('T')[0];
          const endStr = weekEnd.toISOString().split('T')[0];
          return completionDate >= startStr && completionDate <= endStr;
        } else if (timeFilter === 'nextWeek') {
          const nextWeekStart = new Date(today);
          nextWeekStart.setDate(today.getDate() - today.getDay() + 7);
          const nextWeekEnd = new Date(nextWeekStart);
          nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
          
          const startStr = nextWeekStart.toISOString().split('T')[0];
          const endStr = nextWeekEnd.toISOString().split('T')[0];
          return completionDate >= startStr && completionDate <= endStr;
        }
        
        return true;
      });
    }
    
    const laneElement = document.createElement('div');
    laneElement.className = `kanban-lane ${lane.className}`;
    laneElement.dataset.laneId = lane.id;
    
    // Create lane header with counter
    laneElement.innerHTML = `
      <div class="kanban-lane-header">
        <h5>${lane.title}</h5>
        <span class="lane-counter">${laneTasks.length}</span>
      </div>
      <div class="kanban-lane-content" data-lane="${lane.id}">
        <div class="drop-zone"></div>
      </div>
    `;
    
    const laneContent = laneElement.querySelector('.kanban-lane-content');
    
    // Create cards for each task
    for (const task of laneTasks) {
      const card = await createTaskCard(task);
      laneContent.appendChild(card);
    }
    
    board.appendChild(laneElement);
  }
  
  // Add board to left pane
  kanbanPane.appendChild(board);
  
  // Create right pane for task details
  const detailPane = document.createElement('div');
  detailPane.className = 'board-task-detail-pane';
  detailPane.id = 'boardTaskDetailPane';
  detailPane.innerHTML = `
    <div class="board-task-empty-state">
      <i class="fas fa-tasks fa-2x mb-3"></i>
      <h5>Select a task</h5>
      <p>Click on any task card to view detailed information</p>
    </div>
  `;
  
  // Assemble split view
  splitView.appendChild(kanbanPane);
  splitView.appendChild(detailPane);
  container.innerHTML = '';
  container.appendChild(splitView);
  
  // Initialize interactions after DOM is ready
  setTimeout(() => {
    initializeBoardInteractions();
  }, 100);
}

// ============================================================
// TASK CARD CREATION
// ============================================================

/**
 * Create a task card element
 * @param {object} task - Task object
 * @returns {Promise<HTMLElement>} Card element
 */
async function createTaskCard(task) {
  const logs = await getTimeLogs(task.id);
  const taskHours = logs.reduce((sum, log) => sum + log.hours, 0);
  
  // Calculate progress
  const estimate = task.estimate || 0;
  const progress = estimate > 0 ? Math.min((taskHours / estimate) * 100, 100) : 0;
  
  // Check if overdue
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = task.dueOn < today && !['Completed', 'Abandoned', 'Archived'].includes(task.status);
  const isDueSoon = !isOverdue && task.dueOn <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const card = document.createElement('div');
  card.className = `kanban-card urgency-${task.urgency.toLowerCase()}`;
  card.dataset.taskId = task.id;
  card.dataset.taskStatus = task.status;
  card.draggable = true;
  
  if (isOverdue) {
    card.classList.add('overdue');
  }
  
  // Generate project/phase badges
  const badgesHTML = await generateTaskBadgesHTML(task);
  
  card.innerHTML = `
    <div class="card-header">
      <div class="card-title" data-field="title" data-task-id="${task.id}">${task.title}</div>
      <button class="card-edit-btn btn btn-outline-info work-task-btn" data-task-id="${task.id}" title="Edit task">
        <i class="fas fa-edit"></i>
      </button>
    </div>
    ${badgesHTML}
    <div class="card-meta">
      <div class="card-due-date ${isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : ''}">
        <i class="fas fa-calendar"></i>
        ${new Date(task.dueOn).toLocaleDateString()}
      </div>
      <div class="card-meta-right">
        <div class="card-status-indicator status-${task.status.toLowerCase()}" title="Status: ${task.status}">
          <i class="fas fa-${getStatusIcon(task.status)}"></i>
          <span>${task.status}</span>
        </div>
        ${task.notes && task.notes.trim() ? `
          <div class="card-notes-indicator" title="Has notes">
            <i class="fas fa-sticky-note"></i>
          </div>
        ` : ''}
      </div>
    </div>
    <div class="card-time-info">
      <div class="card-hours">
        <i class="fas fa-clock"></i>
        ${taskHours.toFixed(1)}h logged
      </div>
      <div class="card-hours">
        <i class="fas fa-hourglass-half"></i>
        ${(task.remainingHours || 0).toFixed(1)}h left
      </div>
    </div>
    ${estimate > 0 ? `
      <div class="progress-bar-container">
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width: ${progress}%"></div>
        </div>
        <div class="progress-text">${taskHours.toFixed(1)}h / ${estimate}h (${Math.round(progress)}%)</div>
      </div>
    ` : ''}
    <div class="card-quick-actions">
      <div class="quick-time-buttons">
        <button class="quick-action-btn btn btn-outline-success quick-time-btn" data-task-id="${task.id}" data-hours="0.25">15m</button>
        <button class="quick-action-btn btn btn-outline-success quick-time-btn" data-task-id="${task.id}" data-hours="0.5">30m</button>
        <button class="quick-action-btn btn btn-outline-success quick-time-btn" data-task-id="${task.id}" data-hours="1">1h</button>
        <button class="quick-action-btn btn btn-outline-primary custom-time-btn" data-task-id="${task.id}">+</button>
      </div>
    </div>
  `;
  
  return card;
}

/**
 * Generate project/phase badge HTML for a task
 * @param {object} task - Task object
 * @returns {Promise<string>} HTML string for badges
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

/**
 * Get icon name for task status
 * @param {string} status - Task status
 * @returns {string} Font Awesome icon name
 */
function getStatusIcon(status) {
  const icons = {
    'Ready': 'flag',
    'Estimated': 'calculator',
    'InProgress': 'spinner',
    'Completed': 'check-circle',
    'Blocked': 'ban',
    'Backburner': 'fire',
    'OnHold': 'pause-circle',
    'Abandoned': 'times-circle',
    'Archived': 'archive'
  };
  return icons[status] || 'circle';
}

/**
 * Get task completion date (completedOn or lastModified for completed tasks)
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
// BOARD INTERACTIONS
// ============================================================

/**
 * Initialize all board interactions (drag-drop, task selection, quick actions)
 */
function initializeBoardInteractions() {
  initializeDragAndDrop();
  initializeBoardTaskSelection();
  initializeQuickTimeButtons();
}

/**
 * Initialize drag-and-drop for task cards
 * Uses event delegation to avoid duplicate listeners
 */
function initializeDragAndDrop() {
  const taskList = document.getElementById('taskList');
  if (!taskList) return;
  
  // Remove any existing listeners by using a flag
  if (taskList.dataset.dragInitialized === 'true') {
    return; // Already initialized
  }
  taskList.dataset.dragInitialized = 'true';
  
  // Use event delegation for all drag events
  taskList.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.taskId);
    card.classList.add('dragging');
  });
  
  taskList.addEventListener('dragend', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    card.classList.remove('dragging');
  });
  
  taskList.addEventListener('dragover', (e) => {
    const lane = e.target.closest('.kanban-lane-content');
    if (!lane) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lane.classList.add('drag-over');
  });
  
  taskList.addEventListener('dragleave', (e) => {
    const lane = e.target.closest('.kanban-lane-content');
    if (!lane) return;
    
    // Only remove if we're actually leaving the lane
    if (!lane.contains(e.relatedTarget)) {
      lane.classList.remove('drag-over');
    }
  });
  
  taskList.addEventListener('drop', async (e) => {
    const lane = e.target.closest('.kanban-lane-content');
    if (!lane) return;
    
    e.preventDefault();
    lane.classList.remove('drag-over');
    
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    const newLane = lane.dataset.lane;
    
    await handleTaskDrop(taskId, newLane);
  });
}

/**
 * Handle task card drop in a new lane
 * @param {number} taskId - Task ID
 * @param {string} laneId - Target lane ID
 */
async function handleTaskDrop(taskId, laneId) {
  // Map lane IDs to statuses
  const laneStatusMap = {
    'backlog': 'Ready',
    'inprogress': 'InProgress',
    'blocked': 'Blocked',
    'done': 'Completed'
  };
  
  const newStatus = laneStatusMap[laneId];
  if (!newStatus) return;
  
  try {
    // Get the task
    const tasks = await getTasks({}, true);
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) {
      showToast('Task not found', 'error');
      return;
    }
    
    // Update task status
    task.status = newStatus;
    const success = await saveTask(task, true);
    
    if (success) {
      showToast(`Task moved to ${newStatus}`, 'success');
      
      // Re-render the board to show the updated task in the new lane
      const container = document.getElementById('taskList');
      if (container) {
        const filters = getGlobalFilters();
        await renderBoardView(container, filters);
        // No need to re-initialize drag and drop - using event delegation
      }
    }
    // Note: If save fails, service layer shows validation error, so no need for generic error toast
  } catch (err) {
    console.error('Error updating task status:', err);
    showToast('Failed to update task status', 'error');
  }
}

/**
 * Initialize task card selection for detail pane
 */
function initializeBoardTaskSelection() {
  const cards = document.querySelectorAll('.kanban-card');
  
  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking on buttons or dragging
      if (e.target.closest('button') || card.classList.contains('dragging')) {
        return;
      }
      
      // Remove previous selection
      cards.forEach(c => c.classList.remove('selected'));
      
      // Select this card
      card.classList.add('selected');
      
      // Load task details in right pane
      const taskId = parseInt(card.dataset.taskId);
      loadTaskDetailPane(taskId);
    });
  });
}

/**
 * Load task details into the detail pane
 * @param {number} taskId - Task ID
 */
async function loadTaskDetailPane(taskId) {
  const detailPane = document.getElementById('boardTaskDetailPane');
  if (!detailPane) return;
  
  // Show loading state
  detailPane.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
  
  try {
    // Get all tasks and find the one we need
    const allTasks = await getTasks({}, true);
    const task = allTasks.find(t => t.id === taskId);
    
    if (!task) {
      detailPane.innerHTML = `
        <div class="board-task-empty-state">
          <i class="fas fa-exclamation-circle fa-3x text-muted mb-3"></i>
          <p>Task not found (ID: ${taskId})</p>
        </div>
      `;
      return;
    }
    
    // Get time logs for this task
    const timeLogs = await getTimeLogs(taskId);
    const totalHours = timeLogs.reduce((sum, log) => sum + log.hours, 0);
    const progressPercent = task.estimate ? Math.min((totalHours / task.estimate) * 100, 100) : 0;
    
    // Get project and phase info
    let projectBadge = '';
    if (task.projectId) {
      const projectInfo = await getProjectDisplayInfo(task.projectId);
      if (projectInfo) {
        projectBadge = `<span class="badge" style="background-color: ${projectInfo.color || '#6c757d'}">${projectInfo.name}</span>`;
      }
    }
    
    let phaseBadge = '';
    if (task.phaseKey) {
      const phaseInfo = await getPhaseDisplayInfo(task.phaseKey);
      if (phaseInfo) {
        phaseBadge = `<span class="badge" style="background-color: ${phaseInfo.color || '#6c757d'}">${phaseInfo.name}</span>`;
      }
    }
    
    // Build status history HTML
    const statusHistoryHtml = task.statusHistory ? 
      task.statusHistory.slice(-3).reverse().map(entry => `
        <div class="status-history-item mb-2">
          <span class="badge bg-${getStatusColor(entry.status)}">${entry.status}</span>
          <small class="text-muted ms-2">${new Date(entry.timestamp).toLocaleDateString()}</small>
        </div>
      `).join('') : '<p class="text-muted">No status history</p>';
    
    // Recent time logs
    const recentLogs = timeLogs
      .sort((a, b) => b.dateLogged.localeCompare(a.dateLogged))
      .slice(0, 5);
    
    const recentLogsHtml = recentLogs.length > 0 ? recentLogs.map(log => `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span>${new Date(log.dateLogged).toLocaleDateString()}</span>
        <span class="fw-bold">${log.hours.toFixed(1)}h</span>
      </div>
    `).join('') : '<p class="text-muted">No time logged yet</p>';
    
    // Render detail pane
    detailPane.innerHTML = `
      <div class="board-task-detail-header">
        <div class="board-task-title">${task.title}</div>
        <div class="board-task-status-badges mt-2">
          <span class="badge bg-${getStatusColor(task.status)}">${task.status}</span>
          <span class="badge bg-warning">${task.urgency}</span>
          ${projectBadge}
          ${phaseBadge}
        </div>
      </div>
      
      <div class="board-task-section">
        <div class="board-task-section-title">Key Metrics</div>
        <div class="board-task-metrics">
          <div class="board-task-metric">
            <div class="board-task-metric-label">Due Date</div>
            <div class="board-task-metric-value">${task.dueOn ? new Date(task.dueOn).toLocaleDateString() : 'Not set'}</div>
          </div>
          <div class="board-task-metric">
            <div class="board-task-metric-label">Hours Logged</div>
            <div class="board-task-metric-value">${totalHours.toFixed(1)}h</div>
          </div>
          <div class="board-task-metric">
            <div class="board-task-metric-label">Estimate</div>
            <div class="board-task-metric-value">${task.estimate || 'None'}${task.estimate ? 'h' : ''}</div>
          </div>
          <div class="board-task-metric">
            <div class="board-task-metric-label">Remaining</div>
            <div class="board-task-metric-value">${task.remainingHours !== null && task.remainingHours !== undefined ? task.remainingHours.toFixed(1) + 'h' : 'N/A'}</div>
          </div>
          <div class="board-task-metric">
            <div class="board-task-metric-label">Progress</div>
            <div class="board-task-metric-value">${progressPercent.toFixed(0)}%</div>
          </div>
        </div>
        ${task.estimate ? `
          <div class="progress mt-2" style="height: 8px;">
            <div class="progress-bar bg-primary" style="width: ${progressPercent}%"></div>
          </div>
        ` : ''}
      </div>
      
      ${task.description ? `
        <div class="board-task-section">
          <div class="board-task-section-title">Description</div>
          <div class="board-task-description">${task.description}</div>
        </div>
      ` : ''}
      
      ${task.notes ? `
        <div class="board-task-section">
          <div class="board-task-section-title">Notes</div>
          <div class="board-task-description">${task.notes}</div>
        </div>
      ` : ''}
      
      <div class="board-task-section">
        <div class="board-task-section-title">Recent Status Changes</div>
        ${statusHistoryHtml}
      </div>
      
      <div class="board-task-section">
        <div class="board-task-section-title">Recent Time Logs</div>
        ${recentLogsHtml}
      </div>
      
      <div class="board-task-section">
        <button class="btn btn-primary w-100 work-task-btn" data-task-id="${task.id}">
          <i class="fas fa-edit me-2"></i>Edit in Work View
        </button>
      </div>
    `;
  } catch (err) {
    console.error('Error loading task details:', err);
    detailPane.innerHTML = `
      <div class="board-task-empty-state">
        <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
        <p>Error loading task details</p>
        <small class="text-muted">${err.message}</small>
      </div>
    `;
  }
}

/**
 * Initialize quick time logging buttons
 */
function initializeQuickTimeButtons() {
  // Delegate to global handlers (these need to be imported or exposed)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.quick-time-btn')) {
      const btn = e.target.closest('.quick-time-btn');
      const taskId = parseInt(btn.dataset.taskId);
      const hours = parseFloat(btn.dataset.hours);
      
      if (window.logQuickTime) {
        window.logQuickTime(taskId, hours);
      }
    }
    
    if (e.target.closest('.custom-time-btn')) {
      const btn = e.target.closest('.custom-time-btn');
      const taskId = parseInt(btn.dataset.taskId);
      
      if (window.showCustomTimeModal) {
        window.showCustomTimeModal(taskId);
      }
    }
  });
}

// ============================================================
// BOARD SUMMARY STATS
// ============================================================

/**
 * Generate board summary statistics
 * @param {Array} tasks - All tasks
 * @param {Array} timeLogs - All time logs
 * @returns {object} Summary statistics
 */
export function generateBoardSummary(tasks, timeLogs) {
  const totalHours = timeLogs.reduce((sum, log) => sum + log.hours, 0);
  
  return {
    totalTasks: tasks.length,
    backlogTasks: tasks.filter(t => ['Ready', 'Estimated'].includes(t.status)).length,
    inProgressTasks: tasks.filter(t => t.status === 'InProgress').length,
    blockedTasks: tasks.filter(t => ['Blocked', 'OnHold', 'Backburner'].includes(t.status)).length,
    completedTasks: tasks.filter(t => t.status === 'Completed').length,
    overdueTasks: tasks.filter(t => 
      t.dueOn < new Date().toISOString().split('T')[0] && 
      !['Completed', 'Abandoned', 'Archived'].includes(t.status)
    ).length,
    totalHours: totalHours.toFixed(1)
  };
}

/**
 * Render board summary stats as cards
 * @param {object} stats - Summary statistics
 * @returns {string} HTML string
 */
export function renderBoardSummaryCards(stats) {
  return `
    <div class="row mb-3">
      <div class="col-md-2">
        <div class="card text-center border-0" style="background: linear-gradient(135deg, #6c757d, #495057); color: white;">
          <div class="card-body py-2">
            <h6 class="mb-1">Total Tasks</h6>
            <h4 class="mb-0">${stats.totalTasks}</h4>
          </div>
        </div>
      </div>
      <div class="col-md-2">
        <div class="card text-center border-0" style="background: linear-gradient(135deg, #007bff, #0056b3); color: white;">
          <div class="card-body py-2">
            <h6 class="mb-1">In Progress</h6>
            <h4 class="mb-0">${stats.inProgressTasks}</h4>
          </div>
        </div>
      </div>
      <div class="col-md-2">
        <div class="card text-center border-0" style="background: linear-gradient(135deg, #ffc107, #e0a800); color: white;">
          <div class="card-body py-2">
            <h6 class="mb-1">Blocked</h6>
            <h4 class="mb-0">${stats.blockedTasks}</h4>
          </div>
        </div>
      </div>
      <div class="col-md-2">
        <div class="card text-center border-0" style="background: linear-gradient(135deg, #28a745, #1e7e34); color: white;">
          <div class="card-body py-2">
            <h6 class="mb-1">Completed</h6>
            <h4 class="mb-0">${stats.completedTasks}</h4>
          </div>
        </div>
      </div>
      <div class="col-md-2">
        <div class="card text-center border-0" style="background: linear-gradient(135deg, #dc3545, #c82333); color: white;">
          <div class="card-body py-2">
            <h6 class="mb-1">Overdue</h6>
            <h4 class="mb-0">${stats.overdueTasks}</h4>
          </div>
        </div>
      </div>
      <div class="col-md-2">
        <div class="card text-center border-0" style="background: linear-gradient(135deg, #17a2b8, #138496); color: white;">
          <div class="card-body py-2">
            <h6 class="mb-1">Total Hours</h6>
            <h4 class="mb-0">${stats.totalHours}h</h4>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PUBLIC API
// ============================================================

export {
  initializeBoardInteractions,
  initializeDragAndDrop,
  initializeBoardTaskSelection,
  createTaskCard,
  generateTaskBadgesHTML
};
