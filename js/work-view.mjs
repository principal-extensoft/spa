/**
 * work-view.mjs
 * Work View - Detailed task editing and time tracking workspace
 * 
 * Responsibilities:
 * - Render task editing interface with all fields
 * - Display time tracking panel with quick actions
 * - Show status history and progress tracking
 * - Handle form submission and validation
 * - Manage category lists assignment
 * - Support personal velocity estimation
 * 
 * Dependencies: All service modules, ui-utils, state-service
 */

import { getTasks, saveTask, deleteTask, updateRemainingHours } from './task-service.mjs';
import { getTimeLogs, saveTimeLog, deleteTimeLog } from './timelog-service.mjs';
import { getProjects, getPhaseLists } from './project-service.mjs';
import { getCategoryLists } from './category-service.mjs';
import { showToast, formatHours, roundToQuarter } from './ui-utils.mjs';
import { calculatePersonalVelocity, predictTaskHours, getConfidenceHint, validateScaleEstimates } from './velocity-service.mjs';

// ============================================================
// WORK VIEW RENDERING
// ============================================================

/**
 * Render the Work view
 * @param {HTMLElement} container - Container element to render into
 * @param {number|null} taskId - Optional task ID to load immediately
 * @returns {Promise<void>}
 */
export async function renderWorkView(container, taskId = null) {
  console.log('Rendering Work view', taskId ? `with task ${taskId}` : '');
  
  container.innerHTML = `
    <div class="work-container">
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">
            <i class="fas fa-edit me-2"></i>
            Task Workspace
          </h5>
        </div>
        <div class="card-body">
          <div id="workTaskContent">
            <div class="text-center text-muted py-5">
              <i class="fas fa-clipboard-list fa-3x mb-3"></i>
              <h4>Select a task to start working</h4>
              <p>Choose a task from the Board or Today view to edit and track time.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // If taskId provided, load that task
  if (taskId) {
    await loadTaskIntoWorkView(taskId);
  }
}

/**
 * Load a specific task into the work view
 * @param {number} taskId - Task ID to load
 */
export async function loadTaskIntoWorkView(taskId) {
  const tasks = await getTasks({}, true);
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    console.error('Task not found with ID:', taskId);
    showToast('Task not found', 'error');
    return;
  }
  
  await renderWorkInterface(task);
}

/**
 * Render the detailed work interface for a task
 * @param {object} task - Task object
 */
async function renderWorkInterface(task) {
  console.log('Rendering work interface for task:', task.title);
  
  const workContent = document.getElementById('workTaskContent');
  if (!workContent) {
    console.error('workTaskContent element not found!');
    return;
  }
  
  // Get time logs for this task
  const logs = await getTimeLogs(task.id);
  const totalHours = logs.reduce((sum, log) => sum + log.hours, 0);
  
  workContent.innerHTML = `
    <div class="work-task-header mb-4">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <h4 class="mb-1">${task.title}</h4>
          <div class="text-muted">
            <span class="badge bg-secondary me-2">${task.status}</span>
            <span class="badge bg-${task.urgency === 'High' ? 'danger' : task.urgency === 'Med' ? 'warning' : 'success'} me-2">${task.urgency}</span>
            <span class="badge bg-info">${task.importance}</span>
          </div>
        </div>
        <div class="text-end">
          <div class="h5 mb-1">${totalHours.toFixed(1)}h logged</div>
          <div class="text-muted">${task.estimate ? `of ${task.estimate}h estimated` : 'No estimate'}</div>
        </div>
      </div>
    </div>
    
    <div class="row g-4">
      <!-- Task Details Form -->
      <div class="col-lg-8">
        <div class="card">
          <div class="card-header">
            <h6 class="mb-0"><i class="fas fa-tasks me-2"></i>Task Details</h6>
          </div>
          <div class="card-body">
            <form id="workTaskForm">
              <input type="hidden" id="workTaskId" value="${task.id}">
              
              <div class="mb-3">
                <label for="workTaskTitle" class="form-label">Title</label>
                <input type="text" class="form-control" id="workTaskTitle" value="${task.title}" required>
              </div>
              
              <div class="row mb-3">
                <div class="col-md-4">
                  <label for="workTaskDueDate" class="form-label">Due Date</label>
                  <input type="date" class="form-control" id="workTaskDueDate" value="${task.dueOn}">
                </div>
                <div class="col-md-4">
                  <label for="workTaskEstimate" class="form-label">Estimate (hours)</label>
                  <input type="number" class="form-control" id="workTaskEstimate" step="0.25" min="0" value="${task.estimate || ''}">
                </div>
                <div class="col-md-4">
                  <label for="workTaskRemaining" class="form-label">Remaining (hours)</label>
                  <input type="number" class="form-control" id="workTaskRemaining" step="0.1" min="0" value="${task.remainingHours || 0}">
                </div>
              </div>
              
              <div class="row mb-3">
                <div class="col-md-4">
                  <label for="workTaskStatus" class="form-label">Status</label>
                  <select class="form-select" id="workTaskStatus">
                    <option value="Ready" ${task.status === 'Ready' ? 'selected' : ''}>Ready</option>
                    <option value="Estimated" ${task.status === 'Estimated' ? 'selected' : ''}>Estimated</option>
                    <option value="InProgress" ${task.status === 'InProgress' ? 'selected' : ''}>In Progress</option>
                    <option value="Blocked" ${task.status === 'Blocked' ? 'selected' : ''}>Blocked</option>
                    <option value="Backburner" ${task.status === 'Backburner' ? 'selected' : ''}>Backburner</option>
                    <option value="OnHold" ${task.status === 'OnHold' ? 'selected' : ''}>On Hold</option>
                    <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                    <option value="Abandoned" ${task.status === 'Abandoned' ? 'selected' : ''}>Abandoned</option>
                    <option value="Archived" ${task.status === 'Archived' ? 'selected' : ''}>Archived</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label for="workTaskUrgency" class="form-label">Urgency</label>
                  <select class="form-select" id="workTaskUrgency">
                    <option value="Low" ${task.urgency === 'Low' ? 'selected' : ''}>Low</option>
                    <option value="Med" ${task.urgency === 'Med' ? 'selected' : ''}>Medium</option>
                    <option value="High" ${task.urgency === 'High' ? 'selected' : ''}>High</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label for="workTaskImportance" class="form-label">Importance</label>
                  <select class="form-select" id="workTaskImportance">
                    <option value="Low" ${task.importance === 'Low' ? 'selected' : ''}>Low</option>
                    <option value="Med" ${task.importance === 'Med' ? 'selected' : ''}>Medium</option>
                    <option value="High" ${task.importance === 'High' ? 'selected' : ''}>High</option>
                  </select>
                </div>
              </div>
              
              <div class="row mb-3">
                <div class="col-md-6">
                  <label for="workTaskProject" class="form-label">Project</label>
                  <select class="form-select" id="workTaskProject">
                    <option value="">No Project (AdHoc)</option>
                    <!-- Projects will be populated here -->
                  </select>
                </div>
                <div class="col-md-6">
                  <label for="workTaskPhase" class="form-label">Phase</label>
                  <select class="form-select" id="workTaskPhase">
                    <option value="">No Phase</option>
                    <!-- Phases will be populated here -->
                  </select>
                </div>
              </div>
              
              <div class="mb-3">
                <label for="workTaskDescription" class="form-label">Description</label>
                <textarea class="form-control" id="workTaskDescription" rows="4">${task.description || ''}</textarea>
              </div>
              
              <div class="mb-3">
                <label for="workTaskNotes" class="form-label">Notes</label>
                <textarea class="form-control" id="workTaskNotes" rows="6" placeholder="Add detailed notes, progress updates, reminders...">${task.notes || ''}</textarea>
                <div class="form-text">Use this space for detailed notes, progress updates, links, or any other information.</div>
              </div>
              
              <!-- Personal Scale Estimation -->
              <div class="mb-3">
                <label class="form-label">
                  <i class="fas fa-chart-line me-2"></i>Personal Scale Estimation
                </label>
                <div class="estimation-panel p-3 border rounded bg-light">
                  <!-- Scale Estimates -->
                  <div class="row g-3 mb-3">
                    <div class="col-md-4">
                      <label for="estimateLow" class="form-label small">Low Estimate</label>
                      <input type="range" class="form-range" id="estimateLow" min="1" max="10" step="1" value="${task.estimationData?.scale?.low || 3}">
                      <div class="d-flex justify-content-between">
                        <small class="text-muted">1</small>
                        <span class="fw-bold" id="estimateLowValue">${task.estimationData?.scale?.low || 3}</span>
                        <small class="text-muted">10</small>
                      </div>
                    </div>
                    <div class="col-md-4">
                      <label for="estimateExpected" class="form-label small">Expected Estimate</label>
                      <input type="range" class="form-range" id="estimateExpected" min="1" max="10" step="1" value="${task.estimationData?.scale?.expected || 5}">
                      <div class="d-flex justify-content-between">
                        <small class="text-muted">1</small>
                        <span class="fw-bold" id="estimateExpectedValue">${task.estimationData?.scale?.expected || 5}</span>
                        <small class="text-muted">10</small>
                      </div>
                    </div>
                    <div class="col-md-4">
                      <label for="estimateHigh" class="form-label small">High Estimate</label>
                      <input type="range" class="form-range" id="estimateHigh" min="1" max="10" step="1" value="${task.estimationData?.scale?.high || 7}">
                      <div class="d-flex justify-content-between">
                        <small class="text-muted">1</small>
                        <span class="fw-bold" id="estimateHighValue">${task.estimationData?.scale?.high || 7}</span>
                        <small class="text-muted">10</small>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Confidence Level -->
                  <div class="mb-3">
                    <label for="estimateConfidence" class="form-label small">Confidence Level</label>
                    <input type="range" class="form-range" id="estimateConfidence" min="0" max="100" step="1" value="${task.estimationData?.confidence || 100}">
                    <div class="d-flex justify-content-between align-items-center">
                      <small class="text-muted">0%</small>
                      <div class="text-center">
                        <span class="fw-bold" id="estimateConfidenceValue">${task.estimationData?.confidence || 100}%</span>
                        <div class="small text-muted" id="confidenceHint">Very confident</div>
                      </div>
                      <small class="text-muted">100%</small>
                    </div>
                  </div>
                  
                  <!-- Velocity Prediction -->
                  <div class="mt-3 p-2 bg-white rounded border">
                    <h6 class="small mb-2"><i class="fas fa-clock me-1"></i>Hour Prediction</h6>
                    <div id="velocityPrediction">
                      <div class="text-muted">Complete more tasks to enable predictions</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Category Lists Management -->
              <div class="mb-3">
                <label class="form-label">
                  <i class="fas fa-tags me-2"></i>Category Lists for Time Tracking
                </label>
                <div class="category-lists-panel p-3 border rounded bg-light">
                  <div id="workTaskCategoryLists">
                    <!-- Category lists will be populated here -->
                  </div>
                  <div class="mt-2">
                    <small class="text-muted">
                      <i class="fas fa-info-circle me-1"></i>
                      Select which category lists to use when logging time for this task
                    </small>
                  </div>
                </div>
              </div>
              
              <div class="d-flex gap-2 justify-content-between">
                <div class="d-flex gap-2">
                  <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save me-2"></i>Save Changes
                  </button>
                  <button type="button" class="btn btn-outline-secondary" id="cancelWorkEdit">
                    <i class="fas fa-times me-2"></i>Cancel
                  </button>
                </div>
                <button type="button" class="btn btn-outline-danger" id="deleteTaskBtn" data-task-id="${task.id}">
                  <i class="fas fa-trash me-2"></i>Delete
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      <!-- Time Logging Panel -->
      <div class="col-lg-4">
        <div class="card">
          <div class="card-header">
            <h6 class="mb-0"><i class="fas fa-clock me-2"></i>Time Tracking</h6>
          </div>
          <div class="card-body">
            <!-- Quick Time Buttons -->
            <div class="mb-3">
              <div class="d-flex gap-2 flex-wrap">
                <button class="btn btn-outline-success quick-time-btn" data-task-id="${task.id}" data-hours="0.25">
                  <i class="fas fa-plus me-1"></i>15m
                </button>
                <button class="btn btn-outline-success quick-time-btn" data-task-id="${task.id}" data-hours="0.5">
                  <i class="fas fa-plus me-1"></i>30m
                </button>
                <button class="btn btn-outline-success quick-time-btn" data-task-id="${task.id}" data-hours="1">
                  <i class="fas fa-plus me-1"></i>1h
                </button>
              </div>
            </div>
            
            <!-- Custom Time Entry -->
            <div class="mb-3">
              <h6>Custom Time Entry</h6>
              <div class="row g-2 mb-2">
                <div class="col">
                  <input type="number" class="form-control" id="customHours" step="0.25" min="0" max="24" placeholder="Hours">
                </div>
                <div class="col-auto">
                  <button class="btn btn-primary" id="logCustomTimeBtn">
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
              </div>
              
              <!-- Category Selector for Time Logging -->
              <div class="mb-2">
                <label class="form-label small text-muted">Category (optional)</label>
                <div id="workCategoryContainer">
                  <select class="form-select" disabled>
                    <option>Loading categories...</option>
                  </select>
                </div>
              </div>
              
              <!-- Date Selection Toggle -->
              <div class="mb-2">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="customDateToggle">
                  <label class="form-check-label text-muted small" for="customDateToggle">
                    Different date?
                  </label>
                </div>
              </div>
              
              <!-- Custom Date Picker -->
              <div id="customDateContainer" style="display: none;" class="mb-2">
                <input type="date" class="form-control form-control-sm" id="customDate" value="${new Date().toISOString().split('T')[0]}">
                <div class="form-text">Select the date when this time was actually worked</div>
              </div>
            </div>
            
            <!-- Time Logs -->
            <div class="mt-3">
              <h6>Recent Time Logs</h6>
              <div id="workTimeLogs" class="time-logs-list">
                <!-- Time logs will be populated here -->
              </div>
            </div>
          </div>
        </div>
        
        <!-- Status History Panel -->
        <div class="card mt-3">
          <div class="card-header">
            <h6 class="mb-0"><i class="fas fa-history me-2"></i>Status History</h6>
          </div>
          <div class="card-body">
            <div id="workStatusHistory" class="status-history-container" style="max-height: 400px; overflow-y: auto;">
              ${renderStatusHistory(task.statusHistory || [])}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Render time logs
  await renderTimeLogsList(logs);
  
  // Render category lists manager
  await renderWorkCategoryListsManager(task);
  
  // Populate project and phase dropdowns
  await populateProjectDropdown(task.projectId);
  await populatePhaseDropdown(task.phaseKey, task.projectId);
  
  // Initialize event handlers
  initializeWorkViewHandlers(task);
}

