/**
 * reports-view.mjs
 * Reports View - Comprehensive reporting and analytics
 * 
 * Responsibilities:
 * - Render report generation interface
 * - Generate custom reports with multiple sections
 * - Display executive summary, time sheets, task progress
 * - Show category analytics and work session stats
 * - Export reports as markdown
 * 
 * Dependencies: All service modules, ui-utils
 */

import { getTasks } from './task-service.mjs';
import { getAllTimeLogs } from './timelog-service.mjs';
import { getTodos, getAccomplishments } from './daily-service.mjs';
import { calculateCategoryTimeSummaries } from './category-service.mjs';
import { formatHours, formatDate } from './ui-utils.mjs';
import { calculatePersonalVelocity } from './velocity-service.mjs';

// Store current report data for export
let currentReportData = null;

// ============================================================
// REPORTS VIEW RENDERING
// ============================================================

/**
 * Render the Reports view
 * @param {HTMLElement} container - Container element to render into
 * @returns {Promise<void>}
 */
export async function renderReportsView(container) {
  console.log('Rendering Reports view');
  
  container.innerHTML = `
    <div class="reports-container">
      <div class="row g-4">
        <!-- Report Controls -->
        <div class="col-lg-4">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">
                <i class="fas fa-cog me-2"></i>
                Report Settings
              </h5>
            </div>
            <div class="card-body">
              <!-- Time Period Selection -->
              <div class="mb-3">
                <label class="form-label">Time Period</label>
                <select class="form-select" id="reportPeriod">
                  <option value="thisWeek">This Week</option>
                  <option value="lastWeek">Last Week</option>
                  <option value="thisMonth">This Month</option>
                  <option value="lastMonth">Last Month</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              
              <!-- Custom Date Range -->
              <div id="customDateRange" style="display: none;">
                <div class="row g-2 mb-3">
                  <div class="col">
                    <label class="form-label small">From</label>
                    <input type="date" class="form-control" id="reportStartDate">
                  </div>
                  <div class="col">
                    <label class="form-label small">To</label>
                    <input type="date" class="form-control" id="reportEndDate">
                  </div>
                </div>
              </div>
              
              <!-- Report Type Selection -->
              <div class="mb-3">
                <label class="form-label">Report Sections</label>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="includeExecutiveSummary" checked>
                  <label class="form-check-label" for="includeExecutiveSummary">
                    Executive Summary
                  </label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="includeTimesheet" checked>
                  <label class="form-check-label" for="includeTimesheet">
                    Time Summary
                  </label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="includeTaskProgress" checked>
                  <label class="form-check-label" for="includeTaskProgress">
                    Task Progress
                  </label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="includeAccomplishments" checked>
                  <label class="form-check-label" for="includeAccomplishments">
                    Accomplishments
                  </label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="includeCategoryAnalytics" checked>
                  <label class="form-check-label" for="includeCategoryAnalytics">
                    Category Analytics
                  </label>
                </div>
              </div>
              
              <!-- Generate Button -->
              <button class="btn btn-primary w-100 mb-2" id="generateReportBtn">
                <i class="fas fa-chart-line me-2"></i>
                Generate Report
              </button>
              
              <!-- Export Button -->
              <button class="btn btn-outline-success w-100" id="exportReportBtn" disabled>
                <i class="fas fa-download me-2"></i>
                Export as Markdown
              </button>
            </div>
          </div>
        </div>
        
        <!-- Report Preview -->
        <div class="col-lg-8">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">
                <i class="fas fa-file-alt me-2"></i>
                Report Preview
              </h5>
            </div>
            <div class="card-body">
              <div id="reportPreview" class="report-preview">
                <div class="text-center text-muted py-5">
                  <i class="fas fa-chart-bar fa-3x mb-3"></i>
                  <h4>Ready to Generate Report</h4>
                  <p>Select your preferences and click "Generate Report" to create your custom report.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Initialize event handlers
  initializeReportsViewHandlers();
}

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Initialize reports view event handlers
 */
function initializeReportsViewHandlers() {
  // Period selector
  const periodSelector = document.getElementById('reportPeriod');
  if (periodSelector) {
    periodSelector.addEventListener('change', updateReportDates);
  }
  
  // Generate report button
  const generateBtn = document.getElementById('generateReportBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', generateReport);
  }
  
  // Export button
  const exportBtn = document.getElementById('exportReportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportReportAsMarkdown);
  }
}

/**
 * Update date range visibility based on period selection
 */
function updateReportDates() {
  const period = document.getElementById('reportPeriod').value;
  const customRange = document.getElementById('customDateRange');
  const startDate = document.getElementById('reportStartDate');
  const endDate = document.getElementById('reportEndDate');
  
  if (period === 'custom') {
    customRange.style.display = 'block';
    if (!startDate.value) {
      startDate.value = new Date().toISOString().split('T')[0];
    }
    if (!endDate.value) {
      endDate.value = new Date().toISOString().split('T')[0];
    }
  } else {
    customRange.style.display = 'none';
  }
}

// ============================================================
// REPORT GENERATION
// ============================================================

/**
 * Generate report based on user selections
 */
async function generateReport() {
  const period = document.getElementById('reportPeriod').value;
  const includeExecutiveSummary = document.getElementById('includeExecutiveSummary').checked;
  const includeTimesheet = document.getElementById('includeTimesheet').checked;
  const includeTaskProgress = document.getElementById('includeTaskProgress').checked;
  const includeAccomplishments = document.getElementById('includeAccomplishments').checked;
  const includeCategoryAnalytics = document.getElementById('includeCategoryAnalytics').checked;
  
  // Calculate date range
  let startDate, endDate, periodLabel;
  const today = new Date();
  
  switch (period) {
    case 'thisWeek':
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      startDate = startOfWeek.toISOString().split('T')[0];
      endDate = endOfWeek.toISOString().split('T')[0];
      periodLabel = 'This Week';
      break;
    case 'lastWeek':
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      startDate = lastWeekStart.toISOString().split('T')[0];
      endDate = lastWeekEnd.toISOString().split('T')[0];
      periodLabel = 'Last Week';
      break;
    case 'thisMonth':
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      startDate = startOfMonth.toISOString().split('T')[0];
      endDate = endOfMonth.toISOString().split('T')[0];
      periodLabel = 'This Month';
      break;
    case 'lastMonth':
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      startDate = lastMonthStart.toISOString().split('T')[0];
      endDate = lastMonthEnd.toISOString().split('T')[0];
      periodLabel = 'Last Month';
      break;
    case 'custom':
      startDate = document.getElementById('reportStartDate').value;
      endDate = document.getElementById('reportEndDate').value;
      periodLabel = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
      break;
  }
  
  try {
    // Generate report data
    const reportData = await generateReportData(startDate, endDate, periodLabel, {
      includeExecutiveSummary,
      includeTimesheet,
      includeTaskProgress,
      includeAccomplishments,
      includeCategoryAnalytics
    });
    
    currentReportData = reportData;
    
    // Render report preview
    const preview = document.getElementById('reportPreview');
    preview.innerHTML = await generateReportHTML(reportData);
    
    // Enable export button
    document.getElementById('exportReportBtn').disabled = false;
    
  } catch (err) {
    console.error('Error generating report:', err);
    alert('Error generating report: ' + err.message);
  }
}

/**
 * Generate report data from database
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} periodLabel - Human-readable period label
 * @param {object} options - Report options
 * @returns {Promise<object>} Report data object
 */
async function generateReportData(startDate, endDate, periodLabel, options) {
  // Get all data
  const allTasks = await getTasks({}, true);
  const allTimeLogs = await getAllTimeLogs();
  const allTodos = await getTodos(true);
  const allAccomplishments = await getAccomplishments();
  
  // Filter time logs by date range
  const timeLogs = allTimeLogs.filter(log => 
    log.dateLogged >= startDate && log.dateLogged <= endDate
  );
  
  // Filter todos and accomplishments by date range
  const todos = allTodos.filter(todo => {
    const todoDate = todo.createdAt?.split('T')[0] || todo.date;
    return todoDate >= startDate && todoDate <= endDate;
  });
  
  const accomplishments = allAccomplishments.filter(acc => {
    const accDate = acc.createdAt?.split('T')[0] || acc.date;
    return accDate >= startDate && accDate <= endDate;
  });
  
  // Calculate time summary
  const timeByTask = {};
  let totalHours = 0;
  
  for (const log of timeLogs) {
    if (!timeByTask[log.taskId]) {
      const task = allTasks.find(t => t.id === log.taskId);
      timeByTask[log.taskId] = {
        task: task,
        hours: 0,
        logs: []
      };
    }
    timeByTask[log.taskId].hours += log.hours;
    timeByTask[log.taskId].logs.push(log);
    totalHours += log.hours;
  }
  
  // Tasks completed in period
  const tasksCompletedInPeriod = [];
  const tasksAbandonedInPeriod = [];
  
  for (const task of allTasks) {
    if (task.statusHistory) {
      const completionEntry = task.statusHistory.find(entry => entry.status === 'Completed');
      if (completionEntry) {
        const completionDate = completionEntry.timestamp.split('T')[0];
        if (completionDate >= startDate && completionDate <= endDate) {
          tasksCompletedInPeriod.push({
            ...task,
            completedAt: completionEntry.timestamp
          });
        }
      }
      
      const abandonedEntry = task.statusHistory.find(entry => entry.status === 'Abandoned');
      if (abandonedEntry) {
        const abandonedDate = abandonedEntry.timestamp.split('T')[0];
        if (abandonedDate >= startDate && abandonedDate <= endDate) {
          tasksAbandonedInPeriod.push({
            ...task,
            abandonedAt: abandonedEntry.timestamp
          });
        }
      }
    }
  }
  
  // Status transition analytics
  const statusTransitions = {
    created: 0,
    estimated: 0,
    started: 0,
    blocked: 0,
    completed: 0,
    abandoned: 0
  };
  
  for (const task of allTasks) {
    if (task.statusHistory) {
      for (const entry of task.statusHistory) {
        const entryDate = entry.timestamp.split('T')[0];
        if (entryDate >= startDate && entryDate <= endDate) {
          switch (entry.status) {
            case 'Ready':
              if (entry.note && entry.note.includes('created')) statusTransitions.created++;
              break;
            case 'Estimated':
              statusTransitions.estimated++;
              break;
            case 'InProgress':
              statusTransitions.started++;
              break;
            case 'Blocked':
              statusTransitions.blocked++;
              break;
            case 'Completed':
              statusTransitions.completed++;
              break;
            case 'Abandoned':
              statusTransitions.abandoned++;
              break;
          }
        }
      }
    }
  }
  
  // Category analytics
  const categoryAnalytics = calculateCategoryTimeSummaries(timeLogs);
  
  // Active tasks with activity in the period
  const activeTasks = allTasks.filter(task => 
    ['InProgress', 'Blocked', 'Backburner', 'OnHold'].includes(task.status) &&
    timeLogs.some(log => log.taskId === task.id)
  );
  
  return {
    period: periodLabel,
    startDate,
    endDate,
    options,
    summary: {
      totalHours,
      completedTasks: tasksCompletedInPeriod.length,
      abandonedTasks: tasksAbandonedInPeriod.length,
      activeTasks: activeTasks.length,
      accomplishments: accomplishments.length,
      todos: todos.length
    },
    statusTransitions,
    timeByTask,
    tasksCompletedInPeriod,
    tasksAbandonedInPeriod,
    activeTasks,
    accomplishments,
    todos,
    categoryAnalytics
  };
}

// ============================================================
// HTML GENERATION
// ============================================================

/**
 * Generate HTML for the report preview
 * @param {object} data - Report data
 * @returns {Promise<string>} HTML string
 */
async function generateReportHTML(data) {
  let html = `
    <div class="report-content">
      <h2>Report for ${data.period}</h2>
      <p class="text-muted">Generated on ${new Date().toLocaleDateString()}</p>
  `;
  
  if (data.options.includeExecutiveSummary) {
    html += `
      <div class="report-section mb-4">
        <h3><i class="fas fa-star me-2"></i>Executive Summary</h3>
        <div class="row g-3 mb-3">
          <div class="col-md-2">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-primary mb-1">${data.summary.totalHours.toFixed(1)}h</div>
              <div class="text-muted">Total Hours</div>
            </div>
          </div>
          <div class="col-md-2">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-success mb-1">${data.summary.completedTasks}</div>
              <div class="text-muted">Completed</div>
            </div>
          </div>
          <div class="col-md-2">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-danger mb-1">${data.summary.abandonedTasks}</div>
              <div class="text-muted">Abandoned</div>
            </div>
          </div>
          <div class="col-md-2">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-warning mb-1">${data.summary.activeTasks}</div>
              <div class="text-muted">Active Tasks</div>
            </div>
          </div>
          <div class="col-md-2">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-info mb-1">${data.statusTransitions.started}</div>
              <div class="text-muted">Tasks Started</div>
            </div>
          </div>
          <div class="col-md-2">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-info mb-1">${data.summary.accomplishments}</div>
              <div class="text-muted">Accomplishments</div>
            </div>
          </div>
        </div>
        
        <!-- Status Transitions -->
        <div class="row g-3 mb-3">
          <div class="col-12">
            <h5><i class="fas fa-chart-line me-2"></i>Status Transitions in Period</h5>
            <div class="row g-2">
              <div class="col-md-2">
                <div class="text-center p-2 border rounded">
                  <div class="fw-bold text-primary">${data.statusTransitions.created}</div>
                  <small class="text-muted">Created</small>
                </div>
              </div>
              <div class="col-md-2">
                <div class="text-center p-2 border rounded">
                  <div class="fw-bold text-info">${data.statusTransitions.estimated}</div>
                  <small class="text-muted">Estimated</small>
                </div>
              </div>
              <div class="col-md-2">
                <div class="text-center p-2 border rounded">
                  <div class="fw-bold text-primary">${data.statusTransitions.started}</div>
                  <small class="text-muted">Started</small>
                </div>
              </div>
              <div class="col-md-2">
                <div class="text-center p-2 border rounded">
                  <div class="fw-bold text-danger">${data.statusTransitions.blocked}</div>
                  <small class="text-muted">Blocked</small>
                </div>
              </div>
              <div class="col-md-2">
                <div class="text-center p-2 border rounded">
                  <div class="fw-bold text-success">${data.statusTransitions.completed}</div>
                  <small class="text-muted">Completed</small>
                </div>
              </div>
              <div class="col-md-2">
                <div class="text-center p-2 border rounded">
                  <div class="fw-bold text-dark">${data.statusTransitions.abandoned}</div>
                  <small class="text-muted">Abandoned</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  if (data.options.includeTimesheet) {
    html += `
      <div class="report-section mb-4">
        <h3><i class="fas fa-clock me-2"></i>Time Summary</h3>
        <div class="table-responsive">
          <table class="table table-sm table-striped">
            <thead class="table-dark">
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Hours</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    const sortedTasks = Object.values(data.timeByTask).sort((a, b) => b.hours - a.hours);
    for (const item of sortedTasks) {
      html += `
              <tr>
                <td>${item.task?.title || 'Unknown Task'}</td>
                <td><span class="badge bg-secondary">${item.task?.status || 'N/A'}</span></td>
                <td><strong>${item.hours.toFixed(1)}h</strong></td>
                <td>${item.logs.length}</td>
              </tr>
      `;
    }
    
    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  
  if (data.options.includeTaskProgress && data.tasksCompletedInPeriod.length > 0) {
    html += `
      <div class="report-section mb-4">
        <h3><i class="fas fa-check-circle me-2"></i>Completed Tasks</h3>
        <ul class="list-group mb-3">
    `;
    
    for (const task of data.tasksCompletedInPeriod) {
      const completedDate = new Date(task.completedAt);
      html += `
          <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <span class="fw-bold">${task.title}</span>
              <small class="text-muted d-block">Completed: ${completedDate.toLocaleDateString()}</small>
            </div>
            <span class="badge bg-success">Completed</span>
          </li>
      `;
    }
    
    html += `
        </ul>
      </div>
    `;
  }
  
  if (data.options.includeAccomplishments && data.accomplishments.length > 0) {
    html += `
      <div class="report-section mb-4">
        <h3><i class="fas fa-trophy me-2"></i>Accomplishments</h3>
        <ul class="list-group">
    `;
    
    for (const acc of data.accomplishments) {
      html += `
          <li class="list-group-item">
            <strong>${acc.title}</strong>
            ${acc.content ? `<div class="small text-muted">${acc.content}</div>` : ''}
          </li>
      `;
    }
    
    html += `
        </ul>
      </div>
    `;
  }
  
  if (data.options.includeCategoryAnalytics && data.categoryAnalytics.length > 0) {
    html += `
      <div class="report-section mb-4">
        <h3><i class="fas fa-tags me-2"></i>Category Analytics</h3>
        <div class="table-responsive">
          <table class="table table-sm table-striped">
            <thead class="table-dark">
              <tr>
                <th>Category</th>
                <th>Hours</th>
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    for (const cat of data.categoryAnalytics) {
      html += `
              <tr>
                <td>${cat.name}</td>
                <td><strong>${cat.hours.toFixed(1)}h</strong></td>
                <td>${cat.percentage.toFixed(1)}%</td>
              </tr>
      `;
    }
    
    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  
  // Always include Velocity Analysis section
  html += await generateVelocityAnalysisHTML();
  
  html += `</div>`;
  return html;
}

/**
 * Generate Velocity Analysis section HTML
 * @returns {Promise<string>} HTML string
 */
async function generateVelocityAnalysisHTML() {
  const velocityData = await calculatePersonalVelocity();
  
  if (!velocityData) {
    return `
      <div class="report-section mb-4">
        <h3><i class="fas fa-tachometer-alt me-2"></i>Personal Velocity Analysis</h3>
        <div class="alert alert-info">
          <i class="fas fa-info-circle me-2"></i>
          Complete tasks with estimation data to see velocity metrics. 
          Add scale estimates (Low/Expected/High) when editing tasks in the Work view.
        </div>
      </div>
    `;
  }
  
  // Calculate estimation accuracy
  const allTasks = await getTasks({}, true);
  const completedTasksWithEstimates = allTasks.filter(task => 
    task.status === 'Completed' && 
    task.estimationData?.scale?.expected
  );
  
  let accuracyMetrics = {
    totalTasks: 0,
    withinRange: 0,
    underestimated: 0,
    overestimated: 0,
    avgConfidence: 0
  };
  
  if (completedTasksWithEstimates.length > 0) {
    let totalConfidence = 0;
    
    for (const task of completedTasksWithEstimates) {
      const timeLogs = await getAllTimeLogs();
      const taskLogs = timeLogs.filter(log => log.taskId === task.id);
      const actualHours = taskLogs.reduce((sum, log) => sum + log.hours, 0);
      
      if (actualHours > 0) {
        accuracyMetrics.totalTasks++;
        
        const lowPrediction = task.estimationData.scale.low * velocityData.velocity;
        const highPrediction = task.estimationData.scale.high * velocityData.velocity;
        
        if (actualHours >= lowPrediction && actualHours <= highPrediction) {
          accuracyMetrics.withinRange++;
        } else if (actualHours > highPrediction) {
          accuracyMetrics.underestimated++;
        } else {
          accuracyMetrics.overestimated++;
        }
        
        totalConfidence += task.estimationData.confidence || 100;
      }
    }
    
    accuracyMetrics.avgConfidence = totalConfidence / accuracyMetrics.totalTasks;
  }
  
  const accuracyPercentage = accuracyMetrics.totalTasks > 0 
    ? ((accuracyMetrics.withinRange / accuracyMetrics.totalTasks) * 100).toFixed(1)
    : 0;
  
  return `
    <div class="report-section mb-4">
      <h3><i class="fas fa-tachometer-alt me-2"></i>Personal Velocity Analysis</h3>
      
      <!-- Velocity Metrics -->
      <div class="row g-3 mb-4">
        <div class="col-md-3">
          <div class="metric-card text-center p-3 border rounded">
            <div class="h3 text-primary mb-1">${velocityData.velocity.toFixed(2)}h</div>
            <div class="text-muted">Hours per Point</div>
            <small class="text-muted">Current Velocity</small>
          </div>
        </div>
        <div class="col-md-3">
          <div class="metric-card text-center p-3 border rounded">
            <div class="h3 text-success mb-1">${velocityData.sampleSize}</div>
            <div class="text-muted">Completed Tasks</div>
            <small class="text-muted">With Estimates</small>
          </div>
        </div>
        <div class="col-md-3">
          <div class="metric-card text-center p-3 border rounded">
            <div class="h3 text-info mb-1">${velocityData.totalHours.toFixed(1)}h</div>
            <div class="text-muted">Total Hours</div>
            <small class="text-muted">Actual Time Logged</small>
          </div>
        </div>
        <div class="col-md-3">
          <div class="metric-card text-center p-3 border rounded">
            <div class="h3 text-warning mb-1">${velocityData.totalPoints}</div>
            <div class="text-muted">Scale Points</div>
            <small class="text-muted">Expected Estimates</small>
          </div>
        </div>
      </div>
      
      <!-- Estimation Accuracy -->
      ${accuracyMetrics.totalTasks > 0 ? `
      <div class="mb-4">
        <h5><i class="fas fa-bullseye me-2"></i>Estimation Accuracy</h5>
        <div class="row g-3">
          <div class="col-md-3">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-success mb-1">${accuracyPercentage}%</div>
              <div class="text-muted">Within Range</div>
              <small class="text-muted">${accuracyMetrics.withinRange} of ${accuracyMetrics.totalTasks} tasks</small>
            </div>
          </div>
          <div class="col-md-3">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-warning mb-1">${accuracyMetrics.underestimated}</div>
              <div class="text-muted">Underestimated</div>
              <small class="text-muted">Took longer than High</small>
            </div>
          </div>
          <div class="col-md-3">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-info mb-1">${accuracyMetrics.overestimated}</div>
              <div class="text-muted">Overestimated</div>
              <small class="text-muted">Took less than Low</small>
            </div>
          </div>
          <div class="col-md-3">
            <div class="metric-card text-center p-3 border rounded">
              <div class="h3 text-primary mb-1">${accuracyMetrics.avgConfidence.toFixed(0)}%</div>
              <div class="text-muted">Avg Confidence</div>
              <small class="text-muted">Your certainty level</small>
            </div>
          </div>
        </div>
      </div>
      ` : ''}
      
      <!-- Interpretation Guide -->
      <div class="alert alert-light border">
        <h6><i class="fas fa-lightbulb me-2"></i>Understanding Your Velocity</h6>
        <ul class="mb-0">
          <li><strong>Velocity ${velocityData.velocity.toFixed(2)}h/point</strong> means each scale point represents about ${velocityData.velocity.toFixed(1)} hours of work for you</li>
          ${accuracyMetrics.totalTasks > 0 ? `
          <li><strong>${accuracyPercentage}% accuracy</strong> means your estimates are ${accuracyPercentage >= 80 ? 'excellent' : accuracyPercentage >= 60 ? 'good' : 'improving'} - actual hours fall within your Low-High range</li>
          <li><strong>Underestimated tasks</strong> suggest adding buffer or adjusting your scale interpretation for complex work</li>
          <li><strong>Overestimated tasks</strong> indicate you might be too conservative - trust your skills more</li>
          ` : '<li>Complete more tasks to see accuracy metrics</li>'}
        </ul>
      </div>
    </div>
  `;
}

// ============================================================
// EXPORT FUNCTIONALITY
// ============================================================

/**
 * Export report as markdown
 */
function exportReportAsMarkdown() {
  if (!currentReportData) {
    alert('Please generate a report first');
    return;
  }
  
  let markdown = `# Report for ${currentReportData.period}\n\n`;
  markdown += `Generated on ${new Date().toLocaleDateString()}\n\n`;
  
  if (currentReportData.options.includeExecutiveSummary) {
    markdown += `## Executive Summary\n\n`;
    markdown += `- **Total Hours**: ${currentReportData.summary.totalHours.toFixed(1)}h\n`;
    markdown += `- **Completed Tasks**: ${currentReportData.summary.completedTasks}\n`;
    markdown += `- **Abandoned Tasks**: ${currentReportData.summary.abandonedTasks}\n`;
    markdown += `- **Active Tasks**: ${currentReportData.summary.activeTasks}\n`;
    markdown += `- **Accomplishments**: ${currentReportData.summary.accomplishments}\n\n`;
  }
  
  if (currentReportData.options.includeTimesheet) {
    markdown += `## Time Summary\n\n`;
    markdown += `| Task | Status | Hours | Sessions |\n`;
    markdown += `|------|--------|-------|----------|\n`;
    
    const sortedTasks = Object.values(currentReportData.timeByTask).sort((a, b) => b.hours - a.hours);
    for (const item of sortedTasks) {
      markdown += `| ${item.task?.title || 'Unknown'} | ${item.task?.status || 'N/A'} | ${item.hours.toFixed(1)}h | ${item.logs.length} |\n`;
    }
    markdown += `\n`;
  }
  
  if (currentReportData.options.includeTaskProgress && currentReportData.tasksCompletedInPeriod.length > 0) {
    markdown += `## Completed Tasks\n\n`;
    for (const task of currentReportData.tasksCompletedInPeriod) {
      const completedDate = new Date(task.completedAt);
      markdown += `- **${task.title}** - Completed: ${completedDate.toLocaleDateString()}\n`;
    }
    markdown += `\n`;
  }
  
  if (currentReportData.options.includeAccomplishments && currentReportData.accomplishments.length > 0) {
    markdown += `## Accomplishments\n\n`;
    for (const acc of currentReportData.accomplishments) {
      markdown += `- **${acc.title}**\n`;
      if (acc.content) {
        markdown += `  ${acc.content}\n`;
      }
    }
    markdown += `\n`;
  }
  
  // Download the markdown file
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${currentReportData.startDate}-to-${currentReportData.endDate}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// PUBLIC API
// ============================================================

export {
  generateReport,
  generateReportData,
  generateReportHTML,
  exportReportAsMarkdown
};
