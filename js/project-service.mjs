/**
 * project-service.mjs
 * Project and Phase Management Service
 * 
 * Responsibilities:
 * - CRUD operations for projects
 * - CRUD operations for phase lists
 * - Project/phase display info helpers
 * - Project-task association validation
 * 
 * Dependencies: db.mjs, ui-utils.mjs, category-service.mjs (for slug utils)
 */

import { dbPromise } from './db.mjs';
import { showToast } from './ui-utils.mjs';
import { generateSlug, parseCategoryKey } from './category-service.mjs';

// ============================================================
// PROJECT CRUD OPERATIONS
// ============================================================

/**
 * Get all projects from database
 * @returns {Promise<Array>} Array of project objects
 */
export async function getProjects() {
  try {
    const db = await dbPromise;
    return await db.getAll('projects');
  } catch (err) {
    console.error('Error loading projects:', err);
    return [];
  }
}

/**
 * Get project by ID
 * @param {number} id - Project ID
 * @returns {Promise<Object|null>} Project object or null if not found
 */
export async function getProjectById(id) {
  try {
    const db = await dbPromise;
    return await db.get('projects', parseInt(id));
  } catch (err) {
    console.error('Error loading project by ID:', err);
    return null;
  }
}

/**
 * Save project (create or update)
 * @param {Object} project - Project object
 * @returns {Promise<Object>} Saved project with ID
 */
export async function saveProject(project) {
  try {
    const db = await dbPromise;
    
    // Validate required fields
    if (!project.name || project.name.trim() === '') {
      throw new Error('Project name is required');
    }
    
    // Set defaults
    if (!project.status) {
      project.status = 'Ready';
    }
    
    if (!project.createdAt) {
      project.createdAt = new Date().toISOString();
    }
    
    const result = await db.put('projects', project);
    
    if (!project.id) {
      project.id = result;
    }
    
    showToast(`Project "${project.name}" saved successfully!`, 'success');
    return project;
  } catch (err) {
    console.error('Error saving project:', err);
    showToast('Failed to save project: ' + err.message, 'error');
    throw err;
  }
}

/**
 * Delete project by ID (validates no tasks are linked)
 * @param {number} id - Project ID to delete
 * @returns {Promise<boolean>} True if successful
 */
export async function deleteProject(id) {
  try {
    const db = await dbPromise;
    
    // Check if any tasks are using this project
    // Note: This creates a circular dependency with task-service
    // In production, consider moving this check to app-controller
    const tasks = await db.getAll('tasks');
    const linkedTasks = tasks.filter(task => task.projectId === id);
    
    if (linkedTasks.length > 0) {
      throw new Error(`Cannot delete project: ${linkedTasks.length} task(s) are still linked to it`);
    }
    
    await db.delete('projects', id);
    showToast('Project deleted successfully!', 'success');
    return true;
  } catch (err) {
    console.error('Error deleting project:', err);
    showToast('Failed to delete project: ' + err.message, 'error');
    return false;
  }
}

/**
 * Get project display info (name and short name)
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} { name, shortName }
 */
export async function getProjectDisplayInfo(projectId) {
  if (!projectId) return { name: '', shortName: '' };
  
  try {
    const db = await dbPromise;
    const project = await db.get('projects', parseInt(projectId));
    
    if (!project) {
      return { name: `Project ${projectId}`, shortName: `P${projectId}` };
    }
    
    return {
      name: project.name,
      shortName: project.name.length > 12 ? project.name.substring(0, 12) + '...' : project.name
    };
  } catch (err) {
    console.error('Error getting project display info:', err);
    return { name: `Project ${projectId}`, shortName: `P${projectId}` };
  }
}

// ============================================================
// PHASE LIST CRUD OPERATIONS
// ============================================================

/**
 * Get all phase lists from database
 * @returns {Promise<Array>} Array of phase list objects
 */
export async function getPhaseLists() {
  try {
    const db = await dbPromise;
    return await db.getAll('phaseLists');
  } catch (err) {
    console.error('Error loading phase lists:', err);
    return [];
  }
}

/**
 * Get phase list by slug
 * @param {string} slug - Phase list slug
 * @returns {Promise<Object|null>} Phase list object or null if not found
 */
