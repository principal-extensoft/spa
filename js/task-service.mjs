/**
 * task-service.mjs
 * Task Management Service - Core business logic for tasks
 * 
 * Responsibilities:
 * - CRUD operations for tasks
 * - Status transition validation and history tracking
 * - Remaining hours tracking and burn-down history
 * - Task queries with filtering
 * - Task progress calculations
 * 
 * Dependencies: db.mjs, ui-utils.mjs (for errors only), timelog-service.mjs
 */

import { dbPromise } from './db.mjs';
import { showToast } from './ui-utils.mjs';
import { getTimeLogs, calculateTotalHours } from './timelog-service.mjs';

// ============================================================
// STATUS TRANSITIONS
// ============================================================

/**
 * Valid state transitions map
 * Defines which statuses can transition to which other statuses
 */
export const stateTransitions = {
  'Ready': ['Estimated', 'InProgress', 'Abandoned', 'Archived'],
  'Estimated': ['InProgress', 'Abandoned', 'Archived'],
  'InProgress': ['Blocked', 'Backburner', 'OnHold', 'Completed', 'Abandoned', 'Archived'],
  'Blocked': ['InProgress', 'Backburner', 'OnHold', 'Abandoned', 'Archived'],
  'Backburner': ['InProgress', 'Blocked', 'OnHold', 'Abandoned', 'Archived'],
  'OnHold': ['InProgress', 'Abandoned', 'Archived'],
  'Completed': ['Abandoned', 'Archived'],
  'Abandoned': ['Archived'],
  'Archived': []
};

/**
 * Validate if status transition is allowed
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Target status
 * @returns {boolean} True if transition is valid
 */
export function isValidStatusTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return true; // Same status is always valid
  return stateTransitions[fromStatus]?.includes(toStatus) || false;
}

// ============================================================
// CRUD OPERATIONS
// ============================================================