// ============================================================
// HELPER RENDERING FUNCTIONS
// ============================================================

/**
 * Render status history list
 * @param {Array} statusHistory - Status history array
 * @returns {string} HTML string
 */
function renderStatusHistory(statusHistory) {
  if (!statusHistory || statusHistory.length === 0) {
    return '<p class="text-muted">No status history available</p>';
  }
  
  return statusHistory.map(entry => {
    const date = new Date(entry.timestamp);
    return `
      <div class="status-history-entry mb-2 p-2 border-bottom">
        <div class="d-flex justify-content-between">
          <span class="badge bg-secondary">${entry.status}</span>
          <small class="text-muted">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</small>
        </div>
        ${entry.note ? `<div class="small text-muted mt-1">${entry.note}</div>` : ''}
      </div>
    `;
  }).reverse().join('');
}

/**
 * Render time logs list
 * @param {Array} logs - Time logs array
 */
async function renderTimeLogsList(logs) {
  const container = document.getElementById('workTimeLogs');
  if (!container) return;
  
  if (logs.length === 0) {
    container.innerHTML = '<p class="text-muted small">No time logs yet</p>';
    return;
  }
  
  // Show most recent 5 logs
  const recentLogs = logs.slice(-5).reverse();
  
  container.innerHTML = recentLogs.map(log => `
    <div class="time-log-entry mb-2 p-2 border rounded" data-log-id="${log.id}">
      <div class="d-flex justify-content-between align-items-center">
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between">
            <strong>${log.hours.toFixed(2)}h</strong>
            <small class="text-muted">${new Date(log.dateLogged).toLocaleDateString()}</small>
          </div>
          ${log.categoryKey ? `<div class="small text-muted">${log.categoryKey}</div>` : ''}
          ${log.notes ? `<div class="small">${log.notes}</div>` : ''}
        </div>
        <button class="btn btn-sm btn-outline-danger ms-2 delete-log-btn" data-log-id="${log.id}" title="Delete time entry">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="delete-confirm mt-2" style="display: none;">
        <div class="alert alert-warning mb-2 py-2 small">
          <i class="fas fa-exclamation-triangle me-1"></i>
          Remove this time entry? This cannot be undone.
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-danger confirm-delete-btn" data-log-id="${log.id}">
            <i class="fas fa-check me-1"></i>Yes, Remove
          </button>
          <button class="btn btn-sm btn-secondary cancel-delete-btn">
            <i class="fas fa-times me-1"></i>Cancel
          </button>
        </div>
      </div>
    </div>
  `).join('');
  
  // Add event listeners for delete buttons
  container.querySelectorAll('.delete-log-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const logEntry = btn.closest('.time-log-entry');
      const confirmSection = logEntry.querySelector('.delete-confirm');
      confirmSection.style.display = 'block';
      btn.style.display = 'none';
    });
  });
  
  // Add event listeners for confirm delete
  container.querySelectorAll('.confirm-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const logId = parseInt(btn.dataset.logId);
      await handleDeleteTimeLog(logId);
    });
  });
  
  // Add event listeners for cancel delete
  container.querySelectorAll('.cancel-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const logEntry = btn.closest('.time-log-entry');
      const confirmSection = logEntry.querySelector('.delete-confirm');
      const deleteBtn = logEntry.querySelector('.delete-log-btn');
      confirmSection.style.display = 'none';
      deleteBtn.style.display = 'block';
    });
  });
}

