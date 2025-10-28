/**
 * today-view.mjs
 * Today Dashboard View - Today's tasks, todos, and accomplishments
 * 
 * Responsibilities:
 * - Render Today dashboard layout
 * - Display quick todos with inline add form
 * - Display daily accomplishments with inline add form
 * - Show work session status summary
 * - Display task overview with time filters (today/this week/next week)
 * - Initialize all event handlers for today view
 * 
 * Dependencies: All service modules, state-service.mjs, ui-utils.mjs
 */

import { getTasks } from './task-service.mjs';
import { getTodos, saveTodo, toggleTodo as toggleTodoService, deleteTodo as deleteTodoService } from './todo-service.mjs';
import { getAccomplishments, saveAccomplishment, deleteAccomplishment as deleteAccomplishmentService } from './accomplishment-service.mjs';
import { getWorkSession } from './work-session-service.mjs';
import { getAllTimeLogs } from './timelog-service.mjs';
import { getTodayISO, showToast } from './ui-utils.mjs';

// ============================================================
// TODAY VIEW RENDERING
// ============================================================

/**
 * Render the Today dashboard view
 * @param {HTMLElement} container - Container element to render into
 * @returns {Promise<void>}
 */
export async function renderTodayView(container) {
  console.log('Rendering Today dashboard view');
  
  const todayHTML = `
    <div class="today-container">
      <div class="row g-4">
        <!-- Quick Todos Column -->
        <div class="col-lg-6">
          <div class="today-card">
            <div class="today-card-header">
              <div class="d-flex justify-content-between align-items-center w-100">
                <div class="d-flex align-items-center">
                  <i class="fas fa-tasks me-2"></i>
                  <h5 class="mb-0">Quick Todos</h5>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="showCompletedTodos" onchange="window.toggleCompletedTodos()">
                  <label class="form-check-label small text-muted" for="showCompletedTodos">
                    Include completed
                  </label>
                </div>
              </div>
            </div>
            <div class="today-card-body">
              <!-- Inline Todo Form -->
              <div class="todo-form mb-3">
                <div class="input-group mb-2">
                  <input type="text" id="todoTitleInput" class="form-control" placeholder="Add a todo..." maxlength="100">
                  <button class="btn btn-primary" type="button" id="addTodoBtn">
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
                <div id="todoDetailsInput" class="todo-details" style="display: none;">
                  <textarea class="form-control" placeholder="Optional details..." rows="2" maxlength="300"></textarea>
                  <div class="mt-2 d-flex justify-content-end gap-2">
                    <button class="btn btn-sm btn-outline-secondary" id="cancelTodoDetailsBtn">Cancel</button>
                    <button class="btn btn-sm btn-success" id="submitTodoWithDetailsBtn">Add Todo</button>
                  </div>
                </div>
                <small class="text-muted">Press Enter to add quickly, or click + for details</small>
              </div>
              
              <div id="todos-list" class="todos-list">
                <!-- Todos will be loaded here -->
              </div>
            </div>
          </div>
        </div>
        
        <!-- Daily Accomplishments Column -->
        <div class="col-lg-6">
          <div class="today-card">
            <div class="today-card-header">
              <i class="fas fa-trophy me-2"></i>
              <h5 class="mb-0">Daily Accomplishments</h5>
            </div>
            <div class="today-card-body">
              <!-- Inline Accomplishment Form -->
              <div class="accomplishment-form mb-3">
                <div class="input-group mb-2">
                  <input type="text" id="accomplishmentTitleInput" class="form-control" placeholder="What did you accomplish?" maxlength="100">
                  <button class="btn btn-success" type="button" id="addAccomplishmentBtn">
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
                <div id="accomplishmentDetailsInput" class="accomplishment-details" style="display: none;">
                  <textarea class="form-control" placeholder="Tell us more about this accomplishment..." rows="3" maxlength="500"></textarea>
                  <div class="mt-2 d-flex justify-content-end gap-2">
                    <button class="btn btn-sm btn-outline-secondary" id="cancelAccomplishmentDetailsBtn">Cancel</button>
                    <button class="btn btn-sm btn-warning" id="submitAccomplishmentWithDetailsBtn">Add Accomplishment</button>
                  </div>
                </div>
                <small class="text-muted">Press Enter to add quickly, or click + for details</small>
              </div>
              
              <div id="accomplishments-list" class="accomplishments-list">
                <!-- Accomplishments will be loaded here -->
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Work Session Status -->
      <div class="row mt-4">
        <div class="col-12">
          <div class="today-card" id="todayWorkSession">
            <div class="today-card-header">
              <i class="fas fa-clock me-2"></i>
              <h5 class="mb-0">Work Session</h5>
              <button class="btn btn-sm btn-outline-primary ms-auto" id="todayPunchBtn" onclick="document.getElementById('punchClockBtn').click()">
                <i class="fas fa-clock me-1"></i>
                <span id="todayPunchText">Punch In</span>
              </button>
            </div>
            <div class="today-card-body">
              <div class="row g-3 text-center" id="workSessionSummary">
                <div class="col-3">
                  <div class="metric-small">
                    <div class="metric-value" id="todayTotalHours">0h 0m</div>
                    <div class="metric-label">Total</div>
                  </div>
                </div>
                <div class="col-3">
                  <div class="metric-small">
                    <div class="metric-value" id="todayWorkHours">0h 0m</div>
                    <div class="metric-label">Work</div>
                  </div>
                </div>
                <div class="col-3">
                  <div class="metric-small">
                    <div class="metric-value" id="todayBreakHours">0h 0m</div>
                    <div class="metric-label">Breaks</div>
                  </div>
                </div>
                <div class="col-3">
                  <div class="metric-small">
                    <div class="metric-value" id="todayCurrentActivity">Not Started</div>
                    <div class="metric-label">Status</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Today's Task Overview -->
      <div class="row mt-4">
        <div class="col-12">
          <div class="today-card">
            <div class="today-card-header">
              <i class="fas fa-flag me-2"></i>
              <h5 class="mb-0">Task Overview</h5>
              <span class="badge bg-primary ms-auto" id="today-hours">0.0 hours logged</span>
            </div>
            <div class="today-card-body">
              <!-- Task Overview Filter Buttons -->
              <div class="task-overview-filters mb-3">
                <div class="btn-group" role="group" aria-label="Task time filters">
                  <button type="button" class="btn btn-outline-primary active" id="filterToday" data-filter="today">
                    <i class="fas fa-calendar-day me-1"></i>Today
                  </button>
                  <button type="button" class="btn btn-outline-primary" id="filterThisWeek" data-filter="thisWeek">
                    <i class="fas fa-calendar-week me-1"></i>This Week
                  </button>
                  <button type="button" class="btn btn-outline-primary" id="filterNextWeek" data-filter="nextWeek">
                    <i class="fas fa-calendar-alt me-1"></i>Next Week
                  </button>
                </div>
              </div>
              
              <div id="today-tasks" class="today-tasks">
                <!-- Tasks will be loaded here -->
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = todayHTML;
  
  // Initialize event handlers
  initializeTodayViewHandlers();
  
  // Load all data
  await loadTodayData();
}

// ============================================================
// DATA LOADING
// ============================================================

/**
 * Load all data for today view
 */
async function loadTodayData() {
  await Promise.all([
    loadTodosSection(),
    loadAccomplishmentsSection(),
    loadWorkSessionSummary(),
    loadTaskOverview('today')
  ]);
}

/**
 * Load todos section
 */
async function loadTodosSection() {
  const showCompleted = document.getElementById('showCompletedTodos')?.checked || false;
  const todos = await getTodos(showCompleted);
  
  const todosList = document.getElementById('todos-list');
  if (!todosList) return;
  
  if (todos.length === 0) {
    todosList.innerHTML = showCompleted 
      ? '<p class="text-muted text-center">No todos yet. Add one to get started!</p>'
      : '<p class="text-muted text-center">No active todos. Add one to get started!</p>';
    return;
  }
  
  todosList.innerHTML = todos.map(todo => `
    <div class="todo-item ${todo.completed ? 'completed' : ''}" data-todo-id="${todo.id}">
      <input type="checkbox" class="form-check-input todo-checkbox" 
             ${todo.completed ? 'checked' : ''} 
             data-todo-id="${todo.id}">
      <div class="todo-content">
        <div class="todo-title">${todo.title}</div>
        ${todo.content ? `<p class="todo-text">${todo.content}</p>` : ''}
        ${todo.completed && todo.completedAt ? 
          `<small class="text-muted">Completed: ${new Date(todo.completedAt).toLocaleDateString()}</small>` : 
          `<small class="text-muted">Created: ${new Date(todo.createdAt).toLocaleDateString()}</small>`
        }
      </div>
      ${showCompleted ? `
        <div class="todo-actions ms-2">
          <button class="btn btn-sm btn-outline-danger delete-todo-btn" data-todo-id="${todo.id}">
            <i class="fas fa-trash"></i>
          </button>
          <div class="delete-confirmation d-none">
            <span class="me-2">Delete this todo?</span>
            <button class="btn btn-danger btn-sm me-1 confirm-delete-todo-btn" data-todo-id="${todo.id}">
              <i class="fas fa-check me-1"></i>Yes
            </button>
            <button class="btn btn-outline-secondary btn-sm cancel-delete-todo-btn" data-todo-id="${todo.id}">
              <i class="fas fa-times me-1"></i>Cancel
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `).join('');
}

