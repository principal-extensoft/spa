/**
 * db.mjs
 * Database Layer - IndexedDB schema, migrations, and connection
 * 
 * Responsibilities:
 * - Database schema definition and versioning
 * - Migrations for schema upgrades
 * - Database connection promise export
 * - Database statistics utility
 * - Data seeding (sample category lists)
 * - Legacy data migrations
 * 
 * Dependencies: idb library (CDN import)
 * Zero internal dependencies
 */

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7.1.1/build/index.js';

// Database version and schema definition
const DB_NAME = 'TaskTimeTracker';
const DB_VERSION = 10;

/**
 * Database promise - main connection to IndexedDB
 * Handles all schema upgrades from version 1-10
 */
export const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion) {
    console.log('Upgrading database from version', oldVersion);
    
    // Version 1: Initial schema - tasks and timeLogs
    if (oldVersion < 1) {
      const taskStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
      taskStore.createIndex('dueOn', 'dueOn');
      taskStore.createIndex('status', 'status');
      taskStore.createIndex('urgency', 'urgency');
      
      const timeStore = db.createObjectStore('timeLogs', { keyPath: 'id', autoIncrement: true });
      timeStore.createIndex('taskId', 'taskId');
      timeStore.createIndex('dateLogged', 'dateLogged');
    }
    
    // Version 5: Add todos and accomplishments
    if (oldVersion < 5) {
      if (!db.objectStoreNames.contains('todos')) {
        const todoStore = db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true });
        todoStore.createIndex('date', 'date');
        todoStore.createIndex('completed', 'completed');
      }
      
      if (!db.objectStoreNames.contains('accomplishments')) {
        const accomplishmentStore = db.createObjectStore('accomplishments', { keyPath: 'id', autoIncrement: true });
        accomplishmentStore.createIndex('date', 'date');
      }
    }
    
    // Version 6: Add workSessions for punch clock
    if (oldVersion < 6) {
      if (!db.objectStoreNames.contains('workSessions')) {
        const workSessionStore = db.createObjectStore('workSessions', { keyPath: 'id', autoIncrement: true });
        workSessionStore.createIndex('date', 'date');
        workSessionStore.createIndex('punchIn', 'punchIn');
        workSessionStore.createIndex('punchOut', 'punchOut');
      }
    }
    
    // Version 7: Add categoryLists for time categorization
    if (oldVersion < 7) {
      if (!db.objectStoreNames.contains('categoryLists')) {
        const categoryListStore = db.createObjectStore('categoryLists', { keyPath: 'id', autoIncrement: true });
        categoryListStore.createIndex('slug', 'slug', { unique: true });
        categoryListStore.createIndex('title', 'title');
      }
    }
    
    // Version 8: Add remainingHoursHistory for burn-down tracking
    if (oldVersion < 8) {
      if (!db.objectStoreNames.contains('remainingHoursHistory')) {
        const remainingHoursStore = db.createObjectStore('remainingHoursHistory', { keyPath: 'id', autoIncrement: true });
        remainingHoursStore.createIndex('taskId', 'taskId');
        remainingHoursStore.createIndex('timestamp', 'timestamp');
      }
    }
    
    // Version 9: Add projects and phases (phases replaced in v10)
    if (oldVersion < 9) {
      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
        projectStore.createIndex('name', 'name');
        projectStore.createIndex('status', 'status');
      }
      
      if (!db.objectStoreNames.contains('phases')) {
        const phaseStore = db.createObjectStore('phases', { keyPath: 'id', autoIncrement: true });
        phaseStore.createIndex('name', 'name');
      }
    }
    
    // Version 10: Replace phases with phaseLists (like categoryLists)
    if (oldVersion < 10) {
      if (db.objectStoreNames.contains('phases')) {
        db.deleteObjectStore('phases');
      }
      
      if (!db.objectStoreNames.contains('phaseLists')) {
        const phaseListStore = db.createObjectStore('phaseLists', { keyPath: 'id', autoIncrement: true });
        phaseListStore.createIndex('slug', 'slug', { unique: true });
        phaseListStore.createIndex('title', 'title');
      }
    }
  }
});

/**
 * Get database statistics - record counts for all tables
 * Useful for verifying import/export operations
 * @returns {Promise<Object>} Stats object with version and table counts
 */
