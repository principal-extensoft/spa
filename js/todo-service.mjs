/**
 * todo-service.mjs
 * Todo Management Service
 * 
 * Responsibilities:
 * - CRUD operations for todos
 * - Todo completion tracking
 * - Todo filtering and sorting
 * - Todo statistics
 * 
 * Dependencies: db.mjs, ui-utils.mjs
 */

import { dbPromise } from './db.mjs';
import { showToast } from './ui-utils.mjs';

// ============================================================
// TODO CRUD OPERATIONS
// ============================================================

/**
 * Save a new todo
 * @param {string} title - Todo title
 * @param {string} content - Todo description/content
 * @returns {Promise<Object|null>} Saved todo object or null if failed
 */
export async function saveTodo(title, content = '') {
  const todo = {
    title: title,
    content: content,
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null
  };
  
  try {
    const db = await dbPromise;
    const id = await db.add('todos', todo);
    todo.id = id;
    
    return todo;
  } catch (err) {
    console.error('Error adding todo:', err);
    return null;
  }
}

/**
 * Get all todos, optionally filtered
 * @param {boolean} includeCompleted - Include completed todos
 * @returns {Promise<Array>} Array of todo objects
 */
export async function getTodos(includeCompleted = false) {
  try {
    const db = await dbPromise;
    const allTodos = await db.getAll('todos');
    
    // Filter todos based on completion status
    const todosToShow = includeCompleted 
      ? allTodos
      : allTodos.filter(todo => !todo.completed);
    
    // Sort: active todos first, then by creation date (newest first)
    todosToShow.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1; // Active todos first
      }
      return new Date(b.createdAt) - new Date(a.createdAt); // Newest first within each group
    });
    
    return todosToShow;
  } catch (err) {
    console.error('Error loading todos:', err);
    return [];
  }
}

/**
 * Get todo by ID
 * @param {number} todoId - Todo ID
 * @returns {Promise<Object|null>} Todo object or null if not found
 */
export async function getTodoById(todoId) {
  try {
    const db = await dbPromise;
    return await db.get('todos', todoId);
  } catch (err) {
    console.error('Error fetching todo by ID:', err);
    return null;
  }
}

/**
 * Update an existing todo
 * @param {Object} todo - Todo object with updated properties
 * @returns {Promise<boolean>} True if updated successfully
 */
export async function updateTodo(todo) {
  try {
    const db = await dbPromise;
    await db.put('todos', todo);
    return true;
  } catch (err) {
    console.error('Error updating todo:', err);
    return false;
  }
}

/**
 * Delete todo by ID
 * @param {number} todoId - Todo ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteTodo(todoId) {
  try {
    const db = await dbPromise;
    await db.delete('todos', todoId);
    
    return true;
  } catch (err) {
    console.error('Error deleting todo:', err);
    return false;
  }
}

// ============================================================
// TODO COMPLETION MANAGEMENT
// ============================================================

/**
 * Toggle todo completion status
 * @param {number} todoId - Todo ID
 * @returns {Promise<boolean>} True if toggled successfully
 */
export async function toggleTodo(todoId) {
  try {
    const db = await dbPromise;
    const todo = await db.get('todos', todoId);
    
    if (!todo) {
      console.error('Todo not found:', todoId);
      return false;
    }
    
    todo.completed = !todo.completed;
    
    // Set or clear completion timestamp
    if (todo.completed) {
      todo.completedAt = new Date().toISOString();
    } else {
      todo.completedAt = null;
    }
    
    await db.put('todos', todo);
    
    return true;
  } catch (err) {
    console.error('Error toggling todo:', err);
    return false;
  }
}

/**
 * Mark todo as completed
 * @param {number} todoId - Todo ID
 * @returns {Promise<boolean>} True if completed successfully
 */
export async function completeTodo(todoId) {
  try {
    const todo = await getTodoById(todoId);
    if (!todo) return false;
    
    if (!todo.completed) {
      todo.completed = true;
      todo.completedAt = new Date().toISOString();
      return await updateTodo(todo);
    }
    
    return true; // Already completed
  } catch (err) {
    console.error('Error completing todo:', err);
    return false;
  }
}

/**
 * Mark todo as incomplete
 * @param {number} todoId - Todo ID
 * @returns {Promise<boolean>} True if uncompleted successfully
 */
export async function uncompleteTodo(todoId) {
  try {
    const todo = await getTodoById(todoId);
    if (!todo) return false;
    
    if (todo.completed) {
      todo.completed = false;
      todo.completedAt = null;
      return await updateTodo(todo);
    }
    
    return true; // Already incomplete
  } catch (err) {
    console.error('Error uncompleting todo:', err);
    return false;
  }
}