/**
 * Render work category lists manager
 * @param {object} task - Task object
 */
async function renderWorkCategoryListsManager(task) {
  const container = document.getElementById('workTaskCategoryLists');
  if (!container) return;
  
  const allCategoryLists = await getCategoryLists();
  
  if (allCategoryLists.length === 0) {
    container.innerHTML = `
      <div class="text-muted">
        <i class="fas fa-plus-circle me-2"></i>
        No category lists available. Create one in Settings to enable time categorization.
      </div>
    `;
    return;
  }
  
  const taskCategoryLists = task.categoryLists || [];
  
  let html = '<div class="row g-2">';
  
  allCategoryLists.forEach(categoryList => {
    const isAssigned = taskCategoryLists.includes(categoryList.slug);
    
    html += `
      <div class="col-md-6">
        <div class="form-check">
          <input class="form-check-input category-list-checkbox" 
                 type="checkbox" 
                 id="categoryList_${categoryList.slug}" 
                 value="${categoryList.slug}"
                 ${isAssigned ? 'checked' : ''}>
          <label class="form-check-label" for="categoryList_${categoryList.slug}">
            <strong>${categoryList.title}</strong>
            <div class="small text-muted">${categoryList.categories.length} categories</div>
          </label>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Populate project dropdown
 * @param {number} selectedProjectId - Currently selected project ID
 */
async function populateProjectDropdown(selectedProjectId) {
  const dropdown = document.getElementById('workTaskProject');
  if (!dropdown) return;
  
  const projects = await getProjects();
  
  let html = '<option value="">No Project (AdHoc)</option>';
  projects.forEach(project => {
    html += `<option value="${project.id}" ${project.id === selectedProjectId ? 'selected' : ''}>${project.name}</option>`;
  });
  
  dropdown.innerHTML = html;
}

/**
 * Populate phase dropdown
 * @param {string} selectedPhaseKey - Currently selected phase key
 * @param {number} projectId - Filter by project ID
 */
async function populatePhaseDropdown(selectedPhaseKey, projectId) {
  const dropdown = document.getElementById('workTaskPhase');
  if (!dropdown) return;
  
  const phaseLists = await getPhaseLists();
  
  let html = '<option value="">No Phase</option>';
  
  phaseLists.forEach(phaseList => {
    phaseList.phases.forEach(phase => {
      const phaseKey = `${phaseList.slug}.${phase.slug}`;
      html += `<option value="${phaseKey}" ${phaseKey === selectedPhaseKey ? 'selected' : ''}>${phaseList.title}: ${phase.title}</option>`;
    });
  });
  
  dropdown.innerHTML = html;
}

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Initialize all work view event handlers
 * @param {object} task - Current task being edited
 */
function initializeWorkViewHandlers(task) {
  // Form submit handler
  const form = document.getElementById('workTaskForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleWorkFormSubmit(task);
    });
  }
  
  // Cancel button
  const cancelBtn = document.getElementById('cancelWorkEdit');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      renderWorkView(document.getElementById('workTaskContent').parentElement.parentElement.parentElement);
    });
  }
  
  // Delete button
  const deleteBtn = document.getElementById('deleteTaskBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this task?')) {
        await deleteTask(task.id);
        showToast('Task deleted successfully', 'success');
        renderWorkView(document.getElementById('workTaskContent').parentElement.parentElement.parentElement);
      }
    });
  }
  
  // Project change handler
  const projectDropdown = document.getElementById('workTaskProject');
  if (projectDropdown) {
    projectDropdown.addEventListener('change', async function() {
      await populatePhaseDropdown(null, this.value);
    });
  }
  
  // Custom date toggle
  const customDateToggle = document.getElementById('customDateToggle');
  const customDateContainer = document.getElementById('customDateContainer');
  if (customDateToggle && customDateContainer) {
    customDateToggle.addEventListener('change', () => {
      customDateContainer.style.display = customDateToggle.checked ? 'block' : 'none';
    });
  }
  
  // Initialize estimation sliders
  initializeEstimationSliders();
  
  // Render category selector for time logging
  renderCategorySelector(task);
  
  // Quick time buttons
  document.querySelectorAll('.quick-time-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const hours = parseFloat(btn.dataset.hours);
      await logQuickTime(task.id, hours);
    });
  });
  
  // Custom time log button
  const logCustomTimeBtn = document.getElementById('logCustomTimeBtn');
  if (logCustomTimeBtn) {
    logCustomTimeBtn.addEventListener('click', async () => {
      const hours = parseFloat(document.getElementById('customHours').value);
      if (hours > 0) {
        await logQuickTime(task.id, hours);
        document.getElementById('customHours').value = '';
      }
    });
  }
  
  // Auto-sync remaining hours when estimate changes
  const estimateInput = document.getElementById('workTaskEstimate');
  const remainingInput = document.getElementById('workTaskRemaining');
  
  if (estimateInput && remainingInput) {
    estimateInput.addEventListener('input', () => {
      const estimateValue = parseFloat(estimateInput.value) || 0;
      const currentRemaining = parseFloat(remainingInput.value) || 0;
      
      // Auto-sync if remaining is 0 or equals previous estimate
      if (currentRemaining === 0 || remainingInput.value === '' || 
          currentRemaining === parseFloat(estimateInput.getAttribute('data-previous-value') || 0)) {
        remainingInput.value = estimateValue;
      }
      
      estimateInput.setAttribute('data-previous-value', estimateValue);
    });
    
    estimateInput.setAttribute('data-previous-value', estimateInput.value || 0);
  }
}

/**
 * Handle work form submission
 * @param {object} originalTask - Original task object
 */
async function handleWorkFormSubmit(originalTask) {
  const taskId = parseInt(document.getElementById('workTaskId').value);
  
  // Get selected category lists
  const selectedCategoryLists = Array.from(document.querySelectorAll('.category-list-checkbox:checked'))
    .map(cb => cb.value);
  
  const updatedTask = {
    ...originalTask,
    title: document.getElementById('workTaskTitle').value,
    dueOn: document.getElementById('workTaskDueDate').value,
    estimate: parseFloat(document.getElementById('workTaskEstimate').value) || null,
    remainingHours: parseFloat(document.getElementById('workTaskRemaining').value) || 0,
    status: document.getElementById('workTaskStatus').value,
    urgency: document.getElementById('workTaskUrgency').value,
    importance: document.getElementById('workTaskImportance').value,
    projectId: document.getElementById('workTaskProject').value ? parseInt(document.getElementById('workTaskProject').value) : null,
    phaseKey: document.getElementById('workTaskPhase').value || null,
    description: document.getElementById('workTaskDescription').value,
    notes: document.getElementById('workTaskNotes').value,
    categoryLists: selectedCategoryLists,
    estimationData: {
      scale: {
        low: parseInt(document.getElementById('estimateLow').value),
        expected: parseInt(document.getElementById('estimateExpected').value),
        high: parseInt(document.getElementById('estimateHigh').value)
      },
      confidence: parseInt(document.getElementById('estimateConfidence').value),
      estimatedAt: new Date().toISOString()
    }
  };
  
  const success = await saveTask(updatedTask, true);
  if (success) {
    showToast('Task updated successfully!', 'success');
    
    // Navigate to board view to see the updated task in swimlanes
    const boardTab = document.getElementById('boardTab');
    if (boardTab) {
      boardTab.click();
    }
  }
  // Note: If save fails, service layer shows validation error, so no need for generic error toast
}

/**
 * Render category selector for time logging
 * @param {object} task - Task object
 */
async function renderCategorySelector(task) {
  const container = document.getElementById('workCategoryContainer');
  if (!container) return;
  
  const categoryLists = task.categoryLists || [];
  
  if (categoryLists.length === 0) {
    container.innerHTML = `
      <select class="form-select" disabled>
        <option>No categories available</option>
      </select>
      <small class="form-text text-muted">Add category lists to this task to enable categorization</small>
    `;
    return;
  }
  
  // Get all category lists and filter to those assigned to task
  const { getCategoryLists } = await import('./category-service.mjs');
  const allCategoryLists = await getCategoryLists();
  const assignedLists = allCategoryLists.filter(list => categoryLists.includes(list.slug));
  
  // Collect all categories
  const categories = [];
  for (const list of assignedLists) {
    if (list.categories && list.categories.length > 0) {
      list.categories.forEach(cat => {
        categories.push({
          key: cat.slug,
          listTitle: list.title,
          categoryTitle: cat.title
        });
      });
    }
  }
  
  if (categories.length === 0) {
    container.innerHTML = `
      <select class="form-select" disabled>
        <option>No categories available</option>
      </select>
      <small class="form-text text-muted">Add categories to the assigned category lists</small>
    `;
    return;
  }
  
  // Group categories by list
  const groupedCategories = categories.reduce((groups, cat) => {
    if (!groups[cat.listTitle]) {
      groups[cat.listTitle] = [];
    }
    groups[cat.listTitle].push(cat);
    return groups;
  }, {});
  
  let optionsHtml = '<option value="">Select category (optional)</option>';
  
  Object.keys(groupedCategories).forEach(listTitle => {
    optionsHtml += `<optgroup label="${listTitle}">`;
    groupedCategories[listTitle].forEach(cat => {
      optionsHtml += `<option value="${cat.key}">${cat.categoryTitle}</option>`;
    });
    optionsHtml += '</optgroup>';
  });
  
  container.innerHTML = `
    <select class="form-select category-selector" id="workCategorySelect">
      ${optionsHtml}
    </select>
  `;
}

/**
 * Log quick time for a task
 * @param {number} taskId - Task ID
 * @param {number} hours - Hours to log
 */
async function logQuickTime(taskId, hours, onSuccess) {
  const customDateToggle = document.getElementById('customDateToggle');
  const customDate = document.getElementById('customDate');
  const categorySelect = document.getElementById('workCategorySelect');
  
  const dateLogged = customDateToggle?.checked && customDate 
    ? customDate.value 
    : new Date().toISOString().split('T')[0];
  
  const timeLog = {
    taskId: taskId,
    hours: hours,
    dateLogged: dateLogged,
    categoryKey: categorySelect?.value || null,
    notes: `Quick log: ${hours}h`
  };
  
  const logSuccess = await saveTimeLog(timeLog);
  if (!logSuccess) {
    // Service layer already showed validation error, no need for generic error
    return;
  }
  
  // Get the task to check remaining hours
  const tasks = await getTasks({}, true);
  const task = tasks.find(t => t.id === taskId);
  
  let message = `${hours}h logged`;
  
  if (task && task.remainingHours !== null && task.remainingHours !== undefined) {
    // Decrement remaining hours and round to nearest quarter hour
    const newRemaining = roundToQuarter(Math.max(0, task.remainingHours - hours));
    console.log(`Decrementing remaining hours: ${task.remainingHours}h -> ${newRemaining}h (logged ${hours}h)`);
    const updateSuccess = await updateRemainingHours(taskId, newRemaining, `Auto-decremented by ${hours}h time log`);
    if (updateSuccess) {
      message += ` and remaining hours updated!`;
    }
  }
  
  showToast(message, 'success');
  
  // Clear category selection
  if (categorySelect) {
    categorySelect.value = '';
  }
  
  // Reload the task to update time logs (work view)
  await loadTaskIntoWorkView(taskId);
  
  // Call success callback to refresh other views (e.g., board view)
  if (onSuccess && typeof onSuccess === 'function') {
    await onSuccess();
  }
}

/**
 * Handle deleting a time log entry
 * @param {number} logId - Time log ID to delete
 */
async function handleDeleteTimeLog(logId) {
  console.log('Deleting time log:', logId);
  
  // Get the time log to retrieve task ID and hours before deletion
  const allLogs = await getTimeLogs();
  const timeLog = allLogs.find(log => log.id === logId);
  
  if (!timeLog) {
    showToast('Time log not found', 'error');
    return;
  }
  
  const taskId = timeLog.taskId;
  const hours = timeLog.hours;
  
  // Delete the time log
  const success = await deleteTimeLog(logId);
  if (!success) {
    // Service layer handles errors
    return;
  }
  
  // Increment remaining hours back (reverse the decrement) and round to nearest quarter
  const tasks = await getTasks({}, true);
  const task = tasks.find(t => t.id === taskId);
  
  if (task && task.remainingHours !== null && task.remainingHours !== undefined) {
    const newRemaining = roundToQuarter(task.remainingHours + hours);
    await updateRemainingHours(taskId, newRemaining, `Restored ${hours}h from deleted time log`);
  }
  
  showToast('Time entry removed', 'success');
  
  // Reload the task to refresh the time logs display
  await loadTaskIntoWorkView(taskId);
}

// ============================================================
// ESTIMATION SLIDER FUNCTIONS
// ============================================================

/**
 * Initialize estimation sliders with validation and velocity prediction
 */
async function initializeEstimationSliders() {
  const lowSlider = document.getElementById('estimateLow');
  const expectedSlider = document.getElementById('estimateExpected');
  const highSlider = document.getElementById('estimateHigh');
  const confidenceSlider = document.getElementById('estimateConfidence');
  
  if (!lowSlider || !expectedSlider || !highSlider || !confidenceSlider) {
    return; // Sliders not present on page
  }
  
  // Update slider values and enforce validation
  function updateSliderValues() {
    const low = parseInt(lowSlider.value);
    const expected = parseInt(expectedSlider.value);
    const high = parseInt(highSlider.value);
    const confidence = parseInt(confidenceSlider.value);
    
    // Update value displays
    document.getElementById('estimateLowValue').textContent = low;
    document.getElementById('estimateExpectedValue').textContent = expected;
    document.getElementById('estimateHighValue').textContent = high;
    document.getElementById('estimateConfidenceValue').textContent = `${confidence}%`;
    
    // Update confidence hint
    const confidenceHint = document.getElementById('confidenceHint');
    if (confidenceHint) {
      confidenceHint.textContent = getConfidenceHint(confidence);
    }
    
    // Validate scale estimates
    const validation = validateScaleEstimates(low, expected, high);
    
    // Enforce constraints
    if (low > expected) {
      lowSlider.value = expected;
      document.getElementById('estimateLowValue').textContent = expected;
    }
    
    if (expected < low) {
      expectedSlider.value = low;
      document.getElementById('estimateExpectedValue').textContent = low;
    }
    
    if (expected > high) {
      expectedSlider.value = high;
      document.getElementById('estimateExpectedValue').textContent = high;
    }
    
    if (high < expected) {
      highSlider.value = expected;
      document.getElementById('estimateHighValue').textContent = expected;
    }
    
    // Update velocity prediction
    updateVelocityPrediction();
  }
  
  // Add event listeners
  lowSlider.addEventListener('input', updateSliderValues);
  expectedSlider.addEventListener('input', updateSliderValues);
  highSlider.addEventListener('input', updateSliderValues);
  confidenceSlider.addEventListener('input', updateSliderValues);
  
  // Initial setup
  updateSliderValues();
}

/**
 * Update velocity prediction display based on current slider values
 */
async function updateVelocityPrediction() {
  const predictionDiv = document.getElementById('velocityPrediction');
  if (!predictionDiv) return;
  
  const lowSlider = document.getElementById('estimateLow');
  const expectedSlider = document.getElementById('estimateExpected');
  const highSlider = document.getElementById('estimateHigh');
  const confidenceSlider = document.getElementById('estimateConfidence');
  
  if (!lowSlider || !expectedSlider || !highSlider || !confidenceSlider) return;
  
  const estimationData = {
    scale: {
      low: parseInt(lowSlider.value),
      expected: parseInt(expectedSlider.value),
      high: parseInt(highSlider.value)
    },
    confidence: parseInt(confidenceSlider.value)
  };
  
  const prediction = await predictTaskHours(estimationData);
  
  if (!prediction.canPredict) {
    predictionDiv.innerHTML = `
      <div class="text-muted">
        <i class="fas fa-info-circle me-1"></i>
        ${prediction.message}
      </div>
    `;
    return;
  }
  
  predictionDiv.innerHTML = `
    <div class="row g-3 text-center">
      <div class="col-4">
        <div class="text-muted mb-1" style="font-size: 0.85rem;">Low</div>
        <div class="fw-bold text-success fs-6">${prediction.low.toFixed(1)}h</div>
      </div>
      <div class="col-4">
        <div class="text-muted mb-1" style="font-size: 0.85rem;">Expected</div>
        <div class="fw-bold text-primary fs-6">${prediction.expected.toFixed(1)}h</div>
      </div>
      <div class="col-4">
        <div class="text-muted mb-1" style="font-size: 0.85rem;">High</div>
        <div class="fw-bold text-warning fs-6">${prediction.high.toFixed(1)}h</div>
      </div>
    </div>
    <div class="text-center mt-3">
      <div class="text-muted" style="font-size: 0.8rem;">
        Based on ${prediction.sampleSize} completed task${prediction.sampleSize === 1 ? '' : 's'}<br>
        Personal velocity: ${prediction.velocity.toFixed(2)}h per scale point
      </div>
    </div>
  `;
}

// ============================================================
// PUBLIC API
// ============================================================

export {
  renderWorkInterface,
  handleWorkFormSubmit,
  logQuickTime
};
