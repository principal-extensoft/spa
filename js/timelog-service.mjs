/**
 * timelog-service.mjs
 * Time Log Management Service
 * 
 * Responsibilities:
 * - CRUD operations for time logs
 * - Time log validation (status checks)
 * - Time log queries (by task, date range)
 * - Category analysis and aggregation
 * - Total hours calculations
 * 
 * Dependencies: db.mjs, ui-utils.mjs, category-service.mjs
 */

import { dbPromise } from './db.mjs';
import { showToast } from './ui-utils.mjs';
import { 
  getCategoryDisplayInfo, 
  getCategoryListBySlug, 
  parseCategoryKey,
  calculateCategoryTimeSummaries 
} from './category-service.mjs';

// ============================================================
// CRUD OPERATIONS
// ============================================================

/**
 * Save time log to database
 * Validates task status before saving (must be Estimated or InProgress)
 * @param {Object} timeLog - Time log object
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function saveTimeLog(timeLog) {
  console.log('Attempting to save time log:', timeLog);
  try {
    const db = await dbPromise;
    
    // Validate task exists and has correct status
    const task = await db.get('tasks', timeLog.taskId);
    if (!task || !['Estimated', 'InProgress'].includes(task.status)) {
      console.warn('Invalid task status for time log:', task?.status);
      showToast('Time can only be logged for tasks in Estimated or InProgress status.', 'warning');
      return false;
    }
    
    // Ensure dateLogged is set
    if (!timeLog.dateLogged) {
      timeLog.dateLogged = new Date().toISOString().split('T')[0];
    }
    
    // Save time log
    const tx = db.transaction('timeLogs', 'readwrite');
    await tx.store.put(timeLog);
    await tx.done;
    
    console.log('Time log saved successfully:', timeLog);
    return true;
  } catch (err) {
    console.error('Error saving time log:', err);
    return false;
  }
}

/**
 * Delete time log by ID
 * @param {number} logId - Time log ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteTimeLog(logId) {
  console.log('Attempting to delete time log:', logId);
  try {
    const db = await dbPromise;
    const tx = db.transaction('timeLogs', 'readwrite');
    await tx.store.delete(logId);
    await tx.done;
    
    console.log('Time log deleted successfully:', logId);
    return true;
  } catch (err) {
    console.error('Error deleting time log:', err);
    return false;
  }
}

/**
 * Get time logs by task ID and optional date range
 * @param {number} taskId - Task ID to filter by
 * @param {string|null} startDate - Start date (YYYY-MM-DD) or null for no filter
 * @param {string|null} endDate - End date (YYYY-MM-DD) or null for no filter
 * @returns {Promise<Array>} Array of time log objects
 */
export async function getTimeLogs(taskId, startDate = null, endDate = null) {
  console.log('Fetching time logs for task:', taskId, 'range:', startDate, endDate);
  try {
    const db = await dbPromise;
    
    // If taskId is provided, filter by task
    const logs = taskId 
      ? await db.getAllFromIndex('timeLogs', 'taskId', taskId)
      : await db.getAll('timeLogs');
    
    // Apply date range filter if provided
    const filteredLogs = logs.filter(log => {
      if (!startDate || !endDate) return true;
      return log.dateLogged >= startDate && log.dateLogged <= endDate;
    });
    
    console.log('Fetched time logs:', filteredLogs.length);
    return filteredLogs;
  } catch (err) {
    console.error('Error fetching time logs:', err);
    return [];
  }
}

/**
 * Get all time logs (no task filter)
 * @param {string|null} startDate - Optional start date filter
 * @param {string|null} endDate - Optional end date filter
 * @returns {Promise<Array>} Array of all time logs
 */
export async function getAllTimeLogs(startDate = null, endDate = null) {
  return getTimeLogs(null, startDate, endDate);
}

/**
 * Get time log by ID
 * @param {number} logId - Time log ID
 * @returns {Promise<Object|null>} Time log object or null if not found
 */
export async function getTimeLogById(logId) {
  try {
    const db = await dbPromise;
    return await db.get('timeLogs', logId);
  } catch (err) {
    console.error('Error fetching time log by ID:', err);
    return null;
  }
}

// ============================================================
// TIME CALCULATIONS
// ============================================================

/**
 * Calculate total hours from array of time logs
 * @param {Array} timeLogs - Array of time log objects
 * @returns {number} Total hours
 */
export function calculateTotalHours(timeLogs) {
  return timeLogs.reduce((total, log) => total + (log.hours || 0), 0);
}

/**
 * Calculate total hours for a specific task
 * @param {number} taskId - Task ID
 * @param {string|null} startDate - Optional start date filter
 * @param {string|null} endDate - Optional end date filter
 * @returns {Promise<number>} Total hours logged
 */
