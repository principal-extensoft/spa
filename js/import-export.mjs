/**
 * import-export.mjs
 * Data Import/Export Service - Backup and restore functionality
 * 
 * Responsibilities:
 * - Export all database tables to JSON
 * - Import data from JSON backup files
 * - Handle File System Access API
 * - Version compatibility checking
 * - Settings export/import
 * 
 * Dependencies: db.mjs, ui-utils.mjs
 * Note: Requires secure context (https:// or http://localhost) for File System Access API
 */

import { dbPromise, getDatabaseStats } from './db.mjs';
import { showToast } from './ui-utils.mjs';

const CURRENT_VERSION = 10;
const APP_VERSION = '1.0.0';

// ============================================================
// EXPORT OPERATIONS
// ============================================================

/**
 * Export all application data to JSON file
 * Uses File System Access API if available, falls back to download
 * @returns {Promise<boolean>} True if export successful
 */
export async function exportData() {
  console.log('Exporting all application data');
  try {
    const db = await dbPromise;
    
    // Export all database tables
    const exportData = {
      version: CURRENT_VERSION,
      exportDate: new Date().toISOString(),
      appVersion: APP_VERSION,
      data: {
        tasks: await db.getAll('tasks'),
        timeLogs: await db.getAll('timeLogs'),
        todos: await db.getAll('todos'),
        accomplishments: await db.getAll('accomplishments'),
        workSessions: await db.getAll('workSessions'),
        categoryLists: await db.getAll('categoryLists'),
        remainingHoursHistory: await db.getAll('remainingHoursHistory'),
        projects: await db.getAll('projects'),
        phaseLists: await db.getAll('phaseLists')
      },
      settings: {
        // Export relevant localStorage settings
        globalProjectFilter: localStorage.getItem('globalProjectFilter'),
        globalPhaseFilter: localStorage.getItem('globalPhaseFilter'),
        calendarStatusFilter: localStorage.getItem('calendarStatusFilter'),
        calendarUrgencyFilter: localStorage.getItem('calendarUrgencyFilter'),
        sortBy: sessionStorage.getItem('sortBy'),
        sortOrder: sessionStorage.getItem('sortOrder')
      }
    };
    
    // Create filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const filename = `task-tracker-backup-${timestamp}.json`;
    
    // Try File System Access API first (modern browsers)
    if (window.showSaveFilePicker) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'Task Tracker Backup',
            accept: { 'application/json': ['.json'] }
          }]
        });
        
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(exportData, null, 2));
        await writable.close();
        
        showToast('Data exported successfully!', 'success');
        console.log('Data exported to user-selected location');
        return true;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('File picker failed, falling back to download:', err);
        } else {
          console.log('Export cancelled by user');
          return false;
        }
      }
    }
    
    // Fallback: traditional download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully!', 'success');
    console.log('Data exported successfully');
    return true;
    
  } catch (err) {
    console.error('Error exporting data:', err);
    showToast('Failed to export data: ' + err.message, 'error');
    return false;
  }
}

/**
 * Get record counts for export summary
 * @returns {Promise<Object>} Object with counts of each data type
 */
export async function getExportSummary() {
  try {
    const stats = await getDatabaseStats();
    return {
      version: CURRENT_VERSION,
      tables: stats.tables
    };
  } catch (err) {
    console.error('Error getting export summary:', err);
    return null;
  }
}

// ============================================================
// IMPORT OPERATIONS
// ============================================================

/**
 * Import data from JSON file
 * @param {File} file - JSON file to import
 * @returns {Promise<boolean>} True if import successful
 */
