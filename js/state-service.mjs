/**
 * state-service.mjs
 * Global State Management - Centralized application state
 * 
 * Responsibilities:
 * - Manage current view state (board, calendar, today, spaceport, work, reports)
 * - Manage month navigation offset for calendar view
 * - Manage spaceport session state (active rockets, launch pads)
 * - Manage global filters (localStorage persistence)
 * - Provide getters/setters for all state
 * 
 * Dependencies: None (foundation layer)
 * Zero internal dependencies
 */

// ============================================================
// VIEW STATE
// ============================================================

/**
 * Current active view
 * Valid values: 'board', 'calendar', 'today', 'spaceport', 'work', 'reports', 'all'
 */
let currentView = 'board';

/**
 * Month offset for calendar view navigation
 * 0 = current month, -1 = previous month, +1 = next month
 */
let monthOffset = 0;

/**
 * Calendar configuration for rendering
 */
export const CALENDAR_CONFIG = {
  TASK_BAR_HEIGHT: 14,          // pixels - easily adjustable
  TASK_BAR_MIN_HEIGHT: 10,      // minimum height for very busy days
  MAX_BARS_BEFORE_SHRINK: 5     // shrink bars if more than this many
};

// ============================================================
// SPACEPORT STATE
// ============================================================

/**
 * SpacePort session state - active time tracking session
 * Used by spaceport-view.mjs for animated rocket launches
 */
let spaceportSession = {
  isOperational: false,              // Whether spaceport is active
  startTime: null,                   // Session start timestamp
  activeRocket: null,                // Currently selected rocket
  rockets: new Map(),                // rocketId -> { taskId, category, startTime, totalTime, x, y, launchPad }
  sessionStartTime: null,            // Timestamp when session began
  launchPads: []                     // Array of launch pad positions
};

// ============================================================
// FILTER STATE (with localStorage persistence)
// ============================================================

/**
 * Global filters for tasks/time logs
 * Persisted to localStorage for cross-session consistency
 */
let globalFilters = loadFiltersFromStorage();

function loadFiltersFromStorage() {
  try {
    const saved = localStorage.getItem('trackerGlobalFilters');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.warn('Could not load filters from localStorage:', err);
  }
  
  // Default filters
  return {
    projectId: null,
    phaseId: null,
    categoryId: null,
    dateRange: null
  };
}

function saveFiltersToStorage() {
  try {
    localStorage.setItem('trackerGlobalFilters', JSON.stringify(globalFilters));
  } catch (err) {
    console.warn('Could not save filters to localStorage:', err);
  }
}

// ============================================================
// PUBLIC API - VIEW STATE
// ============================================================

/**
 * Get the current active view
 * @returns {string} Current view name
 */
export function getCurrentView() {
  return currentView;
}

/**
 * Set the current active view
 * @param {string} view - View name ('board', 'calendar', etc.)
 */
export function setCurrentView(view) {
  const validViews = ['board', 'month', 'calendar', 'today', 'spaceport', 'work', 'reports', 'all'];
  if (!validViews.includes(view)) {
    console.warn(`Invalid view: ${view}. Defaulting to 'board'`);
    view = 'board';
  }
  currentView = view;
  console.log('View changed to:', currentView);
}

/**
 * Get the month offset for calendar navigation
 * @returns {number} Month offset (0 = current month)
 */
export function getMonthOffset() {
  return monthOffset;
}

/**
 * Set the month offset for calendar navigation
 * @param {number} offset - Month offset from current month
 */
export function setMonthOffset(offset) {
  monthOffset = offset;
}

/**
 * Reset month offset to current month
 */
export function resetMonthOffset() {
  monthOffset = 0;
}

/**
 * Increment month offset (navigate forward)
 */
export function incrementMonthOffset() {
  monthOffset++;
}

/**
 * Decrement month offset (navigate backward)
 */
export function decrementMonthOffset() {
  monthOffset--;
}

// ============================================================
// PUBLIC API - SPACEPORT STATE
// ============================================================

/**
 * Get the spaceport session state (read-only reference)
 * @returns {Object} SpacePort session object
 */
export function getSpaceportSession() {
  return spaceportSession;
}

/**
 * Initialize/reset spaceport session
 */
export function initializeSpaceportSession() {
  spaceportSession = {
    isOperational: false,
    startTime: null,
    activeRocket: null,
    rockets: new Map(),
    sessionStartTime: null,
    launchPads: []
  };
}

/**
 * Set spaceport operational status
 * @param {boolean} isOperational - Whether spaceport is active
 */
export function setSpaceportOperational(isOperational) {
  spaceportSession.isOperational = isOperational;
}

/**
 * Set active rocket in spaceport
 * @param {string|null} rocketId - ID of active rocket, or null to clear
 */
export function setActiveRocket(rocketId) {
  spaceportSession.activeRocket = rocketId;
}

/**
 * Add a rocket to the spaceport session
 * @param {string} rocketId - Unique rocket identifier
 * @param {Object} rocketData - Rocket data (taskId, category, startTime, etc.)
 */
export function addRocket(rocketId, rocketData) {
  spaceportSession.rockets.set(rocketId, rocketData);
}

/**
 * Remove a rocket from the spaceport session
 * @param {string} rocketId - Rocket identifier to remove
 */
export function removeRocket(rocketId) {
  spaceportSession.rockets.delete(rocketId);
}

/**
 * Clear all rockets from spaceport
 */
export function clearAllRockets() {
  spaceportSession.rockets.clear();
}

/**
 * Set launch pads for spaceport
 * @param {Array} launchPads - Array of launch pad position objects
 */
export function setLaunchPads(launchPads) {
  spaceportSession.launchPads = launchPads;
}

// ============================================================
// PUBLIC API - GLOBAL FILTERS
// ============================================================

/**
 * Get all global filters
 * @returns {Object} Global filter object
 */
export function getGlobalFilters() {
  return { ...globalFilters }; // Return copy to prevent direct mutation
}

/**
 * Set global filters
 * @param {Object} filters - Filter object with projectId, phaseId, categoryId, dateRange
 */
export function setGlobalFilters(filters) {
  globalFilters = { ...globalFilters, ...filters };
  saveFiltersToStorage();
}

/**
 * Clear all global filters
 */
export function clearGlobalFilters() {
  globalFilters = {
    projectId: null,
    phaseId: null,
    categoryId: null,
    dateRange: null
  };
  saveFiltersToStorage();
}

/**
 * Get specific filter value
 * @param {string} key - Filter key ('projectId', 'phaseId', etc.)
 * @returns {*} Filter value
 */
export function getFilter(key) {
  return globalFilters[key];
}

/**
 * Set specific filter value
 * @param {string} key - Filter key
 * @param {*} value - Filter value
 */
export function setFilter(key, value) {
  globalFilters[key] = value;
  saveFiltersToStorage();
}

// ============================================================
// DEBUG HELPERS
// ============================================================

/**
 * Get all state for debugging (exposed to window in app-controller)
 * @returns {Object} Complete state snapshot
 */
export function getStateSnapshot() {
  return {
    currentView,
    monthOffset,
    spaceportSession: {
      ...spaceportSession,
      rockets: Array.from(spaceportSession.rockets.entries())
    },
    globalFilters
  };
}
