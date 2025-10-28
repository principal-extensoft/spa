/**
 * work-session-service.mjs
 * Work Session Management Service
 * 
 * Responsibilities:
 * - Work session CRUD operations (punch in/out)
 * - Activity tracking (work, lunch, meetings, breaks)
 * - Session time calculations
 * - Work session statistics and reporting
 * 
 * Dependencies: db.mjs, ui-utils.mjs
 */

import { dbPromise } from './db.mjs';
import { showToast, getTodayISO } from './ui-utils.mjs';

// ============================================================
// WORK SESSION CRUD OPERATIONS
// ============================================================

/**
 * Get active work session (if any)
 * @returns {Promise<Object|null>} Active work session or null
 */
export async function getActiveWorkSession() {
  try {
    const db = await dbPromise;
    const allSessions = await db.getAll('workSessions');
    
    // Find session without punchOut
    const activeSession = allSessions.find(session => !session.punchOut);
    return activeSession || null;
  } catch (err) {
    console.error('Error getting active work session:', err);
    return null;
  }
}

/**
 * Get work session for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
 * @returns {Promise<Object|null>} Work session or null
 */
export async function getWorkSession(date = null) {
  try {
    const db = await dbPromise;
    const targetDate = date || getTodayISO();
    const allSessions = await db.getAll('workSessions');
    
    // Find session for the date
    const session = allSessions.find(s => s.date === targetDate);
    return session || null;
  } catch (err) {
    console.error('Error getting work session:', err);
    return null;
  }
}

/**
 * Get work sessions for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of work sessions
 */
export async function getWorkSessionsForDateRange(startDate, endDate) {
  try {
    const db = await dbPromise;
    const allSessions = await db.getAll('workSessions');
    
    return allSessions.filter(session => 
      session.date >= startDate && session.date <= endDate
    );
  } catch (err) {
    console.error('Error fetching work sessions in range:', err);
    return [];
  }
}

/**
 * Save or update a work session
 * @param {Object} session - Work session object with date, punchIn, punchOut
 * @returns {Promise<Object|null>} Saved work session or null if failed
 */
export async function saveWorkSession(session) {
  try {
    const db = await dbPromise;
    
    // Calculate total hours if both punch times are provided
    if (session.punchIn && session.punchOut) {
      const punchInDate = new Date(session.punchIn);
      const punchOutDate = new Date(session.punchOut);
      const totalMilliseconds = punchOutDate - punchInDate;
      const totalHours = totalMilliseconds / (1000 * 60 * 60);
      session.totalHours = parseFloat(totalHours.toFixed(2));
    }
    
    // Initialize activities array if not present
    if (!session.activities) {
      session.activities = [];
    }
    
    // Initialize breaks array if not present
    if (!session.breaks) {
      session.breaks = [];
    }
    
    if (session.id) {
      // Update existing session
      await db.put('workSessions', session);
    } else {
      // Create new session - remove id field if it's undefined
      const { id, ...sessionWithoutId } = session;
      const newId = await db.add('workSessions', sessionWithoutId);
      session.id = newId;
    }
    
    return session;
  } catch (err) {
    console.error('Error saving work session:', err);
    showToast('Failed to save work session', 'error');
    return null;
  }
}

/**
 * Delete a work session
 * @param {number} sessionId - Work session ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteWorkSession(sessionId) {
  try {
    const db = await dbPromise;
    await db.delete('workSessions', sessionId);
    return true;
  } catch (err) {
    console.error('Error deleting work session:', err);
    showToast('Failed to delete work session', 'error');
    return false;
  }
}

// ============================================================
// PUNCH CLOCK OPERATIONS
// ============================================================

/**
 * Punch in - start a new work session
 * @returns {Promise<Object|null>} New work session object or null if failed
 */
export async function punchIn() {
  try {
    // Check if already punched in
    const activeSession = await getActiveWorkSession();
    if (activeSession) {
      showToast('You are already punched in!', 'warning');
      return activeSession;
    }
    
    const db = await dbPromise;
    const now = new Date().toISOString();
    const session = {
      date: getTodayISO(),
      punchIn: now,
      punchOut: null,
      totalHours: null,
      breaks: [],
      activities: [
        {
          startTime: now,
          endTime: null,
          category: 'work',
          description: 'Work Time'
        }
      ]
    };
    
    const id = await db.add('workSessions', session);
    session.id = id;
    
    return session;
  } catch (err) {
    console.error('Error punching in:', err);
    return null;
  }
}

/**
 * Punch out - end the active work session
 * @returns {Promise<Object|null>} Updated work session or null if failed
 */
