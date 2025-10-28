// ===== APP CONTROLLER - Main Orchestration Layer =====
// Coordinates all views, handles routing, global events, and UI initialization

// Import foundation modules
import { dbPromise, getDatabaseStats, seedSampleCategoryLists } from './db.mjs';
import { getCurrentView, setCurrentView, getMonthOffset, setMonthOffset, getGlobalFilters, setGlobalFilters } from './state-service.mjs';
import { showToast, getDateRange, formatDate, formatHours, roundToQuarter } from './ui-utils.mjs';

// Import service modules
import { getCategoryLists, saveCategoryList, getCategoryListBySlug, deleteCategoryList } from './category-service.mjs';
import { getProjects, saveProject, deleteProject, getPhaseLists, savePhaseList, deletePhaseList, getProjectDisplayInfo, getPhaseDisplayInfo } from './project-service.mjs';
import { getTimeLogs, saveTimeLog, calculateTotalHours } from './timelog-service.mjs';
import { getTasks, saveTask, getTaskById, updateRemainingHours } from './task-service.mjs';
import { getTodos, saveTodo, toggleTodo } from './todo-service.mjs';
import { getAccomplishments, saveAccomplishment } from './accomplishment-service.mjs';
import { getActiveWorkSession, punchIn, punchOut, recordActivity, getCurrentActivity } from './work-session-service.mjs';
import { getDailySummary } from './daily-service.mjs';
import { exportData, importData } from './import-export.mjs';

// Import view modules
import { renderTodayView } from './today-view.mjs';
import { renderBoardView, initializeDragAndDrop } from './board-view.mjs';
import { renderCalendarView } from './calendar-view.mjs';
import { renderWorkView, loadTaskIntoWorkView, logQuickTime } from './work-view.mjs';
import { renderReportsView } from './reports-view.mjs';
import { initializeSpaceport, toggleSpaceportOperations } from './spaceport-view.mjs';

// ===== MAIN RENDER FUNCTION =====

export async function renderTasks(view = 'board') {
  console.log('Rendering tasks for view:', view);
  setCurrentView(view);
  
  // Update active tab
  updateActiveTab(view);
  
  // Get the main container element
  const container = document.getElementById('taskList');
  if (!container) {
    console.error('Container element #taskList not found');
    return;
  }
  
  // Toggle visibility between regular views and spaceport view
  const spaceportView = document.getElementById('spaceportView');
  if (view === 'spaceport') {
    container.style.display = 'none';
    if (spaceportView) spaceportView.style.display = 'block';
  } else {
    container.style.display = 'block';
    if (spaceportView) spaceportView.style.display = 'none';
  }
  
  // Get global filters
  const filters = getGlobalFilters();
  
  // Route to appropriate view
  switch (view) {
    case 'board':
      await renderBoardView(container, filters);
      break;
    case 'month':
      await renderCalendarView(container, filters);
      break;
    case 'today':
      await renderTodayView(container);
      break;
    case 'work':
      await renderWorkView(container);
      break;
    case 'reports':
      await renderReportsView(container);
      break;
    case 'spaceport':
      await renderSpaceportView(container);
      break;
    case 'all':
      await renderAllTasksView(container, filters);
      break;
    default:
      await renderBoardView(container, filters);
  }
}

// ===== VIEW FUNCTIONS =====

async function renderSpaceportView() {
  // Initialize spaceport (visibility already handled by renderTasks)
  await initializeSpaceport();
}

async function renderAllTasksView() {
  // Simple list of all tasks (legacy view)
  // TODO: Implement if needed
  console.log('All tasks view not yet implemented');
}

// ===== TAB NAVIGATION =====

function updateActiveTab(view) {
  // Remove active class from all tabs
  document.querySelectorAll('.nav-link').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Add active class to current tab
  const tabMap = {
    'board': 'boardTab',
    'month': 'monthTab',
    'today': 'todayTab',
    'work': 'workTab',
    'reports': 'reportsTab',
    'spaceport': 'spaceportTab',
    'all': 'allTab'
  };
  
  const tabId = tabMap[view];
  if (tabId) {
    const tab = document.getElementById(tabId);
    if (tab) {
      tab.classList.add('active');
    }
  }
}

function setupTabNavigation() {
  // Setup click handlers for nav tabs
  document.getElementById('boardTab')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderTasks('board');
  });
  
  document.getElementById('monthTab')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderTasks('month');
  });
  
  document.getElementById('todayTab')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderTasks('today');
  });
  
  document.getElementById('workTab')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderTasks('work');
  });
  
  document.getElementById('reportsTab')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderTasks('reports');
  });
  
  document.getElementById('spaceportTab')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderTasks('spaceport');
  });
}

// ===== GLOBAL EVENT HANDLERS =====

function setupGlobalEventListeners() {
  // Export button
  document.getElementById('exportBtn')?.addEventListener('click', async () => {
    await exportData();
  });
  
  // Import button
  document.getElementById('importBtn')?.addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  
  document.getElementById('importFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      await importData(file);
      // Refresh current view
      renderTasks(getCurrentView());
    }
  });
  
  // Global filter clear button
  document.getElementById('globalFilterClear')?.addEventListener('click', () => {
    document.getElementById('globalProjectFilter').value = '';
    document.getElementById('globalPhaseFilter').value = '';
    localStorage.removeItem('globalProjectFilter');
    localStorage.removeItem('globalPhaseFilter');
    renderTasks(getCurrentView());
  });
  
  // Global project filter
  document.getElementById('globalProjectFilter')?.addEventListener('change', (e) => {
    const projectId = e.target.value;
    localStorage.setItem('globalProjectFilter', projectId);
    renderTasks(getCurrentView());
  });
  
  // Global phase filter
  document.getElementById('globalPhaseFilter')?.addEventListener('change', (e) => {
    const phaseKey = e.target.value;
    localStorage.setItem('globalPhaseFilter', phaseKey);
    renderTasks(getCurrentView());
  });
  
  // Punch clock button
  document.getElementById('punchClockBtn')?.addEventListener('click', () => {
    const punchModal = new bootstrap.Modal(document.getElementById('punchClockModal'));
    punchModal.show();
  });
  
  // Global click handler for work-task-btn (Edit buttons on task cards)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.work-task-btn')) {
      const taskId = parseInt(e.target.closest('.work-task-btn').dataset.taskId);
      if (taskId) {
        console.log('Opening work tab for task:', taskId);
        openWorkTab(taskId);
      }
    }
  });
}

// Open Work tab and load specific task
async function openWorkTab(taskId) {
  console.log('openWorkTab called with taskId:', taskId);
  
  // Switch to work tab
  document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
  const workTab = document.getElementById('workTab');
  if (workTab) {
    workTab.classList.add('active');
    workTab.style.display = 'block';
  }
  
  // Load task into work view
  try {
    // First render the work view
    await renderTasks('work');
    
    // Then load the specific task
    setTimeout(async () => {
      await loadTaskIntoWorkView(taskId);
    }, 100);
  } catch (err) {
    console.error('Error opening work tab:', err);
    showToast('Failed to open task', 'error');
  }
}

