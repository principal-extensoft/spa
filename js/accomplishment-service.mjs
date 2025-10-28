/**
 * accomplishment-service.mjs
 * Accomplishment Management Service
 * 
 * Responsibilities:
 * - CRUD operations for accomplishments
 * - Date-based accomplishment queries
 * - Accomplishment statistics and reporting
 * - Daily accomplishment management
 * 
 * Dependencies: db.mjs, ui-utils.mjs
 */

import { dbPromise } from './db.mjs';
import { getTodayISO } from './ui-utils.mjs';

// ============================================================
// ACCOMPLISHMENT CRUD OPERATIONS
// ============================================================

/**
 * Save a new accomplishment
 * @param {string} title - Accomplishment title
 * @param {string} content - Accomplishment details/content
 * @param {string} date - Date (YYYY-MM-DD), defaults to today
 * @returns {Promise<Object|null>} Saved accomplishment object or null if failed
 */
export async function saveAccomplishment(title, content = '', date = null) {
  const accomplishment = {
    title: title,
    content: content,
    date: date || getTodayISO(),
    createdAt: new Date().toISOString()
  };
  
  try {
    const db = await dbPromise;
    const id = await db.add('accomplishments', accomplishment);
    accomplishment.id = id;
    
    return accomplishment;
  } catch (err) {
    console.error('Error adding accomplishment:', err);
    return null;
  }
}

/**
 * Get accomplishments for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
 * @returns {Promise<Array>} Array of accomplishment objects
 */
export async function getAccomplishments(date = null) {
  try {
    const db = await dbPromise;
    const targetDate = date || getTodayISO();
    const allAccomplishments = await db.getAll('accomplishments');
    
    // Filter by date
    const filteredAccomplishments = allAccomplishments.filter(acc => acc.date === targetDate);
    
    // Sort by creation time (newest first)
    filteredAccomplishments.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    return filteredAccomplishments;
  } catch (err) {
    console.error('Error loading accomplishments:', err);
    return [];
  }
}

/**
 * Get accomplishments for today
 * @returns {Promise<Array>} Array of today's accomplishments
 */
export async function getTodayAccomplishments() {
  return getAccomplishments();
}

/**
 * Get accomplishment by ID
 * @param {number} accomplishmentId - Accomplishment ID
 * @returns {Promise<Object|null>} Accomplishment object or null if not found
 */
export async function getAccomplishmentById(accomplishmentId) {
  try {
    const db = await dbPromise;
    return await db.get('accomplishments', accomplishmentId);
  } catch (err) {
    console.error('Error fetching accomplishment by ID:', err);
    return null;
  }
}

/**
 * Update an existing accomplishment
 * @param {Object} accomplishment - Accomplishment object with updated properties
 * @returns {Promise<boolean>} True if updated successfully
 */
export async function updateAccomplishment(accomplishment) {
  try {
    const db = await dbPromise;
    await db.put('accomplishments', accomplishment);
    return true;
  } catch (err) {
    console.error('Error updating accomplishment:', err);
    return false;
  }
}

/**
 * Delete accomplishment by ID
 * @param {number} accomplishmentId - Accomplishment ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteAccomplishment(accomplishmentId) {
  try {
    const db = await dbPromise;
    await db.delete('accomplishments', accomplishmentId);
    
    return true;
  } catch (err) {
    console.error('Error deleting accomplishment:', err);
    return false;
  }
}

// ============================================================
// DATE-BASED QUERIES
// ============================================================

/**
 * Get accomplishments for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of accomplishments in date range
 */
export async function getAccomplishmentsInRange(startDate, endDate) {
  try {
    const db = await dbPromise;
    const allAccomplishments = await db.getAll('accomplishments');
    
    return allAccomplishments.filter(acc => 
      acc.date >= startDate && acc.date <= endDate
    );
  } catch (err) {
    console.error('Error fetching accomplishments in range:', err);
    return [];
  }
}

/**
 * Get accomplishments for the current week
 * @returns {Promise<Array>} Array of this week's accomplishments
 */
export async function getThisWeekAccomplishments() {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
  endOfWeek.setHours(23, 59, 59, 999);
  
  const startDate = startOfWeek.toISOString().split('T')[0];
  const endDate = endOfWeek.toISOString().split('T')[0];
  
  return getAccomplishmentsInRange(startDate, endDate);
}

/**
 * Get accomplishments for the current month
 * @returns {Promise<Array>} Array of this month's accomplishments
 */
export async function getThisMonthAccomplishments() {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const startDate = startOfMonth.toISOString().split('T')[0];
  const endDate = endOfMonth.toISOString().split('T')[0];
  
  return getAccomplishmentsInRange(startDate, endDate);
}

/**
 * Get accomplishments for the current year
 * @returns {Promise<Array>} Array of this year's accomplishments
 */
export async function getThisYearAccomplishments() {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const endOfYear = new Date(today.getFullYear(), 11, 31);
  
  const startDate = startOfYear.toISOString().split('T')[0];
  const endDate = endOfYear.toISOString().split('T')[0];
  
  return getAccomplishmentsInRange(startDate, endDate);
}

// ============================================================
// STATISTICS AND REPORTING
// ============================================================

/**
 * Get count of accomplishments for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
 * @returns {Promise<number>} Count of accomplishments
 */
export async function getAccomplishmentCount(date = null) {
  const accomplishments = await getAccomplishments(date);
  return accomplishments.length;
}