// ============================================================
// TODO STATISTICS
// ============================================================

/**
 * Get count of active (incomplete) todos
 * @returns {Promise<number>} Count of active todos
 */
export async function getActiveTodoCount() {
  const todos = await getTodos(false);
  return todos.length;
}

/**
 * Get count of completed todos
 * @returns {Promise<number>} Count of completed todos
 */
export async function getCompletedTodoCount() {
  try {
    const db = await dbPromise;
    const allTodos = await db.getAll('todos');
    return allTodos.filter(todo => todo.completed).length;
  } catch (err) {
    console.error('Error counting completed todos:', err);
    return 0;
  }
}

/**
 * Get total todo count
 * @returns {Promise<number>} Total count of todos
 */
export async function getTotalTodoCount() {
  try {
    const db = await dbPromise;
    const allTodos = await db.getAll('todos');
    return allTodos.length;
  } catch (err) {
    console.error('Error counting total todos:', err);
    return 0;
  }
}

/**
 * Get todo completion statistics
 * @returns {Promise<Object>} Object with completion stats
 */
export async function getTodoStats() {
  try {
    const active = await getActiveTodoCount();
    const completed = await getCompletedTodoCount();
    const total = active + completed;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    
    return {
      active,
      completed,
      total,
      completionRate: Math.round(completionRate * 10) / 10 // Round to 1 decimal
    };
  } catch (err) {
    console.error('Error calculating todo stats:', err);
    return {
      active: 0,
      completed: 0,
      total: 0,
      completionRate: 0
    };
  }
}

// ============================================================
// TODO FILTERING AND SEARCH
// ============================================================

/**
 * Search todos by title or content
 * @param {string} searchTerm - Search term
 * @param {boolean} includeCompleted - Include completed todos in search
 * @returns {Promise<Array>} Array of matching todos
 */
export async function searchTodos(searchTerm, includeCompleted = false) {
  try {
    const allTodos = await getTodos(includeCompleted);
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return allTodos.filter(todo => 
      todo.title.toLowerCase().includes(lowerSearchTerm) ||
      (todo.content && todo.content.toLowerCase().includes(lowerSearchTerm))
    );
  } catch (err) {
    console.error('Error searching todos:', err);
    return [];
  }
}

/**
 * Get todos created within a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of todos created in range
 */
export async function getTodosInDateRange(startDate, endDate) {
  try {
    const db = await dbPromise;
    const allTodos = await db.getAll('todos');
    
    return allTodos.filter(todo => {
      const createdDate = todo.createdAt.split('T')[0]; // Extract YYYY-MM-DD
      return createdDate >= startDate && createdDate <= endDate;
    });
  } catch (err) {
    console.error('Error fetching todos in date range:', err);
    return [];
  }
}

/**
 * Get todos completed within a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of todos completed in range
 */
export async function getTodosCompletedInDateRange(startDate, endDate) {
  try {
    const db = await dbPromise;
    const allTodos = await db.getAll('todos');
    
    return allTodos.filter(todo => {
      if (!todo.completed || !todo.completedAt) return false;
      const completedDate = todo.completedAt.split('T')[0]; // Extract YYYY-MM-DD
      return completedDate >= startDate && completedDate <= endDate;
    });
  } catch (err) {
    console.error('Error fetching todos completed in date range:', err);
    return [];
  }
}

// ============================================================
// BULK OPERATIONS
// ============================================================

/**
 * Complete multiple todos
 * @param {Array<number>} todoIds - Array of todo IDs to complete
 * @returns {Promise<number>} Number of todos successfully completed
 */
export async function completeTodos(todoIds) {
  let completedCount = 0;
  
  for (const todoId of todoIds) {
    const success = await completeTodo(todoId);
    if (success) completedCount++;
  }
  
  return completedCount;
}

/**
 * Delete multiple todos
 * @param {Array<number>} todoIds - Array of todo IDs to delete
 * @returns {Promise<number>} Number of todos successfully deleted
 */
export async function deleteTodos(todoIds) {
  let deletedCount = 0;
  
  for (const todoId of todoIds) {
    const success = await deleteTodo(todoId);
    if (success) deletedCount++;
  }
  
  return deletedCount;
}

/**
 * Clear all completed todos
 * @returns {Promise<number>} Number of todos deleted
 */
export async function clearCompletedTodos() {
  try {
    const completedTodos = await getTodos(true);
    const completedIds = completedTodos
      .filter(todo => todo.completed)
      .map(todo => todo.id);
    
    return await deleteTodos(completedIds);
  } catch (err) {
    console.error('Error clearing completed todos:', err);
    return 0;
  }
}