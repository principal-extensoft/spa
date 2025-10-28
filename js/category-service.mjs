/**
 * category-service.mjs
 * Category List Management Service
 * 
 * Responsibilities:
 * - CRUD operations for category lists
 * - Slug generation and validation
 * - Category key parsing and display info
 * - Category-to-task association helpers
 * 
 * Dependencies: db.mjs, ui-utils.mjs
 */

import { dbPromise } from './db.mjs';
import { showToast } from './ui-utils.mjs';

// ============================================================
// SLUG UTILITIES
// ============================================================

/**
 * Auto-generate URL-friendly slug from title
 * @param {string} title - Title to convert to slug
 * @returns {string} URL-safe slug
 */
export function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')      // Remove special chars except spaces and hyphens
    .replace(/[\s_-]+/g, '-')      // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, '');      // Remove leading/trailing hyphens
}

/**
 * Validate slug uniqueness in database
 * @param {string} slug - Slug to validate
 * @param {number|null} excludeId - ID to exclude from check (for updates)
 * @returns {Promise<boolean>} True if slug is unique
 */
export async function isSlugUnique(slug, excludeId = null) {
  try {
    const db = await dbPromise;
    const existing = await db.getAllFromIndex('categoryLists', 'slug', slug);
    return excludeId ? !existing.some(item => item.id !== excludeId) : existing.length === 0;
  } catch (err) {
    console.error('Error checking slug uniqueness:', err);
    return false;
  }
}

// ============================================================
// CRUD OPERATIONS
// ============================================================

/**
 * Get all category lists from database
 * @returns {Promise<Array>} Array of category list objects
 */
export async function getCategoryLists() {
  try {
    const db = await dbPromise;
    return await db.getAll('categoryLists');
  } catch (err) {
    console.error('Error loading category lists:', err);
    return [];
  }
}

/**
 * Get category list by slug
 * @param {string} slug - Category list slug
 * @returns {Promise<Object|null>} Category list object or null if not found
 */
export async function getCategoryListBySlug(slug) {
  try {
    const db = await dbPromise;
    const lists = await db.getAllFromIndex('categoryLists', 'slug', slug);
    return lists.length > 0 ? lists[0] : null;
  } catch (err) {
    console.error('Error loading category list by slug:', err);
    return null;
  }
}

/**
 * Get category list by ID
 * @param {number} id - Category list ID
 * @returns {Promise<Object|null>} Category list object or null if not found
 */
export async function getCategoryListById(id) {
  try {
    const db = await dbPromise;
    return await db.get('categoryLists', id);
  } catch (err) {
    console.error('Error loading category list by ID:', err);
    return null;
  }
}

/**
 * Save category list (create or update)
 * @param {Object} categoryList - Category list object
 * @returns {Promise<Object>} Saved category list with ID
 */
export async function saveCategoryList(categoryList) {
  try {
    const db = await dbPromise;
    
    // Generate slug if not provided
    if (!categoryList.slug && categoryList.title) {
      categoryList.slug = generateSlug(categoryList.title);
    }

    // Ensure categories have slugs with list prefix for uniqueness
    if (categoryList.categories) {
      categoryList.categories = categoryList.categories.map(cat => ({
        title: cat.title,
        slug: cat.slug || `${categoryList.slug}.${generateSlug(cat.title)}`
      }));
    }

    // Validate slug uniqueness
    if (!(await isSlugUnique(categoryList.slug, categoryList.id))) {
      throw new Error(`Slug "${categoryList.slug}" already exists. Please choose a different title.`);
    }

    const result = await db.put('categoryLists', categoryList);
    
    if (!categoryList.id) {
      categoryList.id = result;
    }
    
    showToast(`Category list "${categoryList.title}" saved successfully!`, 'success');
    return categoryList;
  } catch (err) {
    console.error('Error saving category list:', err);
    showToast('Failed to save category list: ' + err.message, 'error');
    throw err;
  }
}

/**
 * Delete category list by ID
 * @param {number} id - Category list ID to delete
 * @returns {Promise<boolean>} True if successful
 */
export async function deleteCategoryList(id) {
  try {
    const db = await dbPromise;
    await db.delete('categoryLists', id);
    showToast('Category list deleted successfully!', 'success');
    return true;
  } catch (err) {
    console.error('Error deleting category list:', err);
    showToast('Failed to delete category list: ' + err.message, 'error');
    return false;
  }
}