// ===== SIDEBAR MANAGEMENT =====

// Expose renderTasks to window for use by calendar navigation
window.renderTasks = renderTasks;

window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const toggleIcon = document.getElementById('toggleIcon');
  const isCollapsed = sidebar.classList.contains('collapsed');
  
  if (isCollapsed) {
    sidebar.classList.remove('collapsed');
    toggleIcon.className = 'fas fa-chevron-left';
    localStorage.setItem('sidebarCollapsed', 'false');
  } else {
    sidebar.classList.add('collapsed');
    toggleIcon.className = 'fas fa-chevron-right';
    localStorage.setItem('sidebarCollapsed', 'true');
  }
};

window.showQuickAdd = function() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('collapsed')) {
    toggleSidebar();
  }
  setTimeout(() => {
    document.getElementById('quickTaskTitle')?.focus();
  }, 300);
};

function initializeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleIcon = document.getElementById('toggleIcon');
  const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  
  if (isCollapsed) {
    sidebar.classList.add('collapsed');
    toggleIcon.className = 'fas fa-chevron-right';
  } else {
    sidebar.classList.remove('collapsed');
    toggleIcon.className = 'fas fa-chevron-left';
  }
}

// ===== QUICK ADD FORM =====

function setupQuickAddForm() {
  // Set default due date to 1 week from today
  const dueDateInput = document.getElementById('quickTaskDue');
  if (dueDateInput) {
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    dueDateInput.value = oneWeekFromNow.toISOString().split('T')[0];
  }
  
  // Quick add button
  document.getElementById('quickAddBtn')?.addEventListener('click', async () => {
    await handleQuickAddTask();
  });
  
  // Expand/collapse advanced options
  document.getElementById('expandAddBtn')?.addEventListener('click', () => {
    const expandedForm = document.getElementById('expandedAddForm');
    const expandBtn = document.getElementById('expandAddBtn');
    
    if (expandedForm.style.display === 'none' || !expandedForm.style.display) {
      expandedForm.style.display = 'block';
      expandBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Less Options';
    } else {
      expandedForm.style.display = 'none';
      expandBtn.innerHTML = '<i class="fas fa-chevron-down"></i> More Options';
    }
  });
  
  // Project change handler
  document.getElementById('quickTaskProject')?.addEventListener('change', (e) => {
    populateQuickAddPhaseOptions(e.target.value);
  });
}

async function handleQuickAddTask() {
  const title = document.getElementById('quickTaskTitle').value.trim();
  const dueOn = document.getElementById('quickTaskDue').value;
  const status = document.getElementById('quickTaskStatus').value;
  
  if (!title || !dueOn) {
    showToast('Please fill in task title and due date', 'error');
    return;
  }
  
  // Build task object
  const task = {
    title,
    dueOn,
    status,
    text: document.getElementById('quickTaskText')?.value || '',
    notes: document.getElementById('quickTaskNotes')?.value || '',
    urgency: document.getElementById('quickTaskUrgency')?.value || 'Med',
    importance: document.getElementById('quickTaskImportance')?.value || 'Med',
    estimate: parseFloat(document.getElementById('quickTaskEstimate')?.value || 0),
    remainingHours: parseFloat(document.getElementById('quickTaskRemaining')?.value || 0),
    projectId: document.getElementById('quickTaskProject')?.value ? parseInt(document.getElementById('quickTaskProject').value) : null,
    phaseKey: document.getElementById('quickTaskPhase')?.value || null,
    categoryLists: getSelectedCategoryLists(),
    createdAt: new Date().toISOString()
  };
  
  try {
    const success = await saveTask(task, false);
    if (success) {
      showToast('Task added successfully!', 'success');
      
      // Clear form
      document.getElementById('quickTaskTitle').value = '';
      document.getElementById('quickTaskText').value = '';
      document.getElementById('quickTaskNotes').value = '';
      document.getElementById('quickTaskEstimate').value = '0';
      document.getElementById('quickTaskRemaining').value = '0';
      
      // Reset due date to 1 week from today
      const dueDateInput = document.getElementById('quickTaskDue');
      if (dueDateInput) {
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        dueDateInput.value = oneWeekFromNow.toISOString().split('T')[0];
      }
      
      // Refresh current view
      renderTasks(getCurrentView());
    } else {
      showToast('Failed to add task', 'error');
    }
  } catch (error) {
    console.error('Error adding task:', error);
    showToast('Failed to add task', 'error');
  }
}

