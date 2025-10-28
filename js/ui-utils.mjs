/**
 * ui-utils.mjs
 * UI Utility Functions - Pure helper functions for UI rendering
 * 
 * Responsibilities:
 * - Color/styling utilities (status colors, urgency colors)
 * - Toast notifications (Bootstrap integration)
 * - Date range calculations
 * - String formatting and escaping
 * - Pure functions with no side effects (except showToast)
 * 
 * Dependencies: Bootstrap 5 (for toast component)
 * Minimal internal dependencies
 */

// ============================================================
// COLOR UTILITIES
// ============================================================

/**
 * Get Bootstrap badge color class for task status
 * @param {string} status - Task status (Ready, InProgress, Completed, etc.)
 * @returns {string} Bootstrap color class name
 */
export function getStatusColor(status) {
  const colors = {
    'Ready': 'secondary',
    'Estimated': 'info',
    'InProgress': 'primary',
    'Blocked': 'danger',
    'Backburner': 'warning',
    'OnHold': 'warning',
    'Completed': 'success',
    'Abandoned': 'dark',
    'Archived': 'light'
  };
  return colors[status] || 'secondary';
}

/**
 * Get Bootstrap badge color class for task urgency
 * @param {string} urgency - Task urgency (High, Med, Low)
 * @returns {string} Bootstrap color class name
 */
export function getUrgencyColor(urgency) {
  return urgency === 'High' ? 'danger' : urgency === 'Med' ? 'warning' : 'success';
}

/**
 * Get Bootstrap badge color class for task importance
 * @param {string} importance - Task importance (High, Med, Low)
 * @returns {string} Bootstrap color class name
 */
export function getImportanceColor(importance) {
  return importance === 'High' ? 'danger' : importance === 'Med' ? 'warning' : 'success';
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

/**
 * Show a Bootstrap toast notification
 * @param {string} message - Toast message content
 * @param {string} type - Toast type: 'success', 'warning', 'error', 'info'
 * @param {number} duration - Display duration in milliseconds (default: 5000)
 */
export function showToast(message, type = 'info', duration = 5000) {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    console.warn('Toast container not found in DOM');
    return;
  }
  
  const toastId = 'toast-' + Date.now();
  
  const toastHtml = `
    <div class="toast toast-${type}" role="alert" aria-live="assertive" aria-atomic="true" id="${toastId}">
      <div class="toast-header">
        <i class="fas ${getToastIcon(type)} me-2"></i>
        <strong class="me-auto">${getToastTitle(type)}</strong>
        <small class="text-muted">now</small>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    </div>
  `;
  
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, { delay: duration });
  toast.show();
  
  // Remove from DOM after it's hidden
  toastElement.addEventListener('hidden.bs.toast', () => {
    toastElement.remove();
  });
}

/**
 * Get Font Awesome icon class for toast type
 * @param {string} type - Toast type
 * @returns {string} Font Awesome icon class
 */
function getToastIcon(type) {
  const icons = {
    success: 'fa-check-circle',
    warning: 'fa-exclamation-triangle',
    error: 'fa-times-circle',
    info: 'fa-info-circle'
  };
  return icons[type] || 'fa-info-circle';
}

/**
 * Get toast title for toast type
 * @param {string} type - Toast type
 * @returns {string} Toast title
 */
function getToastTitle(type) {
  const titles = {
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
    info: 'Info'
  };
  return titles[type] || 'Notification';
}

// ============================================================
// DATE UTILITIES
// ============================================================

/**
 * Get date range for a given view and month offset
 * @param {string} view - View type ('month', etc.)
 * @param {number} monthOffset - Months offset from current (0 = current month)
 * @returns {Object} { startDate, endDate, periodLabel }
 */
export function getDateRange(view, monthOffset = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let startDate, endDate, periodLabel;
  
  if (view === 'month') {
    const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
    startDate = targetMonth.toISOString().split('T')[0];
    endDate = monthEnd.toISOString().split('T')[0];
    periodLabel = targetMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else {
    startDate = endDate = null;
    periodLabel = '';
  }
  
  console.log('Date range for view', view, ':', startDate, endDate, 'Label:', periodLabel);
  return { startDate, endDate, periodLabel };
}

/**
 * Format a date string to a localized string
 * @param {string} dateString - ISO date string
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDate(dateString, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', options);
  } catch (err) {
    console.warn('Invalid date string:', dateString);
    return dateString;
  }
}

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 * @returns {string} Today's date
 */
export function getTodayISO() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Check if a date is today
 * @param {string} dateString - ISO date string
 * @returns {boolean} True if date is today
 */
export function isToday(dateString) {
  return dateString === getTodayISO();
}

/**
 * Check if a date is in the past
 * @param {string} dateString - ISO date string
 * @returns {boolean} True if date is before today
 */
export function isPastDate(dateString) {
  if (!dateString) return false;
  return dateString < getTodayISO();
}

// ============================================================
// STRING UTILITIES
// ============================================================

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Format hours as decimal string (e.g., 1.5h, 2.25h)
 * @param {number} hours - Hours as decimal
 * @returns {string} Formatted hours string
 */
export function formatHours(hours) {
  if (hours === 0 || hours === null || hours === undefined) return '0h';
  return `${hours.toFixed(2)}h`;
}

/**
 * Format duration in minutes to human-readable string
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "2h 30m", "45m")
 */
export function formatDuration(minutes) {
  if (!minutes || minutes === 0) return '0m';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ============================================================
// NUMBER UTILITIES
// ============================================================

/**
 * Clamp a number between min and max values
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a random integer between min (inclusive) and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Round a number to the nearest quarter (0.25)
 * Examples: 1.37 -> 1.25, 1.88 -> 2.0, 1.12 -> 1.0
 * @param {number} value - Value to round
 * @returns {number} Rounded value
 */
export function roundToQuarter(value) {
  return Math.round(value * 4) / 4;
}

// ============================================================
// ARRAY UTILITIES
// ============================================================

/**
 * Group array items by a key function
 * @param {Array} array - Array to group
 * @param {Function} keyFn - Function that returns grouping key for each item
 * @returns {Object} Object with grouped items
 */
export function groupBy(array, keyFn) {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {});
}

/**
 * Sort array by a key function
 * @param {Array} array - Array to sort
 * @param {Function} keyFn - Function that returns sort key for each item
 * @param {boolean} descending - Sort in descending order
 * @returns {Array} Sorted array (new array, doesn't mutate original)
 */
export function sortBy(array, keyFn, descending = false) {
  const sorted = [...array].sort((a, b) => {
    const keyA = keyFn(a);
    const keyB = keyFn(b);
    if (keyA < keyB) return descending ? 1 : -1;
    if (keyA > keyB) return descending ? -1 : 1;
    return 0;
  });
  return sorted;
}
