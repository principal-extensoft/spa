/**
 * daily-service.mjs
 * Daily Summary and Aggregation Service
 * 
 * Responsibilities:
 * - Aggregate daily summaries from focused services
 * - Provide unified daily dashboard data
 * - Daily productivity metrics
 * 
 * Dependencies: todo-service.mjs, accomplishment-service.mjs, work-session-service.mjs
 */

import { getTodayISO } from './ui-utils.mjs';

// Re-export functions from focused services for backwards compatibility
export { 
  getTodos, 
  saveTodo, 
  toggleTodo, 
  deleteTodo, 
  getTodoById, 
  updateTodo,
  getActiveTodoCount, 
  getCompletedTodoCount,
  getTodoStats,
  searchTodos
} from './todo-service.mjs';

export { 
  getAccomplishments, 
  saveAccomplishment, 
  deleteAccomplishment, 
  getAccomplishmentById,
  updateAccomplishment,
  getTodayAccomplishments,
  getAccomplishmentsInRange,
  getThisWeekAccomplishments,
  getThisMonthAccomplishments,
  getAccomplishmentCount,
  getAccomplishmentStats,
  searchAccomplishments
} from './accomplishment-service.mjs';

export { 
  getActiveWorkSession, 
  getWorkSession,
  punchIn, 
  punchOut, 
  recordActivity, 
  getCurrentActivity,
  getWorkSessionsForDateRange,
  saveWorkSession,
  deleteWorkSession,
  calculateSessionTimeBreakdown,
  getCurrentSessionElapsedTime,
  getWorkSessionStats,
  isPunchedIn,
  getPunchStatus
} from './work-session-service.mjs';

// ============================================================
// DAILY SUMMARY AGGREGATION
// ============================================================

/**
 * Get comprehensive daily summary
 * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
 * @returns {Promise<Object>} Complete daily summary
 */
export async function getDailySummary(date = null) {
  const targetDate = date || getTodayISO();
  
  // Import focused services dynamically to avoid circular dependencies
  const { getTodos, getTodoStats } = await import('./todo-service.mjs');
  const { getAccomplishments, getAccomplishmentCount } = await import('./accomplishment-service.mjs');
  const { getWorkSession, calculateSessionTimeBreakdown } = await import('./work-session-service.mjs');
  
  try {
    // Get todos (not date-specific, get all active)
    const todos = await getTodos(false);
    const todoStats = await getTodoStats();
    
    // Get accomplishments for the date
    const accomplishments = await getAccomplishments(targetDate);
    const accomplishmentCount = await getAccomplishmentCount(targetDate);
    
    // Get work session for the date
    const workSession = await getWorkSession(targetDate);
    const sessionBreakdown = workSession ? calculateSessionTimeBreakdown(workSession) : null;
    
    return {
      date: targetDate,
      todos: {
        active: todos,
        stats: todoStats
      },
      accomplishments: {
        list: accomplishments,
        count: accomplishmentCount
      },
      workSession: {
        session: workSession,
        timeBreakdown: sessionBreakdown,
        isPunchedIn: workSession && !workSession.punchOut
      },
      productivity: {
        todosCompleted: todoStats.completed,
        accomplishmentsLogged: accomplishmentCount,
        hoursWorked: sessionBreakdown ? sessionBreakdown.workTime : 0,
        totalHours: sessionBreakdown ? sessionBreakdown.totalTime : 0
      }
    };
  } catch (err) {
    console.error('Error generating daily summary:', err);
    return {
      date: targetDate,
      todos: { active: [], stats: { active: 0, completed: 0, total: 0, completionRate: 0 } },
      accomplishments: { list: [], count: 0 },
      workSession: { session: null, timeBreakdown: null, isPunchedIn: false },
      productivity: { todosCompleted: 0, accomplishmentsLogged: 0, hoursWorked: 0, totalHours: 0 }
    };
  }
}

/**
 * Get daily productivity score (0-100)
 * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
 * @returns {Promise<number>} Productivity score
 */
export async function getDailyProductivityScore(date = null) {
  try {
    const summary = await getDailySummary(date);
    
    let score = 0;
    
    // Todo completion (0-30 points)
    const todoCompletionRate = summary.todos.stats.completionRate;
    score += Math.min(30, todoCompletionRate * 0.3);
    
    // Accomplishments (0-25 points)
    const accomplishmentPoints = Math.min(25, summary.accomplishments.count * 5);
    score += accomplishmentPoints;
    
    // Work hours (0-35 points)
    const workHours = summary.workSession.timeBreakdown?.workTime || 0;
    const workPoints = Math.min(35, workHours * 4.375); // 8 hours = 35 points
    score += workPoints;
    
    // Work efficiency (0-10 points)
    const totalHours = summary.workSession.timeBreakdown?.totalTime || 0;
    if (totalHours > 0) {
      const efficiency = (summary.workSession.timeBreakdown?.workTime || 0) / totalHours;
      score += efficiency * 10;
    }
    
    return Math.round(Math.min(100, score));
  } catch (err) {
    console.error('Error calculating daily productivity score:', err);
    return 0;
  }
}

/**
 * Get weekly summary
 * @returns {Promise<Object>} Weekly summary
 */
export async function getWeeklySummary() {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
  
  const startDate = startOfWeek.toISOString().split('T')[0];
  const endDate = endOfWeek.toISOString().split('T')[0];
  
  const { getThisWeekAccomplishments } = await import('./accomplishment-service.mjs');
  const { getWorkSessionStats } = await import('./work-session-service.mjs');
  const { getTodoStats } = await import('./todo-service.mjs');
  
  try {
    const accomplishments = await getThisWeekAccomplishments();
    const workStats = await getWorkSessionStats(startDate, endDate);
    const todoStats = await getTodoStats();
    
    return {
      startDate,
      endDate,
      accomplishments: accomplishments.length,
      hoursWorked: workStats.totalWorkTime,
      daysWorked: workStats.daysWorked,
      averageHoursPerDay: workStats.averageWorkTimePerDay,
      todoStats
    };
  } catch (err) {
    console.error('Error generating weekly summary:', err);
    return {
      startDate,
      endDate,
      accomplishments: 0,
      hoursWorked: 0,
      daysWorked: 0,
      averageHoursPerDay: 0,
      todoStats: { active: 0, completed: 0, total: 0, completionRate: 0 }
    };
  }
}