function getSelectedCategoryLists() {
  const checkboxes = document.querySelectorAll('.category-list-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// ===== QUICK TIME MODAL SETUP =====

function setupQuickTimeModal() {
  const saveBtn = document.getElementById('saveQuickTimeBtn');
  const modal = document.getElementById('quickTimeModal');
  
  saveBtn?.addEventListener('click', async () => {
    const taskId = parseInt(document.getElementById('quickTimeTaskId').value);
    const hours = parseFloat(document.getElementById('quickTimeHours').value);
    const date = document.getElementById('quickTimeDate').value;
    const notes = document.getElementById('quickTimeNotes').value.trim();
    
    if (!hours || hours <= 0) {
      showToast('Please enter a valid number of hours', 'error');
      return;
    }
    
    if (!date) {
      showToast('Please select a date', 'error');
      return;
    }
    
    // Create time log
    const timeLog = {
      taskId: taskId,
      hours: hours,
      dateLogged: date,
      notes: notes || `Custom log: ${hours}h`,
      categoryKey: null
    };
    
    const success = await saveTimeLog(timeLog);
    if (!success) {
      // Service layer already showed validation error
      return;
    }
    
    // Update remaining hours and round to nearest quarter
    const tasks = await getTasks({}, true);
    const task = tasks.find(t => t.id === taskId);
    
    if (task && task.remainingHours !== null && task.remainingHours !== undefined) {
      const newRemaining = roundToQuarter(Math.max(0, task.remainingHours - hours));
      await updateRemainingHours(taskId, newRemaining, `Auto-decremented by ${hours}h time log`);
    }
    
    showToast(`${hours}h logged successfully!`, 'success');
    
    // Close modal
    const modalInstance = bootstrap.Modal.getInstance(modal);
    modalInstance.hide();
    
    // Refresh the current view
    const currentView = getCurrentView();
    if (currentView === 'board') {
      const container = document.getElementById('taskList');
      const filters = getGlobalFilters();
      await renderBoardView(container, filters);
    } else {
      await renderTasks(currentView);
    }
  });
}

// ===== CATEGORY LISTS MANAGEMENT =====

window.manageCategoryLists = function() {
  const expandedForm = document.getElementById('expandedAddForm');
  const expandBtn = document.getElementById('expandAddBtn');
  
  if (expandedForm.style.display === 'none' || !expandedForm.style.display) {
    expandBtn.click();
  }
  
  setTimeout(() => {
    const categorySection = document.getElementById('quickTaskCategoryLists');
    if (categorySection) {
      categorySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 100);
};

window.manageProjects = function() {
  const projectsModal = new bootstrap.Modal(document.getElementById('projectsModal'));
  projectsModal.show();
};

window.managePhases = function() {
  const phaseListsModal = new bootstrap.Modal(document.getElementById('phaseListsModal'));
  phaseListsModal.show();
};

// Expose quick time logging for board view with refresh callback
window.logQuickTime = async function(taskId, hours) {
  await logQuickTime(taskId, hours, async () => {
    // Refresh the current view after logging time
    const currentView = getCurrentView();
    if (currentView === 'board') {
      const container = document.getElementById('taskList');
      const filters = getGlobalFilters();
      await renderBoardView(container, filters);
    }
  });
};

// Expose custom time modal for board view
window.showCustomTimeModal = function(taskId) {
  const modal = new bootstrap.Modal(document.getElementById('quickTimeModal'));
  const taskIdInput = document.getElementById('quickTimeTaskId');
  const hoursInput = document.getElementById('quickTimeHours');
  const dateInput = document.getElementById('quickTimeDate');
  const notesInput = document.getElementById('quickTimeNotes');
  
  // Set task ID
  taskIdInput.value = taskId;
  
  // Set default date to today
  dateInput.value = new Date().toISOString().split('T')[0];
  
  // Clear previous values
  hoursInput.value = '';
  notesInput.value = '';
  
  // Focus on hours input
  modal._element.addEventListener('shown.bs.modal', () => {
    hoursInput.focus();
  }, { once: true });
  
  modal.show();
};

// ===== POPULATE DROPDOWNS =====

async function populateGlobalFilters() {
  // Populate global project filter
  const projectFilter = document.getElementById('globalProjectFilter');
  if (projectFilter) {
    const projects = await getProjects();
    projectFilter.innerHTML = '<option value="">All Projects</option>';
    projects.forEach(project => {
      projectFilter.innerHTML += `<option value="${project.id}">${project.name}</option>`;
    });
    
    // Restore saved filter
    const savedProject = localStorage.getItem('globalProjectFilter');
    if (savedProject) {
      projectFilter.value = savedProject;
    }
  }
  
  // Populate global phase filter
  const phaseFilter = document.getElementById('globalPhaseFilter');
  if (phaseFilter) {
    const phaseLists = await getPhaseLists();
    phaseFilter.innerHTML = '<option value="">All Phases</option>';
    phaseLists.forEach(list => {
      if (list.phases) {
        list.phases.forEach(phase => {
          phaseFilter.innerHTML += `<option value="${phase.slug}">${list.title}: ${phase.title}</option>`;
        });
      }
    });
    
    // Restore saved filter
    const savedPhase = localStorage.getItem('globalPhaseFilter');
    if (savedPhase) {
      phaseFilter.value = savedPhase;
    }
  }
}

async function populateQuickAddDropdowns() {
  // Populate project dropdown
  const projectSelect = document.getElementById('quickTaskProject');
  if (projectSelect) {
    const projects = await getProjects();
    projectSelect.innerHTML = '<option value="">No Project (AdHoc)</option>';
    projects.forEach(project => {
      projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`;
    });
  }
  
  // Populate phase dropdown (initially empty, populated when project selected)
  const phaseSelect = document.getElementById('quickTaskPhase');
  if (phaseSelect) {
    phaseSelect.innerHTML = '<option value="">No Phase</option>';
  }
  
  // Populate category lists
  await populateQuickAddCategoryLists();
}

async function populateQuickAddCategoryLists() {
  const container = document.getElementById('quickTaskCategoryLists');
  if (!container) return;
  
  const categoryLists = await getCategoryLists();
  
  if (categoryLists.length === 0) {
    container.innerHTML = '<div class="text-muted small">No category lists available</div>';
    return;
  }
  
  container.innerHTML = categoryLists.map(list => `
    <div class="form-check">
      <input class="form-check-input category-list-checkbox" type="checkbox" value="${list.slug}" id="catList_${list.slug}">
      <label class="form-check-label" for="catList_${list.slug}">
        ${list.title}
      </label>
    </div>
  `).join('');
}

async function populateQuickAddPhaseOptions(projectId) {
  const phaseSelect = document.getElementById('quickTaskPhase');
  if (!phaseSelect) return;
  
  phaseSelect.innerHTML = '<option value="">No Phase</option>';
  
  if (!projectId) return;
  
  // Get project details
  const projects = await getProjects();
  const project = projects.find(p => p.id === parseInt(projectId));
  
  if (!project || !project.phaseListId) return;
  
  // Get the phase list associated with this project
  const phaseLists = await getPhaseLists();
  const phaseList = phaseLists.find(pl => pl.id === project.phaseListId);
  
  if (!phaseList || !phaseList.phases || phaseList.phases.length === 0) return;
  
  // Populate phases from the phase list
  phaseList.phases.forEach(phase => {
    phaseSelect.innerHTML += `<option value="${phase.slug}">${phase.title}</option>`;
  });
}

// ===== NAVIGATION HELPERS =====

export function navigatePeriod(direction) {
  if (getCurrentView() === 'month') {
    setMonthOffset(getMonthOffset() + direction);
    renderTasks('month');
  }
}

export function goToToday() {
  setMonthOffset(0);
  renderTasks(getCurrentView());
}

// ===== TODO LIST MODAL =====

function initializeTodoListModal() {
  const modalTodoInput = document.getElementById('modalTodoTitleInput');
  const modalTodoAddBtn = document.getElementById('modalTodoAddBtn');
  const modalShowCompleted = document.getElementById('modalShowCompletedTodos');
  const modalCancelDetails = document.getElementById('modalCancelTodoDetails');
  const modalSubmitWithDetails = document.getElementById('modalSubmitTodoWithDetails');
  
  // Input event handlers
  if (modalTodoInput) {
    modalTodoInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          showModalTodoDetails();
        } else {
          if (shouldSubmitModalTodoWithDetails()) {
            submitModalTodoWithDetails();
          } else {
            submitModalTodo();
          }
        }
      }
    });
  }
  
  // Button event handlers
  if (modalTodoAddBtn) {
    modalTodoAddBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('modalTodoTitleInput');
      if (input.value.trim()) {
        if (shouldSubmitModalTodoWithDetails()) {
          submitModalTodoWithDetails();
        } else {
          submitModalTodo();
        }
      } else {
        showModalTodoDetails();
      }
    });
  }
  
  if (modalShowCompleted) {
    modalShowCompleted.addEventListener('change', loadModalTodos);
  }
  
  if (modalCancelDetails) {
    modalCancelDetails.addEventListener('click', cancelModalTodoDetails);
  }
  
  if (modalSubmitWithDetails) {
    modalSubmitWithDetails.addEventListener('click', submitModalTodoWithDetails);
  }
  
  // Load todos when modal is shown
  const todoModal = document.getElementById('todoListModal');
  if (todoModal) {
    todoModal.addEventListener('show.bs.modal', function () {
      loadModalTodos();
      setTimeout(() => modalTodoInput?.focus(), 100);
    });
  }
}

function shouldSubmitModalTodoWithDetails() {
  const detailsDiv = document.getElementById('modalTodoDetailsInput');
  const detailsTextarea = document.querySelector('#modalTodoDetailsInput textarea');
  return detailsDiv && detailsDiv.style.display !== 'none' && detailsTextarea && detailsTextarea.value.trim();
}

function showModalTodoDetails() {
  const detailsDiv = document.getElementById('modalTodoDetailsInput');
  if (detailsDiv) {
    detailsDiv.style.display = 'block';
    const textarea = document.querySelector('#modalTodoDetailsInput textarea');
    if (textarea) textarea.focus();
  }
}

function cancelModalTodoDetails() {
  const detailsDiv = document.getElementById('modalTodoDetailsInput');
  const textarea = document.querySelector('#modalTodoDetailsInput textarea');
  if (detailsDiv) detailsDiv.style.display = 'none';
  if (textarea) textarea.value = '';
}

async function submitModalTodo() {
  const input = document.getElementById('modalTodoTitleInput');
  const title = input.value.trim();
  if (!title) return;
  
  await saveTodo(title, '');
  input.value = '';
  loadModalTodos();
  input.focus();
}

async function submitModalTodoWithDetails() {
  const titleInput = document.getElementById('modalTodoTitleInput');
  const detailsTextarea = document.querySelector('#modalTodoDetailsInput textarea');
  const title = titleInput.value.trim();
  const content = detailsTextarea.value.trim();
  
  if (!title) return;
  
  await saveTodo(title, content);
  titleInput.value = '';
  detailsTextarea.value = '';
  cancelModalTodoDetails();
  loadModalTodos();
  titleInput.focus();
}

async function loadModalTodos() {
  try {
    const db = await dbPromise;
    const allTodos = await db.getAll('todos');
    
    const showCompletedCheckbox = document.getElementById('modalShowCompletedTodos');
    const showCompleted = showCompletedCheckbox?.checked || false;
    
    const todosToShow = showCompleted 
      ? allTodos
      : allTodos.filter(todo => !todo.completed);
    
    todosToShow.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    const todosList = document.getElementById('modalTodosList');
    if (!todosList) return;
    
    if (todosToShow.length === 0) {
      todosList.innerHTML = showCompleted 
        ? '<p class="text-muted text-center">No todos yet. Add one to get started!</p>'
        : '<p class="text-muted text-center">No active todos. Add one to get started!</p>';
      return;
    }
    
    todosList.innerHTML = todosToShow.map(todo => `
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
        <div class="todo-actions ms-auto">
          <button class="btn btn-sm btn-outline-danger delete-btn" data-todo-id="${todo.id}" title="Delete todo">
            <i class="fas fa-trash"></i>
          </button>
          <div class="delete-confirmation d-none">
            <span class="me-2">Delete this todo?</span>
            <button class="btn btn-danger btn-sm me-1 confirm-delete-btn" data-todo-id="${todo.id}">
              <i class="fas fa-check me-1"></i>Yes
            </button>
            <button class="btn btn-outline-secondary btn-sm cancel-delete-btn" data-todo-id="${todo.id}">
              <i class="fas fa-times me-1"></i>Cancel
            </button>
          </div>
        </div>
      </div>
    `).join('');
    
    // Attach event listeners to dynamically created elements
    todosList.querySelectorAll('.todo-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const todoId = parseInt(e.target.dataset.todoId);
        await toggleModalTodo(todoId);
      });
    });

    // Delete button - show inline confirmation
    todosList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const todoId = parseInt(e.currentTarget.dataset.todoId);
        showTodoDeleteConfirmation(todoId);
      });
    });

    // Confirm delete - actually delete the todo
    todosList.querySelectorAll('.confirm-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const todoId = parseInt(e.currentTarget.dataset.todoId);
        await deleteModalTodo(todoId);
      });
    });

    // Cancel delete - hide confirmation
    todosList.querySelectorAll('.cancel-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const todoId = parseInt(e.currentTarget.dataset.todoId);
        cancelTodoDelete(todoId);
      });
    });
  } catch (err) {
    console.error('Error loading modal todos:', err);
  }
}

async function toggleModalTodo(todoId) {
  try {
    const db = await dbPromise;
    const todo = await db.get('todos', todoId);
    if (!todo) return;
    
    todo.completed = !todo.completed;
    todo.completedAt = todo.completed ? new Date().toISOString() : null;
    
    await db.put('todos', todo);
    await loadModalTodos();
  } catch (err) {
    console.error('Error toggling todo:', err);
    showToast('Failed to update todo', 'error');
  }
}

// Helper functions for inline todo confirmation
function showTodoDeleteConfirmation(todoId) {
  const todoItem = document.querySelector(`[data-todo-id="${todoId}"]`);
  if (!todoItem) return;
  
  const deleteBtn = todoItem.querySelector('.delete-btn');
  const confirmation = todoItem.querySelector('.delete-confirmation');
  
  // Hide delete button and show confirmation
  deleteBtn.classList.add('d-none');
  confirmation.classList.remove('d-none');
  
  // Add deleting state for visual feedback
  todoItem.classList.add('deleting');
}

function cancelTodoDelete(todoId) {
  const todoItem = document.querySelector(`[data-todo-id="${todoId}"]`);
  if (!todoItem) return;
  
  const deleteBtn = todoItem.querySelector('.delete-btn');
  const confirmation = todoItem.querySelector('.delete-confirmation');
  
  // Show delete button and hide confirmation
  deleteBtn.classList.remove('d-none');
  confirmation.classList.add('d-none');
  
  // Remove deleting state
  todoItem.classList.remove('deleting');
}

async function deleteModalTodo(todoId) {
  // For consistency with main app, use the same inline confirmation pattern
  // This function is called by the inline confirmation buttons
  try {
    const db = await dbPromise;
    await db.delete('todos', todoId);
    await loadModalTodos();
    showToast('Todo deleted', 'success');
  } catch (err) {
    console.error('Error deleting todo:', err);
    showToast('Failed to delete todo', 'error');
  }
}

// ===== PHASE LISTS MODAL =====

let currentPhaseList = null;

function initializePhaseListsModal() {
  const phaseListsModal = document.getElementById('phaseListsModal');
  
  loadPhaseListsPanel();

  // New list button
  document.getElementById('newPhaseListBtn').addEventListener('click', () => {
    showPhaseListEditor();
  });

  // Form submission
  document.getElementById('phaseListForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await savePhaseListForm();
  });

  // Cancel button
  document.getElementById('cancelPhaseListBtn').addEventListener('click', () => {
    hidePhaseListEditor();
  });

  // Delete button
  document.getElementById('deletePhaseListBtn').addEventListener('click', async () => {
    if (currentPhaseList) {
      if (confirm(`Are you sure you want to delete "${currentPhaseList.title}"?\n\nThis will permanently delete the phase list and all its phases.`)) {
        try {
          await deletePhaseList(currentPhaseList.id);
          hidePhaseListEditor();
          loadPhaseListsPanel();
          showToast('Phase list deleted', 'success');
        } catch (err) {
          console.error('Error deleting phase list:', err);
          showToast('Failed to delete phase list', 'error');
        }
      }
    }
  });

  // Add phase button
  document.getElementById('addPhaseBtn').addEventListener('click', () => {
    addPhaseItem();
  });

  // Auto-generate slug as user types
  document.getElementById('phaseListTitle').addEventListener('input', (e) => {
    const slug = generatePhaseSlug(e.target.value);
    document.getElementById('phaseListSlugPreview').textContent = slug || '(auto-generated)';
  });

  // Add Bootstrap modal event listeners
  if (phaseListsModal) {
    phaseListsModal.addEventListener('show.bs.modal', function () {
      loadPhaseListsPanel();
      this.removeAttribute('aria-hidden');
    });

    phaseListsModal.addEventListener('hide.bs.modal', function () {
      const focusedElement = this.querySelector(':focus');
      if (focusedElement) {
        focusedElement.blur();
      }
    });
  }
}

// Generate slug for phase lists (simple version)
function generatePhaseSlug(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Load phase lists panel
async function loadPhaseListsPanel() {
  const container = document.getElementById('phaseListsContainer');
  const lists = await getPhaseLists();

  if (lists.length === 0) {
    container.innerHTML = `
      <div class="text-muted text-center py-4">
        <i class="fas fa-layer-group fa-2x mb-2 opacity-50"></i>
        <p class="small mb-0">No phase lists yet.<br>Create your first list!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = lists.map(list => `
    <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            data-list-id="${list.id}">
      <div>
        <div class="fw-semibold">${list.title}</div>
        <small class="text-muted">${list.phases?.length || 0} phases</small>
      </div>
      <i class="fas fa-chevron-right"></i>
    </button>
  `).join('');

  // Add click handlers
  container.querySelectorAll('[data-list-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const listId = parseInt(btn.dataset.listId);
      const list = lists.find(l => l.id === listId);
      if (list) {
        showPhaseListEditor(list);
      }
    });
  });
}

// Show phase list editor
function showPhaseListEditor(phaseList = null) {
  currentPhaseList = phaseList;
  
  document.getElementById('phaseListPlaceholder').style.display = 'none';
  document.getElementById('phaseListEditor').style.display = 'block';

  if (phaseList) {
    // Edit mode
    document.getElementById('phaseListTitle').value = phaseList.title;
    document.getElementById('phaseListDescription').value = phaseList.description || '';
    document.getElementById('phaseListSlugPreview').textContent = phaseList.slug;
    document.getElementById('deletePhaseListBtn').style.display = 'inline-block';
    
    renderPhasesContainer(phaseList.phases || []);
  } else {
    // New mode
    document.getElementById('phaseListTitle').value = '';
    document.getElementById('phaseListDescription').value = '';
    document.getElementById('phaseListSlugPreview').textContent = '(auto-generated)';
    document.getElementById('deletePhaseListBtn').style.display = 'none';
    
    renderPhasesContainer([]);
  }
}

// Hide phase list editor
function hidePhaseListEditor() {
  currentPhaseList = null;
  document.getElementById('phaseListEditor').style.display = 'none';
  document.getElementById('phaseListPlaceholder').style.display = 'block';
  document.getElementById('phaseListForm').reset();
}

// Render phases container
function renderPhasesContainer(phases) {
  const container = document.getElementById('phasesContainer');
  
  if (phases.length === 0) {
    container.innerHTML = `
      <div class="text-muted text-center py-3">
        <i class="fas fa-layer-group fa-2x mb-2 opacity-50"></i>
        <p class="small mb-0">No phases yet.<br>Click "Add Phase" to get started!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = phases.map((phase, index) => `
    <div class="d-flex align-items-center mb-2 phase-item">
      <input type="text" class="form-control phase-title" value="${phase.title}" placeholder="Phase name" data-phase-index="${index}">
      <small class="text-muted ms-2 me-2">Slug: <span class="phase-slug">${phase.slug || '(auto-generated)'}</span></small>
      <button type="button" class="btn btn-outline-danger btn-sm ms-2" data-remove-phase="${index}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');

  // Add event listeners to phase title inputs
  container.querySelectorAll('.phase-title').forEach((input) => {
    input.addEventListener('input', (e) => {
      const slugSpan = e.target.parentElement.querySelector('.phase-slug');
      const slug = generatePhaseSlug(e.target.value);
      slugSpan.textContent = slug || '(auto-generated)';
    });
  });

  // Add event listeners to remove buttons
  container.querySelectorAll('[data-remove-phase]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.removePhase);
      removePhaseItem(index);
    });
  });
}

// Add phase item
function addPhaseItem() {
  const phases = getCurrentPhases();
  phases.push({ title: '', slug: '' });
  renderPhasesContainer(phases);
  
  // Focus the new input
  const container = document.getElementById('phasesContainer');
  const inputs = container.querySelectorAll('.phase-title');
  if (inputs.length > 0) {
    inputs[inputs.length - 1].focus();
  }
}

// Remove phase item
function removePhaseItem(index) {
  const phases = getCurrentPhases();
  phases.splice(index, 1);
  renderPhasesContainer(phases);
}

// Get current phases from form  
function getCurrentPhases() {
  const container = document.getElementById('phasesContainer');
  const phaseInputs = container.querySelectorAll('.phase-title');
  const listTitle = document.getElementById('phaseListTitle').value.trim();
  const listSlug = generatePhaseSlug(listTitle);
  
  return Array.from(phaseInputs).map(input => ({
    title: input.value.trim(),
    slug: `${listSlug}.${generatePhaseSlug(input.value.trim())}`
  })).filter(phase => phase.title);
}

// Save phase list form
async function savePhaseListForm() {
  const title = document.getElementById('phaseListTitle').value.trim();
  const description = document.getElementById('phaseListDescription').value.trim();
  const phases = getCurrentPhases();

  if (!title) {
    showToast('Phase list title is required', 'error');
    return;
  }

  // Validate phase titles
  for (const phase of phases) {
    if (!phase.title) {
      showToast('All phases must have a title', 'error');
      return;
    }
  }

  const phaseListData = {
    title,
    description,
    phases
  };

  if (currentPhaseList) {
    phaseListData.id = currentPhaseList.id;
    phaseListData.slug = currentPhaseList.slug; // Keep existing slug
  }

  try {
    await savePhaseList(phaseListData);
    hidePhaseListEditor();
    loadPhaseListsPanel();
    showToast('Phase list saved', 'success');
  } catch (err) {
    console.error('Error saving phase list:', err);
    showToast('Failed to save phase list', 'error');
  }
}

// ===== CATEGORY LISTS MODAL =====

let currentCategoryList = null;

function initializeCategoryListsModal() {
  const categoryListsModal = document.getElementById('categoryListsModal');
  
  loadCategoryListsPanel();

  // New list button
  document.getElementById('newCategoryListBtn').addEventListener('click', () => {
    showCategoryListEditor();
  });

  // Form submission
  document.getElementById('categoryListForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCategoryListForm();
  });

  // Cancel button
  document.getElementById('cancelCategoryListBtn').addEventListener('click', () => {
    hideCategoryListEditor();
  });

  // Delete button
  document.getElementById('deleteCategoryListBtn').addEventListener('click', async () => {
    if (currentCategoryList) {
      if (confirm(`Are you sure you want to delete "${currentCategoryList.title}"?\n\nThis will permanently delete the category list and all its categories.`)) {
        try {
          await deleteCategoryList(currentCategoryList.id);
          hideCategoryListEditor();
          loadCategoryListsPanel();
          showToast('Category list deleted', 'success');
        } catch (err) {
          console.error('Error deleting category list:', err);
          showToast('Failed to delete category list', 'error');
        }
      }
    }
  });

  // Add category button
  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    addCategoryItem();
  });

  // Auto-generate slug as user types
  document.getElementById('categoryListTitle').addEventListener('input', (e) => {
    const slug = generateCategorySlug(e.target.value);
    document.getElementById('categoryListSlugPreview').textContent = slug || '(auto-generated)';
  });

  // Add Bootstrap modal event listeners
  if (categoryListsModal) {
    categoryListsModal.addEventListener('show.bs.modal', function () {
      loadCategoryListsPanel();
      this.removeAttribute('aria-hidden');
    });

    categoryListsModal.addEventListener('hide.bs.modal', function () {
      const focusedElement = this.querySelector(':focus');
      if (focusedElement) {
        focusedElement.blur();
      }
    });
  }
}