// ============================================================
// CATEGORY KEY UTILITIES
// ============================================================

/**
 * Generate category key (list-slug.item-slug)
 * @param {string} listSlug - Category list slug
 * @param {string} itemSlug - Category item slug
 * @returns {string} Full category key
 */
export function generateCategoryKey(listSlug, itemSlug) {
  return `${listSlug}.${itemSlug}`;
}

/**
 * Parse category key back to components
 * @param {string} categoryKey - Category key to parse
 * @returns {Object} { listSlug, itemSlug }
 */
export function parseCategoryKey(categoryKey) {
  if (!categoryKey || !categoryKey.includes('.')) {
    return { listSlug: null, itemSlug: null };
  }
  
  const [listSlug, ...itemParts] = categoryKey.split('.');
  const itemSlug = itemParts.join('.'); // Handle cases where item might have dots
  
  return { listSlug, itemSlug };
}

/**
 * Get category display info from key
 * @param {string} categoryKey - Category key (list-slug.item-slug)
 * @returns {Promise<Object>} { listTitle, itemTitle, fullDisplay }
 */
export async function getCategoryDisplayInfo(categoryKey) {
  if (!categoryKey) return { listTitle: '', itemTitle: '', fullDisplay: 'Uncategorized' };
  
  const { listSlug, itemSlug } = parseCategoryKey(categoryKey);
  
  if (!listSlug || !itemSlug) {
    return { listTitle: '', itemTitle: categoryKey, fullDisplay: categoryKey };
  }
  
  const categoryList = await getCategoryListBySlug(listSlug);
  
  if (!categoryList) {
    return { listTitle: listSlug, itemTitle: itemSlug, fullDisplay: `${listSlug}.${itemSlug}` };
  }
  
  const category = categoryList.categories.find(cat => cat.slug === itemSlug);
  const itemTitle = category ? category.title : itemSlug;
  
  return {
    listTitle: categoryList.title,
    itemTitle: itemTitle,
    fullDisplay: `${categoryList.title}: ${itemTitle}`
  };
}

/**
 * Get category display name (simple version for reports)
 * @param {string} categoryKey - Category key
 * @returns {string} Display name
 */
export function getCategoryDisplayName(categoryKey) {
  if (!categoryKey) return 'Uncategorized';
  
  const { itemSlug } = parseCategoryKey(categoryKey);
  if (!itemSlug) return categoryKey;
  
  // Convert slug to title case
  return itemSlug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================
// CATEGORY AGGREGATION
// ============================================================

/**
 * Get all unique category keys from time logs
 * @param {Array} timeLogs - Array of time log objects
 * @returns {Array} Array of unique category keys
 */
export function getUniqueCategoriesFromTimeLogs(timeLogs) {
  const categories = new Set();
  
  for (const log of timeLogs) {
    if (log.category) {
      categories.add(log.category);
    }
  }
  
  return Array.from(categories).sort();
}

/**
 * Calculate time summaries grouped by category
 * @param {Array} timeLogs - Array of time log objects
 * @returns {Object} Map of category key to total hours
 */
export function calculateCategoryTimeSummaries(timeLogs) {
  const summaries = {};
  
  for (const log of timeLogs) {
    const category = log.category || 'uncategorized';
    
    if (!summaries[category]) {
      summaries[category] = 0;
    }
    
    summaries[category] += log.hours || 0;
  }
  
  return summaries;
}

/**
 * Get all categories from all category lists (flattened)
 * @returns {Promise<Array>} Array of { listSlug, listTitle, itemSlug, itemTitle, key }
 */
export async function getAllCategoriesFlattened() {
  const lists = await getCategoryLists();
  const flattened = [];
  
  for (const list of lists) {
    if (list.categories) {
      for (const category of list.categories) {
        flattened.push({
          listSlug: list.slug,
          listTitle: list.title,
          itemSlug: category.slug,
          itemTitle: category.title,
          key: generateCategoryKey(list.slug, category.slug),
          fullDisplay: `${list.title}: ${category.title}`
        });
      }
    }
  }
  
  return flattened;
}