/**
 * Save task to database (create or update)
 * Handles status history tracking and remaining hours initialization
 * @param {Object} task - Task object
 * @param {boolean} isEdit - True if editing existing task
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function saveTask(task, isEdit = false) {
  console.log('Attempting to save task:', task);
  try {
    const db = await dbPromise;
    
    // Initialize status history for new tasks
    if (!isEdit) {
      task.statusHistory = [{
        status: task.status || 'Ready',
        timestamp: new Date().toISOString(),
        note: 'Task created'
      }];
      task.createdAt = new Date().toISOString();
      
      // Initialize remaining hours for new tasks
      if (task.remainingHours === undefined) {
        task.remainingHours = task.estimate || 0;
      }
      
      // Create initial remaining hours history entry
      if (task.remainingHours > 0) {
        const historyEntry = {
          taskId: null, // Will be set after task is saved
          remainingHours: task.remainingHours,
          timestamp: new Date().toISOString(),
          note: 'Initial estimate'
        };
        // Store this to add after task creation
        task._initialRemainingHoursEntry = historyEntry;
      }
      
      console.log('New task - initialized status history:', task.statusHistory);
      console.log('New task - initialized remaining hours:', task.remainingHours);
    }
    
    // If editing, check status transition and update history
    if (isEdit && task.status && task.id) {
      const currentTask = await db.get('tasks', task.id);
      console.log('Current task from DB:', currentTask);
      console.log('Task being saved:', task);
      
      if (currentTask) {
        // Initialize statusHistory if it doesn't exist (for existing tasks)
        if (!currentTask.statusHistory) {
          console.log('No status history found, initializing...');
          currentTask.statusHistory = [{
            status: currentTask.status,
            timestamp: currentTask.createdAt || new Date().toISOString(),
            note: 'Legacy task - initial status'
          }];
        }
        
        console.log('Current task status:', currentTask.status, 'New task status:', task.status);
        
        // Check if status actually changed
        if (currentTask.status !== task.status) {
          console.log('Status changed! Adding to history...');
          
          // Validate transition
          if (!isValidStatusTransition(currentTask.status, task.status)) {
            console.warn(`Invalid status transition from ${currentTask.status} to ${task.status}`);
            showToast(`Invalid status transition from ${currentTask.status} to ${task.status}`, 'error');
            return false;
          }
          
          // Add status transition to history
          task.statusHistory = [...currentTask.statusHistory, {
            status: task.status,
            timestamp: new Date().toISOString(),
            note: `${currentTask.status} => ${task.status}`
          }];
          
          console.log('Status changed - updated history:', task.statusHistory);
        } else {
          console.log('Status unchanged, preserving existing history');
          // Status didn't change, preserve existing history
          task.statusHistory = currentTask.statusHistory;
        }
        
        // Preserve creation timestamp
        task.createdAt = currentTask.createdAt || new Date().toISOString();
      }
    }
    
    // Now perform the write operation
    const tx = db.transaction(['tasks', 'remainingHoursHistory'], 'readwrite');
    const savedTaskId = await tx.objectStore('tasks').put(task);
    
    // If this is a new task and we have an initial remaining hours entry, save it
    if (!isEdit && task._initialRemainingHoursEntry) {
      task._initialRemainingHoursEntry.taskId = savedTaskId;
      await tx.objectStore('remainingHoursHistory').add(task._initialRemainingHoursEntry);
      delete task._initialRemainingHoursEntry; // Clean up temporary property
    }
    
    await tx.done;
    
    console.log('Task saved successfully with status history:', task);
    return true;
  } catch (err) {
    console.error('Error saving task:', err);
    return false;
  }
}

/**
 * Delete task and all associated time logs
 * @param {number} taskId - Task ID to delete
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteTask(taskId) {
  console.log('Attempting to delete task:', taskId);
  try {
    const db = await dbPromise;
    const tx = db.transaction(['tasks', 'timeLogs', 'remainingHoursHistory'], 'readwrite');
    
    // Delete task
    await tx.objectStore('tasks').delete(taskId);
    
    // Delete all time logs for this task
    const timeLogs = await tx.objectStore('timeLogs').index('taskId').getAll(taskId);
    for (const log of timeLogs) {
      await tx.objectStore('timeLogs').delete(log.id);
    }
    
    // Delete all remaining hours history for this task
    const historyEntries = await tx.objectStore('remainingHoursHistory').index('taskId').getAll(taskId);
    for (const entry of historyEntries) {
      await tx.objectStore('remainingHoursHistory').delete(entry.id);
    }
    
    await tx.done;
    
    console.log('Task deleted successfully:', taskId);
    return true;
  } catch (err) {
    console.error('Error deleting task:', err);
    return false;
  }
}

/**
 * Get tasks with optional filtering
 * @param {Object} filters - Filter object { status, urgency, projectId, dueOn }
 * @param {boolean} includeAll - If true, include Completed/Abandoned/Archived tasks
 * @returns {Promise<Array>} Array of task objects
 */
export async function getTasks(filters = {}, includeAll = false) {
  console.log('Fetching tasks with filters:', filters, 'includeAll:', includeAll);
  try {
    const db = await dbPromise;
    const tasks = await db.getAll('tasks');
    
    const filteredTasks = tasks.filter(task => {
      // Status filter
      if (filters.status && task.status !== filters.status) return false;
      
      // Urgency filter
      if (filters.urgency && task.urgency !== filters.urgency) return false;
      
      // Project filter
      if (filters.projectId && task.projectId !== filters.projectId) return false;
      
      // Due date filter
      if (filters.dueOn && task.dueOn !== filters.dueOn) return false;
      
      // Exclude completed/abandoned/archived unless includeAll is true
      if (!includeAll && ['Completed', 'Abandoned', 'Archived'].includes(task.status)) {
        return false;
      }
      
      return true;
    });
    
    console.log('Fetched tasks:', filteredTasks.length);
    return filteredTasks;
  } catch (err) {
    console.error('Error fetching tasks:', err);
    return [];
  }
}

/**
 * Get task by ID
 * @param {number} taskId - Task ID
 * @returns {Promise<Object|null>} Task object or null if not found
 */
export async function getTaskById(taskId) {
  try {
    const db = await dbPromise;
    return await db.get('tasks', taskId);
  } catch (err) {
    console.error('Error fetching task by ID:', err);
    return null;
  }
}

// ============================================================
// REMAINING HOURS TRACKING
// ============================================================

/**
 * Update remaining hours for a task and track the change in history
 * @param {number} taskId - Task ID
 * @param {number} newRemainingHours - New remaining hours value
 * @param {string} note - Optional note about the change
 * @returns {Promise<boolean>} True if updated successfully
 */