export async function punchOut() {
  try {
    const activeSession = await getActiveWorkSession();
    if (!activeSession) {
      showToast('No active work session found', 'warning');
      return null;
    }
    
    const db = await dbPromise;
    const punchOutTime = new Date().toISOString();
    
    // End current activity if any
    if (activeSession.activities && activeSession.activities.length > 0) {
      const lastActivity = activeSession.activities[activeSession.activities.length - 1];
      if (!lastActivity.endTime) {
        lastActivity.endTime = punchOutTime;
      }
    }
    
    // Calculate total hours
    const punchInDate = new Date(activeSession.punchIn);
    const punchOutDate = new Date(punchOutTime);
    const totalMilliseconds = punchOutDate - punchInDate;
    const totalHours = totalMilliseconds / (1000 * 60 * 60);
    
    activeSession.punchOut = punchOutTime;
    activeSession.totalHours = parseFloat(totalHours.toFixed(2));
    
    await db.put('workSessions', activeSession);
    
    return activeSession;
  } catch (err) {
    console.error('Error punching out:', err);
    return null;
  }
}

// ============================================================
// ACTIVITY TRACKING
// ============================================================

/**
 * Record an activity/interruption (lunch, meeting, personal, work)
 * @param {string} category - Activity category: 'work', 'lunch', 'meeting', 'personal', 'custom'
 * @param {string} description - Activity description
 * @returns {Promise<Object|null>} Updated work session or null if failed
 */
export async function recordActivity(category, description) {
  try {
    const activeSession = await getActiveWorkSession();
    if (!activeSession) {
      showToast('No active work session. Please punch in first.', 'warning');
      return null;
    }
    
    const db = await dbPromise;
    const now = new Date().toISOString();
    
    // Initialize activities array if it doesn't exist (for old sessions)
    if (!activeSession.activities) {
      activeSession.activities = [];
    }
    
    // End current activity if any
    if (activeSession.activities.length > 0) {
      const lastActivity = activeSession.activities[activeSession.activities.length - 1];
      if (!lastActivity.endTime) {
        lastActivity.endTime = now;
      }
    }
    
    // Start new activity
    const newActivity = {
      startTime: now,
      endTime: null,
      category: category,
      description: description
    };
    
    activeSession.activities.push(newActivity);
    
    // Save to database
    await db.put('workSessions', activeSession);
    
    return activeSession;
  } catch (err) {
    console.error('Error recording activity:', err);
    return null;
  }
}

/**
 * Get current activity from active work session
 * @returns {Promise<Object|null>} Current activity or null
 */
export async function getCurrentActivity() {
  try {
    const activeSession = await getActiveWorkSession();
    if (!activeSession || !activeSession.activities || activeSession.activities.length === 0) {
      return null;
    }
    
    // Return last activity without end time
    const lastActivity = activeSession.activities[activeSession.activities.length - 1];
    return !lastActivity.endTime ? lastActivity : null;
  } catch (err) {
    console.error('Error getting current activity:', err);
    return null;
  }
}

/**
 * End current activity without starting a new one
 * @returns {Promise<Object|null>} Updated work session or null if failed
 */
export async function endCurrentActivity() {
  try {
    const activeSession = await getActiveWorkSession();
    if (!activeSession || !activeSession.activities || activeSession.activities.length === 0) {
      return null;
    }
    
    const lastActivity = activeSession.activities[activeSession.activities.length - 1];
    if (!lastActivity.endTime) {
      lastActivity.endTime = new Date().toISOString();
      
      const db = await dbPromise;
      await db.put('workSessions', activeSession);
    }
    
    return activeSession;
  } catch (err) {
    console.error('Error ending current activity:', err);
    return null;
  }
}

// ============================================================
// TIME CALCULATIONS
// ============================================================

/**
 * Calculate work session time breakdown
 * @param {Object} session - Work session object
 * @returns {Object} Time breakdown
 */
export function calculateSessionTimeBreakdown(session) {
  if (!session || !session.punchIn) {
    return {
      totalTime: 0,
      workTime: 0,
      breakTime: 0,
      lunchTime: 0,
      meetingTime: 0,
      personalTime: 0,
      customTime: 0
    };
  }
  
  const punchInTime = new Date(session.punchIn);
  const punchOutTime = session.punchOut ? new Date(session.punchOut) : new Date();
  const totalTime = (punchOutTime - punchInTime) / (1000 * 60 * 60); // Hours
  
  let workTime = 0;
  let breakTime = 0;
  let lunchTime = 0;
  let meetingTime = 0;
  let personalTime = 0;
  let customTime = 0;
  
  if (session.activities && session.activities.length > 0) {
    session.activities.forEach(activity => {
      const startTime = new Date(activity.startTime);
      const endTime = activity.endTime ? new Date(activity.endTime) : new Date();
      const duration = (endTime - startTime) / (1000 * 60 * 60); // Hours
      
      switch (activity.category) {
        case 'work':
          workTime += duration;
          break;
        case 'lunch':
          lunchTime += duration;
          break;
        case 'meeting':
          meetingTime += duration;
          break;
        case 'personal':
          personalTime += duration;
          break;
        case 'custom':
          customTime += duration;
          break;
        default:
          breakTime += duration;
          break;
      }
    });
  } else {
    // If no activities recorded, assume all time is work time
    workTime = totalTime;
  }
  
  return {
    totalTime: parseFloat(totalTime.toFixed(2)),
    workTime: parseFloat(workTime.toFixed(2)),
    breakTime: parseFloat(breakTime.toFixed(2)),
    lunchTime: parseFloat(lunchTime.toFixed(2)),
    meetingTime: parseFloat(meetingTime.toFixed(2)),
    personalTime: parseFloat(personalTime.toFixed(2)),
    customTime: parseFloat(customTime.toFixed(2))
  };
}