export async function getDatabaseStats() {
  const db = await dbPromise;
  const tableNames = [
    'tasks',
    'timeLogs',
    'todos',
    'accomplishments',
    'workSessions',
    'categoryLists',
    'remainingHoursHistory',
    'projects',
    'phaseLists'
  ];
  
  const stats = { version: DB_VERSION, tables: {} };
  
  for (const tableName of tableNames) {
    try {
      const tx = db.transaction([tableName], 'readonly');
      const store = tx.objectStore(tableName);
      const count = await store.count();
      stats.tables[tableName] = count;
    } catch (err) {
      console.warn(`Could not get count for ${tableName}:`, err);
      stats.tables[tableName] = 0;
    }
  }
  
  return stats;
}

/**
 * Migrate existing tasks to have remaining hours tracking
 * Legacy migration - runs once on app load
 */
export async function migrateTasksForRemainingHours() {
  try {
    const db = await dbPromise;
    const allTasks = await db.getAll('tasks');
    let migrated = 0;
    
    console.log('Checking', allTasks.length, 'tasks for remaining hours migration');
    
    for (const task of allTasks) {
      if (task.remainingHours === undefined) {
        console.log('Migrating task for remaining hours:', task.title);
        
        // Initialize remaining hours to estimate if available, otherwise 0
        task.remainingHours = task.estimate || 0;
        
        // Create initial remaining hours history entry
        if (task.remainingHours > 0) {
          const historyEntry = {
            taskId: task.id,
            remainingHours: task.remainingHours,
            timestamp: task.createdAt || new Date().toISOString(),
            note: 'Initial estimate (migrated from estimate field)'
          };
          await db.add('remainingHoursHistory', historyEntry);
        }
        
        await db.put('tasks', task);
        migrated++;
      }
    }
    
    if (migrated > 0) {
      console.log('Migrated', migrated, 'tasks to have remaining hours tracking');
    } else {
      console.log('All tasks already have remaining hours tracking');
    }
  } catch (err) {
    console.error('Error migrating tasks for remaining hours:', err);
  }
}

/**
 * Migrate existing tasks to have status history
 * Legacy migration - runs once on app load
 */
export async function migrateTasksForStatusHistory() {
  try {
    const db = await dbPromise;
    const allTasks = await db.getAll('tasks');
    let migrated = 0;
    
    console.log('Checking', allTasks.length, 'tasks for status history migration');
    
    for (const task of allTasks) {
      if (!task.statusHistory) {
        console.log('Migrating task:', task.title, 'status:', task.status);
        
        task.statusHistory = [{
          status: task.status || 'Ready',
          timestamp: task.createdAt || new Date().toISOString(),
          note: 'Legacy task - initial status (migrated)'
        }];
        
        if (!task.createdAt) {
          task.createdAt = new Date().toISOString();
        }
        
        await db.put('tasks', task);
        migrated++;
      }
    }
    
    if (migrated > 0) {
      console.log('Migrated', migrated, 'tasks to have status history');
    } else {
      console.log('All tasks already have status history');
    }
  } catch (err) {
    console.error('Error migrating tasks for status history:', err);
  }
}

/**
 * Migrate existing todos to new date-independent structure
 * Legacy migration - removes old date field, adds completedAt and createdAt
 */
export async function migrateTodosToNewStructure() {
  try {
    const db = await dbPromise;
    const allTodos = await db.getAll('todos');
    let migrated = 0;
    
    console.log('Checking', allTodos.length, 'todos for structure migration');
    
    for (const todo of allTodos) {
      let needsUpdate = false;
      
      // Remove old date field if it exists
      if (todo.date) {
        delete todo.date;
        needsUpdate = true;
      }
      
      // Add completedAt field if missing
      if (!todo.hasOwnProperty('completedAt')) {
        todo.completedAt = todo.completed ? new Date().toISOString() : null;
        needsUpdate = true;
      }
      
      // Ensure createdAt exists
      if (!todo.createdAt) {
        todo.createdAt = new Date().toISOString();
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await db.put('todos', todo);
        migrated++;
      }
    }
    
    if (migrated > 0) {
      console.log('Migrated', migrated, 'todos to new structure');
    } else {
      console.log('All todos already use new structure');
    }
  } catch (err) {
    console.error('Error migrating todos:', err);
  }
}

/**
 * Seed sample category lists if none exist
 * Provides default category lists for work, academic, and research activities
 */