export async function importData(file) {
  console.log('Importing comprehensive application data from file');
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        
        // Check if this is a new format export with version info
        let data, settings;
        if (importedData.version && importedData.data) {
          // New comprehensive format
          data = importedData.data;
          settings = importedData.settings || {};
          
          console.log(`Importing data from version ${importedData.version}, exported on ${importedData.exportDate}`);
          
          // Version compatibility check
          if (importedData.version > CURRENT_VERSION) {
            const proceed = confirm('This backup was created with a newer version of the app. Some data might not import correctly. Continue anyway?');
            if (!proceed) {
              resolve(false);
              return;
            }
          }
          
          // Warn about data replacement for comprehensive imports
          const hasConstraintTables = (data.categoryLists && data.categoryLists.length > 0) || (data.phaseLists && data.phaseLists.length > 0);
          if (hasConstraintTables) {
            const proceed = confirm('This will replace your existing Category Lists and Phase Lists. Your tasks and other data will be merged. Continue?');
            if (!proceed) {
              resolve(false);
              return;
            }
          }
        } else {
          // Legacy format (just tasks and timeLogs)
          data = importedData;
          settings = {};
          console.log('Importing legacy format data');
        }
        
        const db = await dbPromise;
        const tableNames = ['tasks', 'timeLogs', 'todos', 'accomplishments', 'workSessions', 'categoryLists', 'remainingHoursHistory', 'projects', 'phaseLists'];
        const stats = { imported: {}, skipped: {}, replaced: {} };
        
        // Import each table
        for (const tableName of tableNames) {
          if (data[tableName] && data[tableName].length > 0) {
            console.log(`Importing ${data[tableName].length} ${tableName}...`);
            
            // For constraint tables (categoryLists, phaseLists), clear existing data first
            if (tableName === 'categoryLists' || tableName === 'phaseLists') {
              const existing = await db.getAll(tableName);
              stats.replaced[tableName] = existing.length;
              
              // Clear the table
              const tx = db.transaction(tableName, 'readwrite');
              for (const item of existing) {
                await tx.store.delete(item.id);
              }
              await tx.done;
              
              console.log(`Cleared ${existing.length} existing ${tableName}`);
            }
            
            const tx = db.transaction(tableName, 'readwrite');
            let imported = 0;
            let skipped = 0;
            
            for (const record of data[tableName]) {
              try {
                // For unique constraint tables, check before adding
                if (tableName === 'categoryLists' || tableName === 'phaseLists') {
                  await tx.store.put(record);
                  imported++;
                } else {
                  // For other tables, handle ID conflicts
                  if (record.id) {
                    const existing = await tx.store.get(record.id);
                    if (existing) {
                      // ID conflict - remove ID and let it auto-increment
                      const newRecord = { ...record };
                      delete newRecord.id;
                      await tx.store.add(newRecord);
                      imported++;
                    } else {
                      await tx.store.put(record);
                      imported++;
                    }
                  } else {
                    await tx.store.add(record);
                    imported++;
                  }
                }
              } catch (err) {
                console.warn(`Skipping ${tableName} record due to error:`, err);
                skipped++;
              }
            }
            
            await tx.done;
            stats.imported[tableName] = imported;
            stats.skipped[tableName] = skipped;
            console.log(`Imported ${imported} ${tableName} (skipped ${skipped})`);
          }
        }
        
        // Import settings if available
        if (settings && Object.keys(settings).length > 0) {
          console.log('Restoring settings...');
          for (const [key, value] of Object.entries(settings)) {
            if (value !== null) {
              if (key === 'sortBy' || key === 'sortOrder') {
                sessionStorage.setItem(key, value);
              } else {
                localStorage.setItem(key, value);
              }
            }
          }
        }
        
        // Build summary message
        const totalImported = Object.values(stats.imported).reduce((sum, count) => sum + count, 0);
        const totalSkipped = Object.values(stats.skipped).reduce((sum, count) => sum + count, 0);
        
        let summaryMessage = `Import complete!\n\n`;
        summaryMessage += `✓ Imported: ${totalImported} records\n`;
        if (totalSkipped > 0) {
          summaryMessage += `⚠ Skipped: ${totalSkipped} records (duplicates or errors)\n`;
        }
        
        console.log('Import statistics:', stats);
        showToast('Data imported successfully!', 'success', 8000);
        alert(summaryMessage);
        
        resolve(true);
        
      } catch (err) {
        console.error('Error importing data:', err);
        showToast('Failed to import data: ' + err.message, 'error');
        alert('Import failed: ' + err.message);
        resolve(false);
      }
    };
    
    reader.onerror = () => {
      console.error('Error reading file');
      showToast('Failed to read file', 'error');
      resolve(false);
    };
    
    reader.readAsText(file);
  });
}

/**
 * Validate import file before processing
 * @param {File} file - File to validate
 * @returns {Promise<Object>} { valid: boolean, error: string, summary: Object }
 */
export async function validateImportFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        
        // Check format
        if (!importedData.version && !importedData.tasks) {
          resolve({ 
            valid: false, 
            error: 'Invalid file format. This does not appear to be a Task Tracker backup file.',
            summary: null
          });
          return;
        }
        
        // Build summary
        const summary = {
          version: importedData.version || 'legacy',
          exportDate: importedData.exportDate || 'unknown',
          recordCounts: {}
        };
        
        const data = importedData.data || importedData;
        for (const [tableName, records] of Object.entries(data)) {
          if (Array.isArray(records)) {
            summary.recordCounts[tableName] = records.length;
          }
        }
        
        resolve({ valid: true, error: null, summary });
        
      } catch (err) {
        resolve({ 
          valid: false, 
          error: 'Invalid JSON file: ' + err.message,
          summary: null
        });
      }
    };
    
    reader.onerror = () => {
      resolve({ 
        valid: false, 
        error: 'Failed to read file',
        summary: null
      });
    };
    
    reader.readAsText(file);
  });
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if File System Access API is supported
 * @returns {boolean} True if supported
 */
export function isFileSystemAccessSupported() {
  return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
}

/**
 * Check if running in secure context (required for File System Access API)
 * @returns {boolean} True if secure context
 */
export function isSecureContext() {
  return window.isSecureContext;
}