/**
 * Get accomplishment statistics for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Statistics object
 */
export async function getAccomplishmentStats(startDate, endDate) {
  try {
    const accomplishments = await getAccomplishmentsInRange(startDate, endDate);
    
    // Group by date
    const byDate = {};
    accomplishments.forEach(acc => {
      if (!byDate[acc.date]) {
        byDate[acc.date] = 0;
      }
      byDate[acc.date]++;
    });
    
    const dates = Object.keys(byDate);
    const counts = Object.values(byDate);
    
    return {
      total: accomplishments.length,
      daysWithAccomplishments: dates.length,
      averagePerDay: dates.length > 0 ? accomplishments.length / dates.length : 0,
      maxInDay: counts.length > 0 ? Math.max(...counts) : 0,
      minInDay: counts.length > 0 ? Math.min(...counts) : 0,
      byDate
    };
  } catch (err) {
    console.error('Error calculating accomplishment stats:', err);
    return {
      total: 0,
      daysWithAccomplishments: 0,
      averagePerDay: 0,
      maxInDay: 0,
      minInDay: 0,
      byDate: {}
    };
  }
}

/**
 * Get streak information (consecutive days with accomplishments)
 * @returns {Promise<Object>} Streak information
 */
export async function getAccomplishmentStreak() {
  try {
    // Get last 100 days of accomplishments to calculate streak
    const endDate = getTodayISO();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 100);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const accomplishments = await getAccomplishmentsInRange(startDateStr, endDate);
    
    // Get unique dates with accomplishments
    const datesWithAccomplishments = [...new Set(accomplishments.map(acc => acc.date))].sort();
    
    // Calculate current streak (working backwards from today)
    let currentStreak = 0;
    const today = new Date();
    
    for (let i = 0; i >= -100; i--) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const checkDateStr = checkDate.toISOString().split('T')[0];
      
      if (datesWithAccomplishments.includes(checkDateStr)) {
        currentStreak++;
      } else {
        break;
      }
    }
    
    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    
    // Create array of all dates in range
    const allDates = [];
    for (let i = 0; i <= 100; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      allDates.push(date.toISOString().split('T')[0]);
    }
    
    allDates.forEach(date => {
      if (datesWithAccomplishments.includes(date)) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    });
    
    return {
      currentStreak,
      longestStreak,
      totalDaysWithAccomplishments: datesWithAccomplishments.length
    };
  } catch (err) {
    console.error('Error calculating accomplishment streak:', err);
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalDaysWithAccomplishments: 0
    };
  }
}

// ============================================================
// SEARCH AND FILTERING
// ============================================================

/**
 * Search accomplishments by title or content
 * @param {string} searchTerm - Search term
 * @param {string} startDate - Start date (YYYY-MM-DD), optional
 * @param {string} endDate - End date (YYYY-MM-DD), optional
 * @returns {Promise<Array>} Array of matching accomplishments
 */
export async function searchAccomplishments(searchTerm, startDate = null, endDate = null) {
  try {
    let accomplishments;
    
    if (startDate && endDate) {
      accomplishments = await getAccomplishmentsInRange(startDate, endDate);
    } else {
      const db = await dbPromise;
      accomplishments = await db.getAll('accomplishments');
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return accomplishments.filter(acc => 
      acc.title.toLowerCase().includes(lowerSearchTerm) ||
      (acc.content && acc.content.toLowerCase().includes(lowerSearchTerm))
    );
  } catch (err) {
    console.error('Error searching accomplishments:', err);
    return [];
  }
}

// ============================================================
// BULK OPERATIONS
// ============================================================

/**
 * Delete multiple accomplishments
 * @param {Array<number>} accomplishmentIds - Array of accomplishment IDs to delete
 * @returns {Promise<number>} Number of accomplishments successfully deleted
 */
export async function deleteAccomplishments(accomplishmentIds) {
  let deletedCount = 0;
  
  for (const accomplishmentId of accomplishmentIds) {
    const success = await deleteAccomplishment(accomplishmentId);
    if (success) deletedCount++;
  }
  
  return deletedCount;
}

/**
 * Clear all accomplishments for a specific date
 * @param {string} date - Date (YYYY-MM-DD), defaults to today
 * @returns {Promise<number>} Number of accomplishments deleted
 */
export async function clearAccomplishmentsForDate(date = null) {
  try {
    const accomplishments = await getAccomplishments(date);
    const accomplishmentIds = accomplishments.map(acc => acc.id);
    
    return await deleteAccomplishments(accomplishmentIds);
  } catch (err) {
    console.error('Error clearing accomplishments for date:', err);
    return 0;
  }
}

/**
 * Move accomplishments from one date to another
 * @param {string} fromDate - Source date (YYYY-MM-DD)
 * @param {string} toDate - Target date (YYYY-MM-DD)
 * @returns {Promise<number>} Number of accomplishments moved
 */
export async function moveAccomplishments(fromDate, toDate) {
  try {
    const accomplishments = await getAccomplishments(fromDate);
    let movedCount = 0;
    
    for (const accomplishment of accomplishments) {
      accomplishment.date = toDate;
      const success = await updateAccomplishment(accomplishment);
      if (success) movedCount++;
    }
    
    return movedCount;
  } catch (err) {
    console.error('Error moving accomplishments:', err);
    return 0;
  }
}