export async function seedSampleCategoryLists() {
  try {
    const db = await dbPromise;
    const existingLists = await db.getAll('categoryLists');
    
    if (existingLists.length === 0) {
      console.log('Seeding sample category lists...');
      
      const sampleLists = [
        {
          title: 'Work Focus Areas',
          slug: 'work-focus-areas',
          description: 'Main areas of work concentration',
          categories: [
            { title: 'Coding', slug: 'work-focus-areas.coding' },
            { title: 'Meetings', slug: 'work-focus-areas.meetings' },
            { title: 'Planning', slug: 'work-focus-areas.planning' },
            { title: 'Documentation', slug: 'work-focus-areas.documentation' },
            { title: 'Testing', slug: 'work-focus-areas.testing' },
            { title: 'Research', slug: 'work-focus-areas.research' }
          ]
        },
        {
          title: 'Project Types',
          slug: 'project-types',
          description: 'Classification by project type',
          categories: [
            { title: 'Frontend Development', slug: 'project-types.frontend-development' },
            { title: 'Backend Development', slug: 'project-types.backend-development' },
            { title: 'DevOps', slug: 'project-types.devops' },
            { title: 'Database', slug: 'project-types.database' },
            { title: 'Mobile', slug: 'project-types.mobile' },
            { title: 'API Development', slug: 'project-types.api-development' }
          ]
        },
        {
          title: 'Academic Activities',
          slug: 'academic-activities',
          description: 'Core academic work and study activities',
          categories: [
            { title: 'Lectures/Classes', slug: 'academic-activities.lectures-classes' },
            { title: 'Study Sessions', slug: 'academic-activities.study-sessions' },
            { title: 'Homework/Assignments', slug: 'academic-activities.homework-assignments' },
            { title: 'Research Projects', slug: 'academic-activities.research-projects' },
            { title: 'Lab Work', slug: 'academic-activities.lab-work' },
            { title: 'Exam Preparation', slug: 'academic-activities.exam-preparation' }
          ]
        },
        {
          title: 'Subject Areas',
          slug: 'subject-areas',
          description: 'Academic subjects and disciplines',
          categories: [
            { title: 'Computer Science', slug: 'subject-areas.computer-science' },
            { title: 'Mathematics', slug: 'subject-areas.mathematics' },
            { title: 'English/Writing', slug: 'subject-areas.english-writing' },
            { title: 'Science Labs', slug: 'subject-areas.science-labs' },
            { title: 'Electives', slug: 'subject-areas.electives' },
            { title: 'Thesis/Capstone', slug: 'subject-areas.thesis-capstone' }
          ]
        },
        {
          title: 'Research & Proposal Work',
          slug: 'research-proposal-work',
          description: 'Research activities and proposal development',
          categories: [
            { title: 'Market Research', slug: 'research-proposal-work.market-research' },
            { title: 'Technical Research', slug: 'research-proposal-work.technical-research' },
            { title: 'Proposal Writing', slug: 'research-proposal-work.proposal-writing' },
            { title: 'Competitive Analysis', slug: 'research-proposal-work.competitive-analysis' },
            { title: 'Requirements Gathering', slug: 'research-proposal-work.requirements-gathering' },
            { title: 'Feasibility Studies', slug: 'research-proposal-work.feasibility-studies' }
          ]
        },
        {
          title: 'Professional Development',
          slug: 'professional-development',
          description: 'Career growth and skill development activities',
          categories: [
            { title: 'Learning/Training', slug: 'professional-development.learning-training' },
            { title: 'Networking', slug: 'professional-development.networking' },
            { title: 'Certifications', slug: 'professional-development.certifications' },
            { title: 'Industry Research', slug: 'professional-development.industry-research' },
            { title: 'Tool Evaluation', slug: 'professional-development.tool-evaluation' },
            { title: 'Process Improvement', slug: 'professional-development.process-improvement' }
          ]
        },
        {
          title: 'Time Categories',
          slug: 'time-categories',
          description: 'General time allocation categories',
          categories: [
            { title: 'Deep Work', slug: 'deep-work' },
            { title: 'Administrative', slug: 'administrative' },
            { title: 'Communication', slug: 'communication' },
            { title: 'Learning', slug: 'learning' },
            { title: 'Break', slug: 'break' },
            { title: 'Personal', slug: 'personal' }
          ]
        }
      ];

      for (const listData of sampleLists) {
        await db.put('categoryLists', listData);
      }
      
      console.log('Seeded', sampleLists.length, 'sample category lists');
    } else {
      console.log('Category lists already exist, skipping seeding');
    }
  } catch (err) {
    console.error('Error seeding sample category lists:', err);
  }
}

/**
 * Run all legacy migrations on app load
 * These are idempotent and safe to run multiple times
 */
export function runMigrations() {
  migrateTasksForStatusHistory();
  migrateTasksForRemainingHours();
  migrateTodosToNewStructure();
  seedSampleCategoryLists();
}