// Generate slug for category lists (simple version)
function generateCategorySlug(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Load category lists panel
async function loadCategoryListsPanel() {
  const container = document.getElementById('categoryListsContainer');
  const lists = await getCategoryLists();

  if (lists.length === 0) {
    container.innerHTML = `
      <div class="text-muted text-center py-4">
        <i class="fas fa-tags fa-2x mb-2 opacity-50"></i>
        <p class="small mb-0">No category lists yet.<br>Create your first list!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = lists.map(list => `
    <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            data-list-id="${list.id}">
      <div>
        <div class="fw-semibold">${list.title}</div>
        <small class="text-muted">${list.categories?.length || 0} categories</small>
      </div>
      <i class="fas fa-chevron-right"></i>
    </button>
  `).join('');

  // Add click handlers
  container.querySelectorAll('[data-list-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const listId = parseInt(btn.dataset.listId);
      const list = lists.find(l => l.id === listId);
      if (list) {
        showCategoryListEditor(list);
      }
    });
  });
}

// Show category list editor
function showCategoryListEditor(categoryList = null) {
  currentCategoryList = categoryList;
  
  document.getElementById('categoryListPlaceholder').style.display = 'none';
  document.getElementById('categoryListEditor').style.display = 'block';

  if (categoryList) {
    // Edit mode
    document.getElementById('categoryListTitle').value = categoryList.title;
    document.getElementById('categoryListDescription').value = categoryList.description || '';
    document.getElementById('categoryListSlugPreview').textContent = categoryList.slug;
    document.getElementById('deleteCategoryListBtn').style.display = 'inline-block';
    
    renderCategoriesContainer(categoryList.categories || []);
  } else {
    // New mode
    document.getElementById('categoryListForm').reset();
    document.getElementById('categoryListSlugPreview').textContent = '(auto-generated)';
    document.getElementById('deleteCategoryListBtn').style.display = 'none';
    
    renderCategoriesContainer([]);
  }
}

// Hide category list editor
function hideCategoryListEditor() {
  currentCategoryList = null;
  document.getElementById('categoryListEditor').style.display = 'none';
  document.getElementById('categoryListPlaceholder').style.display = 'block';
}

// Render categories container
function renderCategoriesContainer(categories) {
  const container = document.getElementById('categoriesContainer');
  
  if (categories.length === 0) {
    container.innerHTML = `
      <div class="text-muted text-center py-3">
        <i class="fas fa-tag opacity-50 mb-2"></i>
        <p class="small mb-0">No categories yet. Add some below!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = categories.map((cat, index) => `
    <div class="category-item d-flex align-items-center gap-2 mb-2 p-2 border rounded" data-index="${index}">
      <div class="drag-handle text-muted" style="cursor: grab;">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <div class="flex-grow-1">
        <input type="text" class="form-control form-control-sm category-title" 
               value="${cat.title}" placeholder="Category name" required>
        <small class="text-muted">Slug: <span class="category-slug">${cat.slug}</span></small>
      </div>
      <button type="button" class="btn btn-outline-danger btn-sm remove-category">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');

  // Add event handlers
  container.querySelectorAll('.category-title').forEach(input => {
    input.addEventListener('input', (e) => {
      const slug = generateCategorySlug(e.target.value);
      const slugSpan = e.target.parentElement.querySelector('.category-slug');
      slugSpan.textContent = slug || '(auto-generated)';
    });
  });

  container.querySelectorAll('.remove-category').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.category-item').remove();
      // Show empty state if no categories left
      if (container.children.length === 0) {
        renderCategoriesContainer([]);
      }
    });
  });
}

// Add category item
function addCategoryItem() {
  const container = document.getElementById('categoriesContainer');
  
  // Remove empty state if present
  const emptyState = container.querySelector('.text-muted.text-center');
  if (emptyState) {
    container.innerHTML = '';
  }

  const index = container.children.length;
  const categoryDiv = document.createElement('div');
  categoryDiv.className = 'category-item d-flex align-items-center gap-2 mb-2 p-2 border rounded';
  categoryDiv.dataset.index = index;
  
  categoryDiv.innerHTML = `
    <div class="drag-handle text-muted" style="cursor: grab;">
      <i class="fas fa-grip-vertical"></i>
    </div>
    <div class="flex-grow-1">
      <input type="text" class="form-control form-control-sm category-title" 
             placeholder="Category name" required>
      <small class="text-muted">Slug: <span class="category-slug">(auto-generated)</span></small>
    </div>
    <button type="button" class="btn btn-outline-danger btn-sm remove-category">
      <i class="fas fa-times"></i>
    </button>
  `;

  container.appendChild(categoryDiv);

  // Add event handlers
  const titleInput = categoryDiv.querySelector('.category-title');
  const slugSpan = categoryDiv.querySelector('.category-slug');
  const removeBtn = categoryDiv.querySelector('.remove-category');

  titleInput.addEventListener('input', (e) => {
    const slug = generateCategorySlug(e.target.value);
    slugSpan.textContent = slug || '(auto-generated)';
  });

  removeBtn.addEventListener('click', () => {
    categoryDiv.remove();
    // Show empty state if no categories left
    if (container.children.length === 0) {
      renderCategoriesContainer([]);
    }
  });

  titleInput.focus();
}

// Save category list form
async function saveCategoryListForm() {
  const title = document.getElementById('categoryListTitle').value.trim();
  const description = document.getElementById('categoryListDescription').value.trim();
  
  if (!title) {
    showToast('Please enter a list title', 'error');
    return;
  }

  // Collect categories
  const categoryItems = document.querySelectorAll('.category-item');
  const categories = [];
  
  for (const item of categoryItems) {
    const titleInput = item.querySelector('.category-title');
    const categoryTitle = titleInput.value.trim();
    
    if (categoryTitle) {
      categories.push({
        title: categoryTitle,
        slug: `${generateCategorySlug(title)}.${generateCategorySlug(categoryTitle)}`
      });
    }
  }

  const categoryListData = {
    title,
    description,
    categories
  };

  if (currentCategoryList) {
    categoryListData.id = currentCategoryList.id;
    categoryListData.slug = currentCategoryList.slug; // Keep existing slug
  }

  try {
    await saveCategoryList(categoryListData);
    hideCategoryListEditor();
    loadCategoryListsPanel();
    showToast('Category list saved', 'success');
  } catch (err) {
    console.error('Error saving category list:', err);
    showToast('Failed to save category list', 'error');
  }
}

// ===== PROJECTS MODAL =====

let currentProject = null;

function initializeProjectsModal() {
  const projectsModal = document.getElementById('projectsModal');
  
  loadProjectsPanel();

  // New project button
  document.getElementById('newProjectBtn').addEventListener('click', () => {
    showProjectEditor();
  });

  // Form submission
  document.getElementById('projectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProjectForm();
  });

  // Cancel button
  document.getElementById('cancelProjectBtn').addEventListener('click', () => {
    hideProjectEditor();
  });

  // Delete button
  document.getElementById('deleteProjectBtn').addEventListener('click', async () => {
    if (currentProject) {
      if (confirm(`Are you sure you want to delete "${currentProject.name}"?\n\nThis will permanently delete the project. Tasks linked to this project will become unassigned.`)) {
        try {
          await deleteProject(currentProject.id);
          hideProjectEditor();
          loadProjectsPanel();
          showToast('Project deleted', 'success');
        } catch (err) {
          console.error('Error deleting project:', err);
          showToast('Failed to delete project', 'error');
        }
      }
    }
  });

  // Add Bootstrap modal event listeners
  if (projectsModal) {
    projectsModal.addEventListener('show.bs.modal', function () {
      loadProjectsPanel();
      this.removeAttribute('aria-hidden');
    });

    projectsModal.addEventListener('hide.bs.modal', function () {
      const focusedElement = this.querySelector(':focus');
      if (focusedElement) {
        focusedElement.blur();
      }
    });
  }
}

// Load projects panel
async function loadProjectsPanel() {
  const container = document.getElementById('projectsContainer');
  const projects = await getProjects();

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="text-muted text-center py-4">
        <i class="fas fa-project-diagram fa-2x mb-2 opacity-50"></i>
        <p class="small mb-0">No projects yet.<br>Create your first project!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = projects.map(project => `
    <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            data-project-id="${project.id}">
      <div>
        <div class="fw-semibold">${project.name}</div>
        <small class="text-muted">Status: ${project.status}</small>
      </div>
      <i class="fas fa-chevron-right"></i>
    </button>
  `).join('');

  // Add click handlers
  container.querySelectorAll('[data-project-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const projectId = parseInt(btn.dataset.projectId);
      const project = projects.find(p => p.id === projectId);
      if (project) {
        showProjectEditor(project);
      }
    });
  });
}

// Show project editor
async function showProjectEditor(project = null) {
  currentProject = project;
  
  document.getElementById('projectPlaceholder').style.display = 'none';
  document.getElementById('projectEditor').style.display = 'block';

  // Populate phase list dropdown
  await populatePhaseListDropdown('projectPhaseList', project?.phaseListId);

  if (project) {
    // Edit mode
    document.getElementById('projectName').value = project.name;
    document.getElementById('projectDescription').value = project.description || '';
    document.getElementById('projectStatus').value = project.status || 'Ready';
    document.getElementById('deleteProjectBtn').style.display = 'inline-block';
  } else {
    // New mode
    document.getElementById('projectName').value = '';
    document.getElementById('projectDescription').value = '';
    document.getElementById('projectStatus').value = 'Ready';
    document.getElementById('deleteProjectBtn').style.display = 'none';
  }
}

// Hide project editor
function hideProjectEditor() {
  currentProject = null;
  document.getElementById('projectEditor').style.display = 'none';
  document.getElementById('projectPlaceholder').style.display = 'block';
  document.getElementById('projectForm').reset();
}

// Populate phase list dropdown
async function populatePhaseListDropdown(selectId, selectedPhaseListId = null) {
  const select = document.getElementById(selectId);
  const phaseLists = await getPhaseLists();
  
  // Clear existing options except the first (No Phase List)
  select.innerHTML = '<option value="">No Phase List</option>';
  
  // Add phase list options
  phaseLists.forEach(phaseList => {
    const option = document.createElement('option');
    option.value = phaseList.id;
    option.textContent = phaseList.title;
    if (selectedPhaseListId && phaseList.id == selectedPhaseListId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

// Save project form
async function saveProjectForm() {
  const name = document.getElementById('projectName').value.trim();
  const description = document.getElementById('projectDescription').value.trim();
  const status = document.getElementById('projectStatus').value;

  if (!name) {
    showToast('Project name is required', 'error');
    return;
  }

  const projectData = {
    name,
    description,
    status,
    phaseListId: document.getElementById('projectPhaseList').value || null
  };

  if (currentProject) {
    projectData.id = currentProject.id;
  }

  try {
    await saveProject(projectData);
    hideProjectEditor();
    loadProjectsPanel();
    showToast('Project saved', 'success');
  } catch (err) {
    console.error('Error saving project:', err);
    showToast('Failed to save project', 'error');
  }
}

// ===== INITIALIZATION =====

// ===== PUNCH CLOCK =====

/**
 * Initialize punch clock functionality
 */
async function initializePunchClock() {
  const punchClockBtn = document.getElementById('punchClockBtn');
  const punchClockText = document.getElementById('punchClockText');
  const primaryPunchBtn = document.getElementById('primaryPunchBtn');
  const primaryPunchText = document.getElementById('primaryPunchText');
  
  if (!punchClockBtn) return;
  
  // Update button state based on active session
  async function updatePunchClockButton() {
    const activeSession = await getActiveWorkSession();
    const currentActivity = await getCurrentActivity();
    
    if (activeSession) {
      // Display current activity state
      const activityLabels = {
        'work': 'Working',
        'lunch': 'Lunch',
        'meeting': 'Meeting',
        'personal': 'Personal',
        'custom': currentActivity?.description || 'Activity'
      };
      
      const activityText = currentActivity 
        ? activityLabels[currentActivity.category] || currentActivity.description
        : 'Punched In';
      
      punchClockText.textContent = activityText;
      punchClockBtn.classList.remove('btn-outline-primary');
      punchClockBtn.classList.add('btn-outline-danger');
      
      if (primaryPunchBtn && primaryPunchText) {
        primaryPunchText.textContent = 'End Work Day';
        primaryPunchBtn.classList.remove('btn-primary');
        primaryPunchBtn.classList.add('btn-danger');
      }
      
      // Show/hide interruption buttons based on activity
      const interruptionButtons = document.getElementById('interruptionButtons');
      const returnToWorkSection = document.getElementById('returnToWorkSection');
      const interruptionButtonsRow = document.getElementById('interruptionButtonsRow');
      
      if (interruptionButtons) {
        interruptionButtons.style.display = 'block';
      }
      
      if (currentActivity && currentActivity.category !== 'work') {
        if (returnToWorkSection) returnToWorkSection.style.display = 'block';
        if (interruptionButtonsRow) interruptionButtonsRow.style.display = 'none';
      } else {
        if (returnToWorkSection) returnToWorkSection.style.display = 'none';
        if (interruptionButtonsRow) interruptionButtonsRow.style.display = 'block';
      }
    } else {
      punchClockText.textContent = 'Punch In';
      punchClockBtn.classList.remove('btn-outline-danger');
      punchClockBtn.classList.add('btn-outline-primary');
      
      if (primaryPunchBtn && primaryPunchText) {
        primaryPunchText.textContent = 'Start Work Day';
        primaryPunchBtn.classList.remove('btn-danger');
        primaryPunchBtn.classList.add('btn-primary');
      }
      
      // Hide interruption buttons when punched out
      const interruptionButtons = document.getElementById('interruptionButtons');
      if (interruptionButtons) {
        interruptionButtons.style.display = 'none';
      }
    }
  }
  
  // Handle punch in/out action
  async function handlePunchAction() {
    const activeSession = await getActiveWorkSession();
    
    if (activeSession) {
      // Punch out
      const result = await punchOut();
      if (result) {
        showToast(`Punched Out! Total: ${result.totalHours}h`, 'success');
      } else {
        showToast('Failed to punch out', 'error');
      }
    } else {
      // Punch in
      const result = await punchIn();
      if (result) {
        showToast('Punched In! Good luck! 🚀', 'success');
      } else {
        showToast('Failed to punch in', 'error');
      }
    }
    
    // Update button states
    await updatePunchClockButton();
    
    // Close modal if open
    const modal = bootstrap.Modal.getInstance(document.getElementById('punchClockModal'));
    if (modal) {
      modal.hide();
    }
    
    // Update today view if it's active
    if (getCurrentView() === 'today') {
      await renderTasks('today');
    }
  }
  
  // Handle interruption buttons
  async function handleInterruption(category, description) {
    const result = await recordActivity(category, description);
    if (result) {
      const messages = {
        'lunch': 'Enjoy your lunch break! 🍽️',
        'meeting': 'Meeting time - make it productive! 🤝',
        'personal': 'Taking care of personal matters. ⏰',
        'work': 'Back to work! Let\'s be productive! 💼'
      };
      showToast(messages[category] || `${description} activity started.`, 'info');
    } else {
      showToast('Failed to record activity', 'error');
    }
    await updatePunchClockButton();
  }
  
  // Handle header punch button click (opens modal)
  punchClockBtn.addEventListener('click', async () => {
    // Update modal state before showing
    await updatePunchClockButton();
  });
  
  // Handle primary punch button in modal
  if (primaryPunchBtn) {
    primaryPunchBtn.addEventListener('click', handlePunchAction);
  }
  
  // Handle interruption buttons
  const lunchBtn = document.getElementById('lunchBtn');
  const meetingBtn = document.getElementById('meetingBtn');
  const personalBtn = document.getElementById('personalBtn');
  const returnToWorkBtn = document.getElementById('returnToWorkBtn');
  const addCustomInterruptionBtn = document.getElementById('addCustomInterruptionBtn');
  const customInterruptionInput = document.getElementById('customInterruptionInput');
  
  if (lunchBtn) {
    lunchBtn.addEventListener('click', () => handleInterruption('lunch', 'Lunch Break'));
  }
  
  if (meetingBtn) {
    meetingBtn.addEventListener('click', () => handleInterruption('meeting', 'Meeting'));
  }
  
  if (personalBtn) {
    personalBtn.addEventListener('click', () => handleInterruption('personal', 'Personal Time'));
  }
  
  if (returnToWorkBtn) {
    returnToWorkBtn.addEventListener('click', () => handleInterruption('work', 'Work Time'));
  }
  
  if (addCustomInterruptionBtn && customInterruptionInput) {
    const handleCustomInterruption = async () => {
      const description = customInterruptionInput.value.trim();
      if (!description) {
        showToast('Please enter a description for the interruption.', 'warning');
        customInterruptionInput.focus();
        return;
      }
      await handleInterruption('custom', description);
      customInterruptionInput.value = '';
    };
    
    addCustomInterruptionBtn.addEventListener('click', handleCustomInterruption);
    customInterruptionInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleCustomInterruption();
      }
    });
  }
  
  // Initial button state
  await updatePunchClockButton();
}

// ===== APP INITIALIZATION =====

async function initializeApp() {
  console.log('🚀 Initializing Task Time Tracker...');
  
  // Initialize sidebar
  initializeSidebar();
  
  // Setup tab navigation
  setupTabNavigation();
  
  // Setup global event listeners
  setupGlobalEventListeners();
  
  // Setup quick add form
  setupQuickAddForm();
  
  // Setup quick time modal
  setupQuickTimeModal();
  
  // Setup TodoList modal
  initializeTodoListModal();
  
  // Setup CategoryList modal
  initializeCategoryListsModal();
  
  // Setup Projects modal
  initializeProjectsModal();
  
  // Setup PhaseList modal
  initializePhaseListsModal();
  
  // Setup punch clock
  await initializePunchClock();
  
  // Setup drag and drop (for board view)
  initializeDragAndDrop();
  
  // Populate dropdowns
  await populateGlobalFilters();
  await populateQuickAddDropdowns();
  
  // Render initial view (board)
  await renderTasks('board');
  
  console.log('✅ App initialized successfully!');
}

// ===== PAGE LOAD =====

document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});