export async function calculateTaskTotalHours(taskId, startDate = null, endDate = null) {
  const logs = await getTimeLogs(taskId, startDate, endDate);
  return calculateTotalHours(logs);
}

/**
 * Group time logs by date
 * @param {Array} timeLogs - Array of time log objects
 * @returns {Object} Map of date -> array of logs
 */
export function groupTimeLogsByDate(timeLogs) {
  const grouped = {};
  
  for (const log of timeLogs) {
    const date = log.dateLogged || 'unknown';
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(log);
  }
  
  return grouped;
}

/**
 * Group time logs by task
 * @param {Array} timeLogs - Array of time log objects
 * @returns {Object} Map of taskId -> array of logs
 */
export function groupTimeLogsByTask(timeLogs) {
  const grouped = {};
  
  for (const log of timeLogs) {
    const taskId = log.taskId || 'unknown';
    if (!grouped[taskId]) {
      grouped[taskId] = [];
    }
    grouped[taskId].push(log);
  }
  
  return grouped;
}

// ============================================================
// CATEGORY ANALYSIS
// ============================================================

/**
 * Analyze categories in time logs
 * Returns detailed statistics for categories and category lists
 * @param {Array} timeLogs - Array of time log objects
 * @returns {Promise<Object>} { categoryStats, categoryListStats, totalCategorizedHours, uncategorizedHours }
 */
export async function analyzeCategoriesInTimeLogs(timeLogs) {
  const categoryStats = {};
  const categoryListStats = {};
  let totalCategorizedHours = 0;
  let uncategorizedHours = 0;

  // Initialize stats
  for (const log of timeLogs) {
    // Check for both 'category' and 'categoryKey' field names for backwards compatibility
    const categoryValue = log.category || log.categoryKey;
    
    if (categoryValue) {
      totalCategorizedHours += log.hours;
      
      // Parse category key
      const { listSlug, itemSlug } = parseCategoryKey(categoryValue);
      
      if (listSlug && itemSlug) {
        // Category-level stats
        if (!categoryStats[categoryValue]) {
          const categoryInfo = await getCategoryDisplayInfo(categoryValue);
          categoryStats[categoryValue] = {
            key: categoryValue,
            listTitle: categoryInfo.listTitle,
            categoryTitle: categoryInfo.itemTitle,
            fullDisplay: categoryInfo.fullDisplay,
            hours: 0,
            logCount: 0,
            listSlug: listSlug,
            itemSlug: itemSlug
          };
        }
        categoryStats[categoryValue].hours += log.hours;
        categoryStats[categoryValue].logCount++;

        // Category list-level stats
        if (!categoryListStats[listSlug]) {
          const categoryList = await getCategoryListBySlug(listSlug);
          categoryListStats[listSlug] = {
            slug: listSlug,
            title: categoryList ? categoryList.title : listSlug,
            hours: 0,
            logCount: 0,
            categories: {}
          };
        }
        categoryListStats[listSlug].hours += log.hours;
        categoryListStats[listSlug].logCount++;
        
        if (!categoryListStats[listSlug].categories[itemSlug]) {
          const categoryInfo = await getCategoryDisplayInfo(categoryValue);
          categoryListStats[listSlug].categories[itemSlug] = {
            slug: itemSlug,
            title: categoryInfo.itemTitle,
            hours: 0,
            logCount: 0
          };
        }
        categoryListStats[listSlug].categories[itemSlug].hours += log.hours;
        categoryListStats[listSlug].categories[itemSlug].logCount++;
      }
    } else {
      uncategorizedHours += log.hours;
    }
  }

  return {
    categoryStats,
    categoryListStats,
    totalCategorizedHours,
    uncategorizedHours,
    totalHours: totalCategorizedHours + uncategorizedHours
  };
}

/**
 * Get simple category time summaries (category key -> total hours)
 * @param {Array} timeLogs - Array of time log objects
 * @returns {Object} Map of category key to total hours
 */
export function getSimpleCategorySummaries(timeLogs) {
  return calculateCategoryTimeSummaries(timeLogs);
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

/**
 * Check if a task can have time logged (status validation)
 * @param {Object} task - Task object
 * @returns {boolean} True if task can have time logged
 */
export function canLogTimeForTask(task) {
  if (!task) return false;
  return ['Estimated', 'InProgress'].includes(task.status);
}

/**
 * Validate time log object has required fields
 * @param {Object} timeLog - Time log object to validate
 * @returns {Object} { valid: boolean, errors: Array }
 */
export function validateTimeLog(timeLog) {
  const errors = [];
  
  if (!timeLog.taskId) {
    errors.push('Task ID is required');
  }
  
  if (!timeLog.hours || timeLog.hours <= 0) {
    errors.push('Hours must be greater than 0');
  }
  
  if (!timeLog.dateLogged) {
    errors.push('Date logged is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