export async function updateRemainingHours(taskId, newRemainingHours, note = '') {
  try {
    const db = await dbPromise;
    const task = await db.get('tasks', taskId);
    
    if (!task) {
      console.error('Task not found:', taskId);
      return false;
    }
    
    const oldRemainingHours = task.remainingHours || 0;
    
    // Only update if the value actually changed
    if (oldRemainingHours !== newRemainingHours) {
      task.remainingHours = newRemainingHours;
      
      // Create history entry
      const historyEntry = {
        taskId: taskId,
        remainingHours: newRemainingHours,
        previousRemainingHours: oldRemainingHours,
        timestamp: new Date().toISOString(),
        note: note || `Updated remaining hours from ${oldRemainingHours}h to ${newRemainingHours}h`
      };
      
      // Save both task and history in a transaction
      const tx = db.transaction(['tasks', 'remainingHoursHistory'], 'readwrite');
      await tx.objectStore('tasks').put(task);
      await tx.objectStore('remainingHoursHistory').add(historyEntry);
      await tx.done;
      
      console.log('Remaining hours updated:', historyEntry);
      return true;
    }
    
    return false; // No change needed
  } catch (err) {
    console.error('Error updating remaining hours:', err);
    return false;
  }
}

/**
 * Get remaining hours history for a task
 * @param {number} taskId - Task ID
 * @returns {Promise<Array>} Array of history entries
 */
export async function getRemainingHoursHistory(taskId) {
  try {
    const db = await dbPromise;
    return await db.getAllFromIndex('remainingHoursHistory', 'taskId', taskId);
  } catch (err) {
    console.error('Error fetching remaining hours history:', err);
    return [];
  }
}

// ============================================================
// TASK PROGRESS CALCULATIONS
// ============================================================

/**
 * Calculate task progress percentage
 * @param {Object} task - Task object
 * @returns {Promise<Object>} { logged, estimate, remaining, progress, isOverBudget }
 */
export async function calculateTaskProgress(task) {
  if (!task || !task.id) {
    return { logged: 0, estimate: 0, remaining: 0, progress: 0, isOverBudget: false };
  }
  
  // Get all time logs for this task
  const timeLogs = await getTimeLogs(task.id);
  const logged = calculateTotalHours(timeLogs);
  
  const estimate = task.estimate || 0;
  const remaining = task.remainingHours || 0;
  
  // Calculate progress
  let progress = 0;
  if (estimate > 0) {
    progress = Math.min(100, Math.round((logged / estimate) * 100));
  }
  
  const isOverBudget = logged > estimate && estimate > 0;
  
  return {
    logged,
    estimate,
    remaining,
    progress,
    isOverBudget
  };
}

/**
 * Get all tasks with their progress calculated
 * @param {Object} filters - Optional filters
 * @param {boolean} includeAll - Include completed/archived
 * @returns {Promise<Array>} Array of tasks with progress data
 */
export async function getTasksWithProgress(filters = {}, includeAll = false) {
  const tasks = await getTasks(filters, includeAll);
  
  const tasksWithProgress = await Promise.all(
    tasks.map(async (task) => {
      const progress = await calculateTaskProgress(task);
      return { ...task, progress };
    })
  );
  
  return tasksWithProgress;
}

// ============================================================
// TASK QUERIES
// ============================================================

/**
 * Get tasks due on a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of tasks due on that date
 */
export async function getTasksDueOn(date) {
  return getTasks({ dueOn: date });
}

/**
 * Get tasks by status
 * @param {string} status - Status to filter by
 * @returns {Promise<Array>} Array of tasks with that status
 */
export async function getTasksByStatus(status) {
  return getTasks({ status }, true); // Include all to allow filtering completed/archived
}

/**
 * Get tasks by project
 * @param {number} projectId - Project ID to filter by
 * @returns {Promise<Array>} Array of tasks for that project
 */
export async function getTasksByProject(projectId) {
  return getTasks({ projectId });
}

/**
 * Get overdue tasks (due date in past, not completed/abandoned/archived)
 * @returns {Promise<Array>} Array of overdue tasks
 */
export async function getOverdueTasks() {
  const today = new Date().toISOString().split('T')[0];
  const tasks = await getTasks();
  
  return tasks.filter(task => 
    task.dueOn && 
    task.dueOn < today &&
    !['Completed', 'Abandoned', 'Archived'].includes(task.status)
  );
}