export async function getPhaseListBySlug(slug) {
  try {
    const db = await dbPromise;
    const lists = await db.getAllFromIndex('phaseLists', 'slug', slug);
    return lists.length > 0 ? lists[0] : null;
  } catch (err) {
    console.error('Error loading phase list by slug:', err);
    return null;
  }
}

/**
 * Get phase list by ID
 * @param {number} id - Phase list ID
 * @returns {Promise<Object|null>} Phase list object or null if not found
 */
export async function getPhaseListById(id) {
  try {
    const db = await dbPromise;
    return await db.get('phaseLists', id);
  } catch (err) {
    console.error('Error loading phase list by ID:', err);
    return null;
  }
}

/**
 * Save phase list (create or update)
 * @param {Object} phaseList - Phase list object
 * @returns {Promise<Object>} Saved phase list with ID
 */
export async function savePhaseList(phaseList) {
  try {
    const db = await dbPromise;
    
    // Generate slug if not provided
    if (!phaseList.slug && phaseList.title) {
      phaseList.slug = generateSlug(phaseList.title);
    }

    // Ensure phases have slugs with list prefix for uniqueness
    if (phaseList.phases) {
      phaseList.phases = phaseList.phases.map(phase => ({
        title: phase.title,
        slug: phase.slug || `${phaseList.slug}.${generateSlug(phase.title)}`
      }));
    }

    const result = await db.put('phaseLists', phaseList);
    
    if (!phaseList.id) {
      phaseList.id = result;
    }
    
    showToast(`Phase list "${phaseList.title}" saved successfully!`, 'success');
    return phaseList;
  } catch (err) {
    console.error('Error saving phase list:', err);
    showToast('Failed to save phase list: ' + err.message, 'error');
    throw err;
  }
}

/**
 * Delete phase list by ID
 * @param {number} id - Phase list ID to delete
 * @returns {Promise<boolean>} True if successful
 */
export async function deletePhaseList(id) {
  try {
    const db = await dbPromise;
    await db.delete('phaseLists', id);
    showToast('Phase list deleted successfully!', 'success');
    return true;
  } catch (err) {
    console.error('Error deleting phase list:', err);
    showToast('Failed to delete phase list: ' + err.message, 'error');
    return false;
  }
}

/**
 * Get phase display info from phase key
 * @param {string} phaseKey - Phase key (list-slug.item-slug)
 * @returns {Promise<Object>} { listTitle, itemTitle, shortTitle }
 */
export async function getPhaseDisplayInfo(phaseKey) {
  if (!phaseKey) return { listTitle: '', itemTitle: '', shortTitle: '' };
  
  const { listSlug, itemSlug } = parseCategoryKey(phaseKey); // Reuse category key parsing
  
  if (!listSlug || !itemSlug) {
    return { listTitle: '', itemTitle: phaseKey, shortTitle: phaseKey };
  }
  
  try {
    const phaseList = await getPhaseListBySlug(listSlug);
    
    if (!phaseList) {
      return { listTitle: listSlug, itemTitle: itemSlug, shortTitle: itemSlug };
    }
    
    const phase = phaseList.phases?.find(p => p.slug === itemSlug);
    const itemTitle = phase ? phase.title : itemSlug;
    const shortTitle = itemTitle.length > 10 ? itemTitle.substring(0, 10) + '...' : itemTitle;
    
    return {
      listTitle: phaseList.title,
      itemTitle: itemTitle,
      shortTitle: shortTitle
    };
  } catch (err) {
    console.error('Error getting phase display info:', err);
    return { listTitle: listSlug, itemTitle: itemSlug, shortTitle: itemSlug };
  }
}

/**
 * Get all phases from all phase lists (flattened)
 * @returns {Promise<Array>} Array of { listSlug, listTitle, itemSlug, itemTitle, key }
 */
export async function getAllPhasesFlattened() {
  const lists = await getPhaseLists();
  const flattened = [];
  
  for (const list of lists) {
    if (list.phases) {
      for (const phase of list.phases) {
        flattened.push({
          listSlug: list.slug,
          listTitle: list.title,
          itemSlug: phase.slug,
          itemTitle: phase.title,
          key: `${list.slug}.${phase.slug}`,
          fullDisplay: `${list.title}: ${phase.title}`
        });
      }
    }
  }
  
  return flattened;
}