/**
 * Load accomplishments section
 */
async function loadAccomplishmentsSection() {
  const accomplishments = await getAccomplishments();
  
  const accomplishmentsList = document.getElementById('accomplishments-list');
  if (!accomplishmentsList) return;
  
  if (accomplishments.length === 0) {
    accomplishmentsList.innerHTML = '<p class="text-muted text-center">No accomplishments logged today. Add one to celebrate your wins!</p>';
    return;
  }
  
  accomplishmentsList.innerHTML = accomplishments.map(acc => `
    <div class="accomplishment-item">
      <div class="accomplishment-title">${acc.title}</div>
      ${acc.content ? `<div class="accomplishment-content">${acc.content}</div>` : ''}
      <div class="accomplishment-time">
        ${new Date(acc.createdAt).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true 
        })}
        <button class="btn btn-sm btn-outline-danger ms-2 delete-accomplishment-btn" data-accomplishment-id="${acc.id}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Load work session summary (placeholder - needs work session service)
 */
async function loadWorkSessionSummary() {
  const workSession = await getWorkSession();
  
  if (!workSession) {
    document.getElementById('todayTotalHours').textContent = '0h 0m';
    document.getElementById('todayWorkHours').textContent = '0h 0m';
    document.getElementById('todayBreakHours').textContent = '0h 0m';
    document.getElementById('todayCurrentActivity').textContent = 'Not Punched In';
    return;
  }
  
  // Calculate hours
  const punchInTime = new Date(workSession.punchIn);
  const punchOutTime = workSession.punchOut ? new Date(workSession.punchOut) : new Date();
  const totalMilliseconds = punchOutTime - punchInTime;
  const totalHours = Math.floor(totalMilliseconds / (1000 * 60 * 60));
  const totalMinutes = Math.floor((totalMilliseconds % (1000 * 60 * 60)) / (1000 * 60));
  
  // Update display
  document.getElementById('todayTotalHours').textContent = `${totalHours}h ${totalMinutes}m`;
  document.getElementById('todayWorkHours').textContent = `${totalHours}h ${totalMinutes}m`;
  document.getElementById('todayBreakHours').textContent = '0h 0m'; // TODO: Implement breaks
  
  const status = workSession.punchOut ? 'Punched Out' : 'Working';
  document.getElementById('todayCurrentActivity').textContent = status;
}

/**
 * Load task overview with time filter
 * @param {string} filter - 'today', 'thisWeek', or 'nextWeek'
 */
async function loadTaskOverview(filter) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = getTodayISO();
  
  let startDate, endDate, filteredTasks, hoursLabel;
  const allTasks = await getTasks({}, true);
  
  if (filter === 'today') {
    startDate = endDate = todayStr;
    // Show tasks due today OR overdue tasks not completed
    filteredTasks = allTasks.filter(task => 
      task.dueOn === todayStr || (task.dueOn < todayStr && !['Completed', 'Abandoned', 'Archived'].includes(task.status))
    );
    hoursLabel = 'today';
  } else if (filter === 'thisWeek') {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    startDate = weekStart.toISOString().split('T')[0];
    endDate = weekEnd.toISOString().split('T')[0];
    filteredTasks = allTasks.filter(task => 
      (task.dueOn >= startDate && task.dueOn <= endDate) && !['Completed', 'Abandoned', 'Archived'].includes(task.status)
    );
    hoursLabel = 'this week';
  } else if (filter === 'nextWeek') {
    const nextWeekStart = new Date(today);
    nextWeekStart.setDate(today.getDate() - today.getDay() + 7);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
    startDate = nextWeekStart.toISOString().split('T')[0];
    endDate = nextWeekEnd.toISOString().split('T')[0];
    filteredTasks = allTasks.filter(task => 
      (task.dueOn >= startDate && task.dueOn <= endDate) && !['Completed', 'Abandoned', 'Archived'].includes(task.status)
    );
    hoursLabel = 'next week';
  }
  
  // Get time logs for the period
  const timeLogs = await getAllTimeLogs(startDate, endDate);
  const totalHours = timeLogs.reduce((sum, log) => sum + log.hours, 0);
  
  // Update hours badge
  const hoursElement = document.getElementById('today-hours');
  if (hoursElement) {
    hoursElement.textContent = `${totalHours.toFixed(1)} hours logged ${hoursLabel}`;
  }
  
  // Render tasks
  const tasksContainer = document.getElementById('today-tasks');
  if (!tasksContainer) return;
  
  if (filteredTasks.length === 0) {
    let emptyMessage = 'No tasks found';
    if (filter === 'today') emptyMessage = 'No tasks due today. Great job staying on top of things!';
    else if (filter === 'thisWeek') emptyMessage = 'No tasks due this week. You\'re all caught up!';
    else if (filter === 'nextWeek') emptyMessage = 'No tasks scheduled for next week yet.';
    
    tasksContainer.innerHTML = `<p class="text-muted text-center">${emptyMessage}</p>`;
    return;
  }
  
  // Render task list with work buttons
  tasksContainer.innerHTML = filteredTasks.map(task => {
    const isOverdue = task.dueOn < todayStr;
    const isToday = task.dueOn === todayStr;
    
    return `
      <div class="today-task-item ${isOverdue ? 'overdue' : ''} ${isToday ? 'due-today' : ''}">
        <div class="today-task-urgency ${task.urgency.toLowerCase()}"></div>
        <div class="flex-grow-1">
          <strong>${task.title}</strong>
          <span class="badge bg-secondary ms-2">${task.status}</span>
          ${isOverdue ? '<span class="badge bg-danger ms-1">OVERDUE</span>' : ''}
          ${isToday ? '<span class="badge bg-warning ms-1">TODAY</span>' : ''}
        </div>
        <div class="text-muted d-flex flex-column text-end">
          <small>Due: ${new Date(task.dueOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>
          <small>${task.estimate ? `Est: ${task.estimate}h` : 'No estimate'}</small>
        </div>
        <div class="ms-2">
          <button class="btn btn-sm btn-outline-info work-task-btn" data-task-id="${task.id}" title="Work on task">
            <i class="fas fa-edit"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// TODAY VIEW LOCAL FUNCTIONS
// ============================================================

async function submitQuickTodo() {
  const input = document.getElementById('todoTitleInput');
  if (!input) return;
  
  const title = input.value.trim();
  if (!title) return;
  
  const result = await saveTodo(title, '');
  if (result) {
    input.value = '';
    input.focus();
    showToast('Todo added!', 'success');
    await loadTodosSection();
  } else {
    showToast('Failed to add todo', 'error');
  }
}

async function submitTodoWithDetails() {
  const titleInput = document.getElementById('todoTitleInput');
  const detailsTextarea = document.querySelector('#todoDetailsInput textarea');
  if (!titleInput || !detailsTextarea) return;
  
  const title = titleInput.value.trim();
  const content = detailsTextarea.value.trim();
  
  if (!title) return;
  
  const result = await saveTodo(title, content);
  if (result) {
    titleInput.value = '';
    detailsTextarea.value = '';
    cancelTodoDetails();
    titleInput.focus();
    showToast('Todo added!', 'success');
    await loadTodosSection();
  } else {
    showToast('Failed to add todo', 'error');
  }
}

function showTodoDetails() {
  const detailsDiv = document.getElementById('todoDetailsInput');
  if (detailsDiv) {
    detailsDiv.style.display = 'block';
    const textarea = document.querySelector('#todoDetailsInput textarea');
    if (textarea) textarea.focus();
  }
}

function cancelTodoDetails() {
  const detailsDiv = document.getElementById('todoDetailsInput');
  if (detailsDiv) {
    detailsDiv.style.display = 'none';
    const textarea = document.querySelector('#todoDetailsInput textarea');
    if (textarea) textarea.value = '';
  }
}

async function toggleTodoInView(todoId) {
  const success = await toggleTodoService(todoId);
  if (success) {
    await loadTodosSection();
  } else {
    showToast('Failed to update todo', 'error');
  }
}

async function deleteTodoInView(todoId) {
  const success = await deleteTodoService(todoId);
  if (success) {
    showToast('Todo deleted', 'info');
    await loadTodosSection();
  } else {
    showToast('Failed to delete todo', 'error');
  }
}

// ============================================================
// INLINE CONFIRMATION HELPERS
// ============================================================

/**
 * Show inline confirmation for todo deletion
 * @param {number} todoId - Todo ID
 */
function showTodoDeleteConfirmation(todoId) {
  const todoItem = document.querySelector(`[data-todo-id="${todoId}"]`);
  if (!todoItem) return;
  
  const deleteBtn = todoItem.querySelector('.delete-todo-btn');
  const confirmation = todoItem.querySelector('.delete-confirmation');
  
  if (deleteBtn && confirmation) {
    // Hide delete button and show confirmation
    deleteBtn.classList.add('d-none');
    confirmation.classList.remove('d-none');
    
    // Add deleting state for visual feedback
    todoItem.classList.add('deleting');
  }
}

/**
 * Cancel todo deletion confirmation
 * @param {number} todoId - Todo ID
 */
function cancelTodoDeleteConfirmation(todoId) {
  const todoItem = document.querySelector(`[data-todo-id="${todoId}"]`);
  if (!todoItem) return;
  
  const deleteBtn = todoItem.querySelector('.delete-todo-btn');
  const confirmation = todoItem.querySelector('.delete-confirmation');
  
  if (deleteBtn && confirmation) {
    // Show delete button and hide confirmation
    deleteBtn.classList.remove('d-none');
    confirmation.classList.add('d-none');
    
    // Remove deleting state
    todoItem.classList.remove('deleting');
  }
}

async function submitQuickAccomplishment() {
  const input = document.getElementById('accomplishmentTitleInput');
  if (!input) return;
  
  const title = input.value.trim();
  if (!title) return;
  
  const result = await saveAccomplishment(title, '');
  if (result) {
    input.value = '';
    input.focus();
    showToast('Accomplishment added!', 'success');
    await loadAccomplishmentsSection();
  } else {
    showToast('Failed to add accomplishment', 'error');
  }
}

async function submitAccomplishmentWithDetails() {
  const titleInput = document.getElementById('accomplishmentTitleInput');
  const detailsTextarea = document.querySelector('#accomplishmentDetailsInput textarea');
  if (!titleInput || !detailsTextarea) return;
  
  const title = titleInput.value.trim();
  const content = detailsTextarea.value.trim();
  
  if (!title) return;
  
  const result = await saveAccomplishment(title, content);
  if (result) {
    titleInput.value = '';
    detailsTextarea.value = '';
    cancelAccomplishmentDetails();
    titleInput.focus();
    showToast('Accomplishment added!', 'success');
    await loadAccomplishmentsSection();
  } else {
    showToast('Failed to add accomplishment', 'error');
  }
}

function showAccomplishmentDetails() {
  const detailsDiv = document.getElementById('accomplishmentDetailsInput');
  if (detailsDiv) {
    detailsDiv.style.display = 'block';
    const textarea = document.querySelector('#accomplishmentDetailsInput textarea');
    if (textarea) textarea.focus();
  }
}

function cancelAccomplishmentDetails() {
  const detailsDiv = document.getElementById('accomplishmentDetailsInput');
  if (detailsDiv) {
    detailsDiv.style.display = 'none';
    const textarea = document.querySelector('#accomplishmentDetailsInput textarea');
    if (textarea) textarea.value = '';
  }
}

async function deleteAccomplishmentInView(accomplishmentId) {
  const success = await deleteAccomplishmentService(accomplishmentId);
  if (success) {
    showToast('Accomplishment deleted', 'info');
    await loadAccomplishmentsSection();
  } else {
    showToast('Failed to delete accomplishment', 'error');
  }
}

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Initialize all event handlers for today view
 */
function initializeTodayViewHandlers() {
  // Todo form handlers
  const todoTitleInput = document.getElementById('todoTitleInput');
  const addTodoBtn = document.getElementById('addTodoBtn');
  
  if (todoTitleInput && addTodoBtn) {
    todoTitleInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && todoTitleInput.value.trim()) {
        submitQuickTodo();
      }
    });
    
    addTodoBtn.addEventListener('click', () => {
      showTodoDetails();
    });
  }
  
  // Accomplishment form handlers
  const accomplishmentTitleInput = document.getElementById('accomplishmentTitleInput');
  const addAccomplishmentBtn = document.getElementById('addAccomplishmentBtn');
  
  if (accomplishmentTitleInput && addAccomplishmentBtn) {
    accomplishmentTitleInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && accomplishmentTitleInput.value.trim()) {
        submitQuickAccomplishment();
      }
    });
    
    addAccomplishmentBtn.addEventListener('click', () => {
      showAccomplishmentDetails();
    });
  }
  
  // Accomplishment details form handlers
  const cancelAccomplishmentDetailsBtn = document.getElementById('cancelAccomplishmentDetailsBtn');
  const submitAccomplishmentWithDetailsBtn = document.getElementById('submitAccomplishmentWithDetailsBtn');
  
  if (cancelAccomplishmentDetailsBtn) {
    cancelAccomplishmentDetailsBtn.addEventListener('click', () => {
      cancelAccomplishmentDetails();
    });
  }
  
  if (submitAccomplishmentWithDetailsBtn) {
    submitAccomplishmentWithDetailsBtn.addEventListener('click', () => {
      submitAccomplishmentWithDetails();
    });
  }
  
  // Todo details form handlers
  const cancelTodoDetailsBtn = document.getElementById('cancelTodoDetailsBtn');
  const submitTodoWithDetailsBtn = document.getElementById('submitTodoWithDetailsBtn');
  
  if (cancelTodoDetailsBtn) {
    cancelTodoDetailsBtn.addEventListener('click', () => {
      cancelTodoDetails();
    });
  }
  
  if (submitTodoWithDetailsBtn) {
    submitTodoWithDetailsBtn.addEventListener('click', () => {
      submitTodoWithDetails();
    });
  }
  
  // Task filter handlers
  const filterButtons = document.querySelectorAll('.task-overview-filters button');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      await loadTaskOverview(filter);
    });
  });
  
  // Todo checkbox handlers (delegated)
  document.getElementById('todos-list')?.addEventListener('change', async (e) => {
    if (e.target.classList.contains('todo-checkbox')) {
      const todoId = parseInt(e.target.dataset.todoId);
      await toggleTodoInView(todoId);
    }
  });
  
  // Delete button handlers (delegated)
  document.getElementById('todos-list')?.addEventListener('click', async (e) => {
    // Show inline confirmation
    if (e.target.closest('.delete-todo-btn')) {
      const todoId = parseInt(e.target.closest('.delete-todo-btn').dataset.todoId);
      showTodoDeleteConfirmation(todoId);
    }
    
    // Confirm deletion
    if (e.target.closest('.confirm-delete-todo-btn')) {
      const todoId = parseInt(e.target.closest('.confirm-delete-todo-btn').dataset.todoId);
      await deleteTodoInView(todoId);
    }
    
    // Cancel deletion
    if (e.target.closest('.cancel-delete-todo-btn')) {
      const todoId = parseInt(e.target.closest('.cancel-delete-todo-btn').dataset.todoId);
      cancelTodoDeleteConfirmation(todoId);
    }
  });
  
  document.getElementById('accomplishments-list')?.addEventListener('click', async (e) => {
    if (e.target.closest('.delete-accomplishment-btn')) {
      const accomplishmentId = parseInt(e.target.closest('.delete-accomplishment-btn').dataset.accomplishmentId);
      await deleteAccomplishmentInView(accomplishmentId);
    }
  });
  
  // Show completed todos toggle
  document.getElementById('showCompletedTodos')?.addEventListener('change', async () => {
    await loadTodosSection();
  });
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getStatusBadgeColor(status) {
  const colors = {
    'Ready': 'secondary',
    'Estimated': 'info',
    'InProgress': 'primary',
    'Completed': 'success',
    'Blocked': 'danger',
    'Backburner': 'warning',
    'OnHold': 'warning'
  };
  return colors[status] || 'secondary';
}

function getUrgencyBadgeColor(urgency) {
  return urgency === 'High' ? 'danger' : urgency === 'Med' ? 'warning' : 'success';
}

// ============================================================
// PUBLIC API
// ============================================================

export { loadTodayData, loadTodosSection, loadAccomplishmentsSection, loadTaskOverview };