/**
 * Get current session elapsed time
 * @returns {Promise<number>} Elapsed time in hours
 */
export async function getCurrentSessionElapsedTime() {
  try {
    const activeSession = await getActiveWorkSession();
    if (!activeSession) return 0;
    
    const punchInTime = new Date(activeSession.punchIn);
    const now = new Date();
    const elapsedMilliseconds = now - punchInTime;
    const elapsedHours = elapsedMilliseconds / (1000 * 60 * 60);
    
    return parseFloat(elapsedHours.toFixed(2));
  } catch (err) {
    console.error('Error calculating current session elapsed time:', err);
    return 0;
  }
}

// ============================================================
// STATISTICS AND REPORTING
// ============================================================

/**
 * Get work session statistics for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Statistics object
 */
export async function getWorkSessionStats(startDate, endDate) {
  try {
    const sessions = await getWorkSessionsForDateRange(startDate, endDate);
    
    let totalHours = 0;
    let totalWorkTime = 0;
    let totalBreakTime = 0;
    let totalLunchTime = 0;
    let totalMeetingTime = 0;
    let totalPersonalTime = 0;
    let daysWorked = 0;
    
    sessions.forEach(session => {
      if (session.punchIn) {
        daysWorked++;
        const breakdown = calculateSessionTimeBreakdown(session);
        totalHours += breakdown.totalTime;
        totalWorkTime += breakdown.workTime;
        totalBreakTime += breakdown.breakTime;
        totalLunchTime += breakdown.lunchTime;
        totalMeetingTime += breakdown.meetingTime;
        totalPersonalTime += breakdown.personalTime;
      }
    });
    
    return {
      daysWorked,
      totalHours: parseFloat(totalHours.toFixed(2)),
      totalWorkTime: parseFloat(totalWorkTime.toFixed(2)),
      totalBreakTime: parseFloat(totalBreakTime.toFixed(2)),
      totalLunchTime: parseFloat(totalLunchTime.toFixed(2)),
      totalMeetingTime: parseFloat(totalMeetingTime.toFixed(2)),
      totalPersonalTime: parseFloat(totalPersonalTime.toFixed(2)),
      averageHoursPerDay: daysWorked > 0 ? parseFloat((totalHours / daysWorked).toFixed(2)) : 0,
      averageWorkTimePerDay: daysWorked > 0 ? parseFloat((totalWorkTime / daysWorked).toFixed(2)) : 0
    };
  } catch (err) {
    console.error('Error calculating work session stats:', err);
    return {
      daysWorked: 0,
      totalHours: 0,
      totalWorkTime: 0,
      totalBreakTime: 0,
      totalLunchTime: 0,
      totalMeetingTime: 0,
      totalPersonalTime: 0,
      averageHoursPerDay: 0,
      averageWorkTimePerDay: 0
    };
  }
}

/**
 * Check if currently punched in
 * @returns {Promise<boolean>} True if currently punched in
 */
export async function isPunchedIn() {
  const activeSession = await getActiveWorkSession();
  return activeSession !== null;
}

/**
 * Get punch status summary
 * @returns {Promise<Object>} Status summary
 */
export async function getPunchStatus() {
  try {
    const activeSession = await getActiveWorkSession();
    const currentActivity = await getCurrentActivity();
    
    if (!activeSession) {
      return {
        isPunchedIn: false,
        sessionStartTime: null,
        elapsedTime: 0,
        currentActivity: null,
        status: 'Not Punched In'
      };
    }
    
    const elapsedTime = await getCurrentSessionElapsedTime();
    
    return {
      isPunchedIn: true,
      sessionStartTime: activeSession.punchIn,
      elapsedTime,
      currentActivity,
      status: currentActivity ? currentActivity.description : 'Working'
    };
  } catch (err) {
    console.error('Error getting punch status:', err);
    return {
      isPunchedIn: false,
      sessionStartTime: null,
      elapsedTime: 0,
      currentActivity: null,
      status: 'Error'
    };
  }
}