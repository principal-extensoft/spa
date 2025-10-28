// ===== SPACEPORT MISSION CONTROL SYSTEM =====
// Canvas 2D animation system with rocket deployment, launch pads, and time tracking

import { getTasks } from './task-service.mjs';
import { saveTimeLog } from './timelog-service.mjs';
import { getCategoryLists } from './category-service.mjs';
import { getSpaceportSession, initializeSpaceportSession } from './state-service.mjs';
import { showToast } from './ui-utils.mjs';

// Canvas and animation state
let spaceportCanvas, spaceportCtx;
let spaceportAnimationId;
let horizonY; // Will be calculated as 3/4 down the canvas
let isSpaceportInitialized = false;

// ===== INITIALIZATION =====

export async function initializeSpaceport() {
  console.log('🚀 Initializing Mission Control Spaceport...');
  
  const container = document.getElementById('spaceportView');
  if (!container) {
    console.error('SpacePort container not found');
    return;
  }
  
  spaceportCanvas = document.getElementById('spaceportCanvas');
  if (!spaceportCanvas) {
    console.error('SpacePort canvas not found');
    return;
  }
  
  // Prevent multiple initializations
  if (isSpaceportInitialized) {
    console.log('🛸 Spaceport already initialized, restarting animation...');
    startSpaceportAnimation();
    return;
  }
  
  spaceportCtx = spaceportCanvas.getContext('2d');
  
  // Set canvas size and calculate horizon
  resizeSpaceportCanvas();
  window.addEventListener('resize', resizeSpaceportCanvas);
  
  // Setup event listeners
  setupSpaceportEventListeners();
  
  // Start render loop
  startSpaceportAnimation();
  
  isSpaceportInitialized = true;
  console.log('🛸 Spaceport Mission Control Online!');
}

function resizeSpaceportCanvas() {
  const container = document.getElementById('spaceportView');
  spaceportCanvas.width = container.clientWidth;
  spaceportCanvas.height = container.clientHeight - 40;
  horizonY = spaceportCanvas.height * 0.75; // Horizon at 3/4 down
  
  // Update all existing rocket and launch pad positions relative to new horizon
  updateRocketPositionsToHorizon();
}

function updateRocketPositionsToHorizon() {
  const session = getSpaceportSession();
  if (!session.rockets || session.rockets.size === 0) return;
  
  for (const [rocketId, rocket] of session.rockets) {
    // Update launch pad position to current horizon
    rocket.launchPad.y = horizonY;
    
    // Update rocket position relative to horizon - on top of ziggurat platform
    const rocketHeight = getRocketHeight(rocket.type || 'scout');
    rocket.y = horizonY - (rocketHeight / 2) - 40;
  }
  

}

function setupSpaceportEventListeners() {
  // Punch In/Out button
  const punchBtn = document.getElementById('spaceportPunchBtn');
  if (punchBtn) {
    punchBtn.addEventListener('click', toggleSpaceportOperations);
  } else {
    console.warn('SpacePort punch button not found');
  }
  
  // Canvas click for rocket interaction
  if (spaceportCanvas) {
    spaceportCanvas.addEventListener('click', handleSpaceportClick);
  }
  
  // Launch button
  const launchBtn = document.getElementById('launchBtn');
  if (launchBtn) {
    launchBtn.addEventListener('click', launchActiveRocket);
  } else {
    console.warn('SpacePort launch button not found');
  }
}

// ===== SPACEPORT OPERATIONS =====

export async function toggleSpaceportOperations() {
  const session = getSpaceportSession();
  const btn = document.getElementById('spaceportPunchBtn');
  const statusEl = document.getElementById('spaceportStatus');
  const missionControl = document.querySelector('.mission-control');
  
  if (!session.isOperational) {
    // Begin Operations
    session.isOperational = true;
    session.sessionStartTime = Date.now();
    
    btn.textContent = 'End Operations';
    btn.className = 'punch-btn punch-out';
    statusEl.textContent = 'Mission Control Operational';
    statusEl.className = 'punch-status-display operational';
    
    // Show mission control panel
    if (missionControl) {
      missionControl.style.display = 'block';
    }
    
    // Load available missions
    await loadAvailableMissions();
    
    console.log('🚀 Spaceport Operations Initiated!');
  } else {
    // End Operations
    await endSpaceportOperations();
  }
}

async function endSpaceportOperations() {
  console.log('🛸 Ending Spaceport Operations...');
  
  const session = getSpaceportSession();
  
  // Launch all active rockets and save time
  for (const [rocketId, rocket] of session.rockets) {
    if (rocket.totalTime > 0) {
      await saveRocketTimeToDatabase(rocket);
    }
  }
  
  // Reset session
  session.isOperational = false;
  session.activeRocket = null;
  session.rockets.clear();
  session.launchPads = [];
  session.sessionStartTime = null;
  

  
  // Update UI
  const btn = document.getElementById('spaceportPunchBtn');
  const statusEl = document.getElementById('spaceportStatus');
  const missionControl = document.querySelector('.mission-control');
  
  btn.textContent = 'Initiate Operations';
  btn.className = 'punch-btn';
  statusEl.textContent = 'Operations Complete';
  statusEl.className = 'punch-status-display';
  
  // Hide mission control panel
  if (missionControl) {
    missionControl.style.display = 'none';
  }
  
  document.getElementById('launchControls').className = 'launch-controls';
  document.getElementById('missionList').innerHTML = '<div class="text-center" style="color: #888; font-size: 0.8rem; padding: 20px;">Operations Ended</div>';
  
  console.log('✅ Mission Control Shutdown Complete!');
}

async function loadAvailableMissions() {
  const tasks = await getTasks({ status: 'InProgress' }, false);
  console.log(`🛸 Found ${tasks.length} available missions`);
  
  const missionList = document.getElementById('missionList');
  
  if (tasks.length === 0) {
    missionList.innerHTML = '<div class="text-center" style="color: #888; font-size: 0.8rem; padding: 20px;">No In-Progress Tasks Available</div>';
    return;
  }
  
  missionList.innerHTML = tasks.map(task => `
    <div class="mission-item" data-task-id="${task.id}">
      🎯 ${task.title.substring(0, 30)}${task.title.length > 30 ? '...' : ''}
    </div>
  `).join('');
  
  // Add click handlers for mission selection
  missionList.querySelectorAll('.mission-item').forEach(item => {
    item.addEventListener('click', () => {
      const taskId = item.dataset.taskId;
      const task = tasks.find(t => t.id.toString() === taskId);
      if (task) {
        deployRocket(task);
      }
    });
  });
}

// ===== ROCKET DEPLOYMENT =====

export function deployRocket(task) {
  const session = getSpaceportSession();
  
  // Check if we already have a rocket for this task
  const existingRocket = Array.from(session.rockets.values())
    .find(rocket => rocket.taskId === task.id && !rocket.category);
  
  if (existingRocket) {
    console.log(`🚀 Rocket already deployed for task: ${task.title}`);
    activateRocket(existingRocket.id);
    return;
  }
  
  const rocketId = `rocket_${task.id}_${Date.now()}`;
  
  // Create launch pad
  const launchPad = createLaunchPad();
  session.launchPads.push(launchPad);
  
  // Determine rocket type based on task properties
  const rocketType = determineRocketType(task);
  
  // Create rocket
  const rocket = {
    id: rocketId,
    taskId: task.id,
    taskTitle: task.title,
    category: null, // Will be set when user selects category
    totalTime: 0,
    x: launchPad.x,
    y: horizonY - (getRocketHeight(rocketType) / 2) - 40, // Position on top of ziggurat platform
    launchPad: launchPad,
    isActive: false,
    isReadyForCategory: true, // New flag to indicate needs category selection
    deployTime: Date.now(),
    type: rocketType // New rocket type property
  };
  
  session.rockets.set(rocketId, rocket);
  
  // Auto-activate first rocket if none active
  if (!session.activeRocket) {
    activateRocket(rocketId);
  }
  

  
  // Update stats
  document.getElementById('rocketsCount').textContent = session.rockets.size;
  
  console.log(`🚀 ${rocketType.toUpperCase()} rocket deployed for mission: ${task.title} - Click to select category!`);
}

function determineRocketType(task) {
  // Determine rocket type based on task characteristics
  const title = task.title.toLowerCase();
  
  // V2 rockets for development/technical work
  if (title.includes('dev') || title.includes('code') || title.includes('bug') || 
      title.includes('fix') || title.includes('technical') || title.includes('api')) {
    return 'v2';
  }
  
  // Apollo rockets for large/important projects
  if (title.includes('project') || title.includes('launch') || title.includes('deploy') || 
      title.includes('release') || title.includes('major') || title.includes('milestone')) {
    return 'apollo';
  }
  
  // Cartoon rockets for fun/creative/experimental work
  if (title.includes('fun') || title.includes('creative') || title.includes('experiment') || 
      title.includes('prototype') || title.includes('test') || title.includes('play') ||
      title.includes('brainstorm') || title.includes('sketch') || title.includes('demo') ||
      title.includes('looney') || title.includes('tunes') || title.includes('cartoon')) {
    return 'cartoon';
  }
  
  // Scout rockets for research/planning/small tasks
  return 'scout';
}

function determineRocketTypeByTitle(title) {
  // Same logic as determineRocketType but takes title string directly
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('dev') || titleLower.includes('code') || titleLower.includes('bug') || 
      titleLower.includes('fix') || titleLower.includes('technical') || titleLower.includes('api')) {
    return 'v2';
  }
  
  if (titleLower.includes('project') || titleLower.includes('launch') || titleLower.includes('deploy') || 
      titleLower.includes('release') || titleLower.includes('major') || titleLower.includes('milestone')) {
    return 'apollo';
  }
  
  if (titleLower.includes('fun') || titleLower.includes('creative') || titleLower.includes('experiment') || 
      titleLower.includes('prototype') || titleLower.includes('test') || titleLower.includes('play') ||
      titleLower.includes('brainstorm') || titleLower.includes('sketch') || titleLower.includes('demo') ||
      titleLower.includes('looney') || titleLower.includes('tunes') || titleLower.includes('cartoon')) {
    return 'cartoon';
  }
  
  return 'scout';
}

function createLaunchPad() {
  const session = getSpaceportSession();
  
  // Calculate positions with better centering and space utilization
  const towerX = spaceportCanvas.width * 0.1; // Tesla tower position
  const buildingX = spaceportCanvas.width * 0.65; // Mission Control building position (moved left from task selector)
  const buildingLeftEdge = buildingX - 70; // Left edge of building
  
  // Available space between tower and building
  const availableStart = towerX + 150; // Space after tower
  const availableEnd = buildingLeftEdge - 40; // Space before building
  const availableWidth = availableEnd - availableStart;
  
  // Physics-based spacing calculation
  const existingPads = session.launchPads.length;
  const minSpacing = 90;
  const optimalSpacing = 130;
  
  let x;
  
  if (existingPads === 0) {
    // First rocket goes in the center of available space
    x = availableStart + (availableWidth * 0.4); // Slightly left of center for balance
  } else {
    // Find optimal position using physics simulation
    x = findOptimalRocketPosition(availableStart, availableEnd, minSpacing, optimalSpacing);
  }
  
  // Ensure we stay within bounds
  x = Math.max(availableStart, Math.min(availableEnd, x));
  
  // Launch pad sits ON the horizon line
  const y = horizonY;
  
  return {
    x: x,
    y: y,
    radius: 35, // Larger, more substantial pads
    isActive: false
  };
}

function findOptimalRocketPosition(startX, endX, minSpacing, optimalSpacing) {
  const session = getSpaceportSession();
  const existingPositions = session.launchPads.map(pad => pad.x);
  const availableWidth = endX - startX;
  
  // Try multiple candidate positions
  const candidates = [];
  const numCandidates = 20;
  
  for (let i = 0; i < numCandidates; i++) {
    const candidateX = startX + (availableWidth * i / (numCandidates - 1));
    let score = 0;
    let valid = true;
    
    // Check distance to all existing rockets
    for (const existingX of existingPositions) {
      const distance = Math.abs(candidateX - existingX);
      
      if (distance < minSpacing) {
        valid = false;
        break;
      }
      
      // Score based on how close to optimal spacing
      if (distance >= optimalSpacing) {
        score += 100; // Perfect spacing
      } else {
        score += (distance / optimalSpacing) * 100; // Partial score
      }
    }
    
    if (valid) {
      candidates.push({ x: candidateX, score: score });
    }
  }
  
  if (candidates.length === 0) {
    // No valid positions found, use random fallback
    return startX + Math.random() * availableWidth;
  }
  
  // Select best candidate
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].x;
}

// ===== ROCKET INTERACTION =====

function handleSpaceportClick(event) {
  const session = getSpaceportSession();
  if (!session.isOperational) return;
  
  const rect = spaceportCanvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  
  // Check if click is on Mission Control building
  const buildingX = spaceportCanvas.width * 0.65; // Mission Control building position (moved left from task selector)
  const buildingWidth = 140;
  const buildingHeight = 120;
  const buildingTop = horizonY - buildingHeight;
  
  if (clickX >= buildingX - buildingWidth/2 && clickX <= buildingX + buildingWidth/2 &&
      clickY >= buildingTop && clickY <= horizonY) {
    // Clicked on Mission Control building
    showMissionControlInterface();
    return;
  }
  
  // Check if click is on a gel button (circular target on launch pad)
  for (const [rocketId, rocket] of session.rockets) {
    const pad = rocket.launchPad;
    const buttonRadius = pad.radius * 0.6;
    const buttonY = pad.y - pad.radius * 0.8 * 0.3; // Match button position from drawLaunchPad
    
    // Check if click is within the circular gel button
    const distance = Math.sqrt(
      Math.pow(clickX - pad.x, 2) + Math.pow(clickY - buttonY, 2)
    );
    
    if (distance <= buttonRadius) {
      // Show individual rocket control form
      showRocketControlForm(rocketId);
      
      // Also activate the rocket for time tracking
      activateRocket(rocketId);
      return;
    }
  }
  
  // Click elsewhere - hide any open rocket forms and mission control
  hideAllRocketForms();
  hideMissionControlInterface();
}

function activateRocket(rocketId) {
  const session = getSpaceportSession();
  const rocket = session.rockets.get(rocketId);
  if (!rocket) return;
  
  // Deactivate current rocket
  if (session.activeRocket) {
    const currentRocket = session.rockets.get(session.activeRocket);
    if (currentRocket) {
      currentRocket.isActive = false;
      currentRocket.launchPad.isActive = false;
      // Save accumulated time
      if (currentRocket.startTime) {
        const elapsed = Date.now() - currentRocket.startTime;
        currentRocket.totalTime += elapsed;
      }
    }
  }
  
  // Activate new rocket
  session.activeRocket = rocketId;
  rocket.isActive = true;
  rocket.launchPad.isActive = true;
  rocket.startTime = Date.now();
  

  
  // Update UI
  document.getElementById('activeMissionName').textContent = rocket.taskTitle;
  document.getElementById('activeRocketDisplay').textContent = rocket.taskTitle.substring(0, 20);
  document.getElementById('energyStatus').textContent = 'Charging';
  document.getElementById('launchControls').className = 'launch-controls active';
  
  console.log(`⚡ Activated rocket: ${rocket.taskTitle}`);
}

function showRocketControlForm(rocketId) {
  // This will be a simplified stub - full implementation needs extensive DOM manipulation
  console.log(`🎛️ Showing control form for rocket: ${rocketId}`);
  // TODO: Implement full rocket control form UI
}

function hideAllRocketForms() {
  const existingForms = document.querySelectorAll('.rocket-control-form');
  existingForms.forEach(form => form.remove());
}

function showMissionControlInterface() {
  // This will be a simplified stub - full implementation needs extensive DOM manipulation
  console.log('🏢 Mission Control Interface Activated');
  // TODO: Implement full Mission Control overlay UI
}

function hideMissionControlInterface() {
  const overlay = document.getElementById('missionControlOverlay');
  if (overlay) {
    overlay.remove();
  }
}

async function loadMissionsForMissionControl() {
  const tasks = await getTasks({ status: 'InProgress' }, false);
  const taskList = document.getElementById('missionControlTaskList');
  
  if (!taskList) return;
  
  if (tasks.length === 0) {
    taskList.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">No missions available</div>';
    return;
  }
  
  taskList.innerHTML = tasks.map(task => `
    <div class="mission-control-task" data-task-id="${task.id}">
      🎯 ${task.title.substring(0, 35)}${task.title.length > 35 ? '...' : ''}
    </div>
  `).join('');
}

function updateActiveMissionsList() {
  const session = getSpaceportSession();
  const activeList = document.getElementById('activeMissionsList');
  if (!activeList) return;
  
  const activeRockets = Array.from(session.rockets.values()).filter(r => r.isActive);
  
  if (activeRockets.length === 0) {
    activeList.innerHTML = '<div style="text-align: center; color: #888; padding: 10px;">No active missions</div>';
    return;
  }
  
  activeList.innerHTML = activeRockets.map(rocket => {
    let totalTime = rocket.totalTime;
    if (rocket.startTime) {
      totalTime += Date.now() - rocket.startTime;
    }
    const minutes = Math.floor(totalTime / (1000 * 60));
    const timeText = `${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`;
    
    return `
      <div style="padding: 6px 10px; margin: 3px 0; background: rgba(100, 255, 100, 0.1); border-radius: 4px;">
        <div style="color: #64ff64;">🚀 ${rocket.taskTitle.substring(0, 25)}</div>
        <div style="color: #ccc; font-size: 0.75rem;">Time: ${timeText}</div>
      </div>
    `;
  }).join('');
}

// ===== CATEGORY SELECTION =====

async function showInlineRocketCategorySelector(rocketId, parentForm) {
  // Simplified stub - full implementation requires extensive DOM manipulation
  console.log(`🏷️ Inline category selector for rocket: ${rocketId}`);
  // TODO: Implement inline category selector
}

async function showRocketCategorySelector(rocketId, x, y) {
  // Simplified stub - full implementation requires extensive DOM manipulation
  console.log(`🏷️ Showing category selector for rocket: ${rocketId}`);
  // TODO: Implement floating category selector
}

async function showCategoryForNewRocket(taskId, taskTitle, x, y) {
  // Simplified stub - full implementation requires extensive DOM manipulation
  console.log(`🚀 New rocket category selector for task: ${taskTitle}`);
  // TODO: Implement new rocket category selector
}

function createNewRocketWithCategory(taskId, taskTitle, category) {
  const session = getSpaceportSession();
  const rocketId = `rocket_${taskId}_${category || 'general'}_${Date.now()}`;
  
  // Create launch pad
  const launchPad = createLaunchPad();
  session.launchPads.push(launchPad);
  
  // Determine rocket type
  const rocketType = determineRocketTypeByTitle(taskTitle);
  
  // Create rocket with category
  const rocket = {
    id: rocketId,
    taskId: taskId,
    taskTitle: taskTitle,
    category: category || null,
    totalTime: 0,
    x: launchPad.x,
    y: horizonY - (getRocketHeight(rocketType) / 2) - 40,
    launchPad: launchPad,
    isActive: false,
    isReadyForCategory: false, // Already has category
    deployTime: Date.now(),
    type: rocketType
  };
  
  session.rockets.set(rocketId, rocket);

  
  // Update stats
  document.getElementById('rocketsCount').textContent = session.rockets.size;
  
  const categoryName = category ? category.split('.').pop() : 'General';
  console.log(`🚀 Additional ${rocketType.toUpperCase()} rocket deployed: ${taskTitle} (${categoryName})`);
}

function assignCategoryToRocket(rocketId, categorySlug) {
  const session = getSpaceportSession();
  const rocket = session.rockets.get(rocketId);
  if (!rocket) return;
  
  rocket.category = categorySlug || null;
  rocket.isReadyForCategory = false;
  
  // If this rocket is currently active, update the UI
  if (session.activeRocket === rocketId) {
    const categoryName = categorySlug ? categorySlug.split('.').pop() : 'General';
    const displayName = rocket.taskTitle + ` (${categoryName})`;
    document.getElementById('activeMissionName').textContent = displayName;
    document.getElementById('activeRocketDisplay').textContent = displayName.substring(0, 25);
  }
  

  
  const categoryName = categorySlug ? categorySlug.split('.').pop() : 'General';
  console.log(`🏷️ Rocket configured: ${rocket.taskTitle} → ${categoryName}`);
  
  // Auto-activate if no rocket is currently active
  if (!session.activeRocket) {
    activateRocket(rocketId);
  }
}

async function getAvailableCategories() {
  try {
    const categoryLists = await getCategoryLists();
    const categories = [];
    
    categoryLists.forEach(list => {
      if (list.categories) {
        list.categories.forEach(cat => {
          categories.push({
            title: `${list.title}: ${cat.title}`,
            slug: cat.slug
          });
        });
      }
    });
    
    return categories;
  } catch (error) {
    console.error('Error loading categories:', error);
    return [];
  }
}

// ===== ROCKET LAUNCHING =====

export async function launchActiveRocket() {
  const session = getSpaceportSession();
  if (!session.activeRocket) return;
  
  const rocket = session.rockets.get(session.activeRocket);
  if (!rocket) return;
  
  // Calculate final time
  if (rocket.startTime) {
    const elapsed = Date.now() - rocket.startTime;
    rocket.totalTime += elapsed;
  }
  
  // Save to database
  await saveRocketTimeToDatabase(rocket);
  
  // EPIC BLASTOFF SEQUENCE!
  console.log('🚀 Starting epic blastoff for:', rocket.taskTitle);
  
  // Mark rocket as launching (don't remove from map yet)
  rocket.isLaunching = true;
  
  await performEpicBlastoff(rocket);
  
  console.log('🚀 Blastoff complete, removing rocket');
  // Now remove rocket and launch pad after animation
  session.rockets.delete(session.activeRocket);
  session.launchPads = session.launchPads.filter(pad => pad !== rocket.launchPad);
  session.activeRocket = null;
  

  
  // Update UI
  document.getElementById('launchControls').className = 'launch-controls';
  document.getElementById('rocketsCount').textContent = session.rockets.size;
  document.getElementById('activeRocketDisplay').textContent = 'None';
  document.getElementById('energyStatus').textContent = session.rockets.size > 0 ? 'Standby' : 'Offline';
  
  // Auto-activate another rocket if available
  if (session.rockets.size > 0) {
    const nextRocketId = session.rockets.keys().next().value;
    activateRocket(nextRocketId);
  }
}

async function launchSpecificRocket(rocketId) {
  const session = getSpaceportSession();
  const rocket = session.rockets.get(rocketId);
  if (!rocket) return;
  
  // Calculate final time
  if (rocket.startTime) {
    const elapsed = Date.now() - rocket.startTime;
    rocket.totalTime += elapsed;
  }
  
  // Save to database
  await saveRocketTimeToDatabase(rocket);
  
  // EPIC BLASTOFF SEQUENCE!
  console.log('🚀 Starting epic blastoff for specific rocket:', rocket.taskTitle);
  
  // Mark rocket as launching (don't remove from map yet)
  rocket.isLaunching = true;
  
  await performEpicBlastoff(rocket);
  
  console.log('🚀 Specific rocket blastoff complete, removing rocket');
  // Remove rocket and launch pad after animation
  session.rockets.delete(rocketId);
  session.launchPads = session.launchPads.filter(pad => pad !== rocket.launchPad);
  
  // Update rocket count
  document.getElementById('rocketsCount').textContent = session.rockets.size;
  
  // If this was the active rocket, clear active state
  if (session.activeRocket === rocketId) {
    session.activeRocket = null;
    document.getElementById('launchControls').className = 'launch-controls';
    document.getElementById('activeRocketDisplay').textContent = 'None';
    document.getElementById('energyStatus').textContent = session.rockets.size > 0 ? 'Standby' : 'Offline';
  }
  

  
  // Hide the rocket control form
  hideAllRocketForms();
  
  // Auto-activate another rocket if available
  if (session.rockets.size > 0) {
    const nextRocketId = session.rockets.keys().next().value;
    activateRocket(nextRocketId);
  }
}

async function performEpicBlastoff(rocket) {
  console.log(`🚀 EPIC BLASTOFF START: ${rocket.taskTitle} - ${(rocket.totalTime / (1000 * 60)).toFixed(1)} minutes`);
  
  // Phase 1: Pre-launch preparation (1 second)
  console.log('🚀 Phase 1: Preparation');
  rocket.launchPhase = 'preparation';
  rocket.launchStartTime = Date.now();
  await animationDelay(1000);
  
  // Phase 2: Ignition sequence (0.5 seconds)
  console.log('🚀 Phase 2: Ignition');
  rocket.launchPhase = 'ignition';
  const session = getSpaceportSession();
  session.screenShake = { intensity: 2, duration: 2000, startTime: Date.now() };

  await animationDelay(500);
  
  // Phase 3: Liftoff and ascent (3 seconds for enhanced multi-stage animation)
  console.log('🚀 Phase 3: Liftoff');
  rocket.launchPhase = 'liftoff';
  rocket.liftoffStartTime = Date.now();
  rocket.originalY = rocket.y;
  rocket.scale = 1.0; // Initialize scale
  session.screenShake = { intensity: 5, duration: 3000, startTime: Date.now() };
  
  // Create blast crater
  rocket.launchPad.hasBlastCrater = true;
  rocket.launchPad.craterStartTime = Date.now();
  
  // Initialize particle systems
  session.particles = session.particles || [];
  createBlastoffParticles(rocket);

  
  await animationDelay(3000);
  
  // Phase 4: Completed - rocket has "launched"
  console.log('🚀 Phase 4: Launch completed');
  rocket.launchPhase = 'completed';
  
  // Keep particle effects running for a bit longer
  await animationDelay(1000);
  
  // Cleanup
  const finalSession = getSpaceportSession();
  finalSession.screenShake = null;

}

function createBlastoffParticles(rocket) {
  const session = getSpaceportSession();
  
  // Different particle effects based on rocket type
  if (rocket.type === 'apollo') {
    createApolloBlastoffParticles(rocket, session);
  } else if (rocket.type === 'cartoon') {
    createCartoonBlastoffParticles(rocket, session);
  } else {
    createStandardBlastoffParticles(rocket, session);
  }
}

function createApolloBlastoffParticles(rocket, session) {
  // Apollo has MASSIVE launch effects - 5 F-1 engines creating enormous exhaust
  const particleCount = 120; // Much more dramatic
  
  // F-1 engine positions (center + 4 outer engines)
  const enginePositions = [
    {x: 0, y: 0},      // Center engine
    {x: -10, y: 0},    // Left engine
    {x: 10, y: 0},     // Right engine
    {x: 0, y: -10},    // Front engine
    {x: 0, y: 10}      // Back engine
  ];
  
  enginePositions.forEach(engine => {
    const engineX = rocket.x + engine.x;
    const engineY = rocket.y + getRocketHeight(rocket.type) / 2;
    
    // Massive exhaust plume per engine
    for (let i = 0; i < 20; i++) {
      session.particles.push({
        type: 'apollo-exhaust',
        x: engineX + (Math.random() - 0.5) * 8,
        y: engineY + Math.random() * 10,
        vx: (Math.random() - 0.5) * 6 + engine.x * 0.3,
        vy: Math.random() * 12 + 8,
        life: 1.0,
        decay: 0.015,
        size: Math.random() * 10 + 8, // Larger exhaust
        color: `hsl(${Math.random() * 40 + 10}, 100%, ${60 + Math.random() * 30}%)`,
        intensity: 1.0
      });
    }
  });
  
  // Massive smoke clouds
  for (let i = 0; i < 60; i++) {
    session.particles.push({
      type: 'apollo-smoke',
      x: rocket.x + (Math.random() - 0.5) * 50,
      y: rocket.y + 20 + Math.random() * 30,
      vx: (Math.random() - 0.5) * 8,
      vy: -(Math.random() * 5 + 2),
      life: 1.0,
      decay: 0.006, // Longer lasting smoke
      size: Math.random() * 15 + 12, // Much larger smoke
      color: `rgba(120, 120, 120, ${Math.random() * 0.7 + 0.3})`,
      expansion: 1.02 // Smoke expands over time
    });
  }
  
  // Ground debris from launch pad destruction
  for (let i = 0; i < 40; i++) {
    session.particles.push({
      type: 'apollo-debris',
      x: rocket.x + (Math.random() - 0.5) * 60,
      y: rocket.y + 20,
      vx: (Math.random() - 0.5) * 20,
      vy: -(Math.random() * 15 + 5),
      life: 1.0,
      decay: 0.012,
      size: Math.random() * 5 + 2,
      color: `hsl(${Math.random() * 40 + 20}, 60%, ${30 + Math.random() * 30}%)`,
      gravity: 0.3 // Debris falls back down
    });
  }
  
  // Multiple shockwaves for Apollo power
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      session.particles.push({
        type: 'apollo-shockwave',
        x: rocket.x,
        y: rocket.y + 25,
        radius: 10,
        maxRadius: 150 + (i * 50),
        life: 1.0,
        decay: 0.008,
        color: `hsla(${30 + i * 10}, 80%, 60%, 0.6)`,
        wave: i
      });
    }, i * 200);
  }
}

function createStandardBlastoffParticles(rocket, session) {
  const particleCount = 50;
  
  for (let i = 0; i < particleCount; i++) {
    // Exhaust flames
    session.particles.push({
      type: 'flame',
      x: rocket.x + (Math.random() - 0.5) * 10,
      y: rocket.y + 20,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 8 + 5,
      life: 1.0,
      decay: 0.02,
      size: Math.random() * 6 + 4,
      color: `hsl(${Math.random() * 60 + 10}, 100%, ${50 + Math.random() * 30}%)`
    });
    
    // Debris particles
    if (i < 20) {
      session.particles.push({
        type: 'debris',
        x: rocket.x + (Math.random() - 0.5) * 30,
        y: rocket.y + 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -(Math.random() * 6 + 2),
        life: 1.0,
        decay: 0.015,
        size: Math.random() * 3 + 1,
        color: '#888'
      });
    }
    
    // Smoke particles
    if (i < 30) {
      session.particles.push({
        type: 'smoke',
        x: rocket.x + (Math.random() - 0.5) * 20,
        y: rocket.y + 15,
        vx: (Math.random() - 0.5) * 3,
        vy: -(Math.random() * 3 + 1),
        life: 1.0,
        decay: 0.008,
        size: Math.random() * 8 + 6,
        color: `rgba(100, 100, 100, ${Math.random() * 0.5 + 0.2})`
      });
    }
  }
  
  // Create shockwave effect
  session.particles.push({
    type: 'shockwave',
    x: rocket.x,
    y: rocket.y + 10,
    radius: 0,
    maxRadius: 100,
    life: 1.0,
    decay: 0.03,
    color: 'rgba(255, 255, 100, 0.6)'
  });
}

function createCartoonBlastoffParticles(rocket, session) {
  // Cartoon rockets have silly, colorful effects instead of realistic ones
  
  // Create a big cartoon "POOF!" cloud
  for (let i = 0; i < 30; i++) {
    session.particles.push({
      type: 'cartoon-puff',
      x: rocket.x + (Math.random() - 0.5) * 40,
      y: rocket.y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 1.0,
      decay: 0.015,
      size: Math.random() * 10 + 5,
      color: `hsl(${Math.random() * 360}, 90%, 70%)`
    });
  }
  
  // Add rainbow stars
  for (let i = 0; i < 20; i++) {
    session.particles.push({
      type: 'cartoon-star',
      x: rocket.x + (Math.random() - 0.5) * 30,
      y: rocket.y + (Math.random() - 0.5) * 15,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      life: 1.0,
      decay: 0.012,
      size: Math.random() * 6 + 3,
      color: `hsl(${Math.random() * 360}, 100%, 60%)`
    });
  }
  
  // Create cartoon "BOING!" shockwave
  session.particles.push({
    type: 'cartoon-boing',
    x: rocket.x,
    y: rocket.y + 15,
    radius: 5,
    maxRadius: 80,
    life: 1.0,
    decay: 0.04,
    color: 'hsl(60, 100%, 50%)',
    bouncy: true
  });
}

function animationDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== ANIMATION LOOP =====

function startSpaceportAnimation() {
  function animate() {
    updateSpaceport();
    renderSpaceport();
    spaceportAnimationId = requestAnimationFrame(animate);
  }
  animate();
}

function updateSpaceport() {
  const session = getSpaceportSession();
  if (!session.isOperational) return;
  
  // Update mission time display
  if (session.sessionStartTime) {
    const elapsed = Date.now() - session.sessionStartTime;
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);
    
    document.getElementById('missionTimeDisplay').textContent = 
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  // Update launching rockets
  for (const [rocketId, rocket] of session.rockets) {
    if (rocket.launchPhase === 'liftoff' && rocket.liftoffStartTime) {
      const elapsed = Date.now() - rocket.liftoffStartTime;
      
      // Different animation based on rocket type
      if (rocket.type === 'cartoon') {
        animateCartoonBalloonFlight(rocket, elapsed, session);
      } else {
        animateStandardRocketFlight(rocket, elapsed, session);
      }
    }
  }

  // Update particles
  if (session.particles) {
    session.particles = session.particles.filter(particle => {
      // Update particle position
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= particle.decay;
      
      // Add gravity to debris and flame
      if (particle.type === 'debris' || particle.type === 'flame') {
        particle.vy += 0.2; // Gravity
      }
      
      // Update shockwave
      if (particle.type === 'shockwave') {
        particle.radius += (particle.maxRadius - particle.radius) * 0.1;
      }
      
      // Remove dead particles
      return particle.life > 0;
    });
  }
  
  // Update screen shake
  if (session.screenShake) {
    const elapsed = Date.now() - session.screenShake.startTime;
    if (elapsed > session.screenShake.duration) {
      session.screenShake = null;
    }
  }
}

function animateCartoonBalloonFlight(rocket, elapsed, session) {
  const progress = Math.min(elapsed / 6000, 1); // 6 seconds of pure balloon mayhem!
  
  // Initialize balloon physics if not already done
  if (!rocket.balloonPhysics) {
    rocket.balloonPhysics = {
      vx: (Math.random() - 0.5) * 100, // Random initial velocity
      vy: -Math.random() * 200 - 100,  // Initial upward burst
      thrust: 1.0,
      escapeAngle: Math.random() * Math.PI * 2, // Where air is escaping from
      spin: (Math.random() - 0.5) * 20,          // Initial spin
      spiralPhase: 0,
      loopPhase: 0,
      lastMajorChange: 0,
      airBursts: [], // Track multiple air escape points
      momentum: 1.0
    };
    
    // Initialize multiple air escape points (like a real balloon)
    for (let i = 0; i < 3; i++) {
      rocket.balloonPhysics.airBursts.push({
        angle: Math.random() * Math.PI * 2,
        strength: Math.random() * 0.8 + 0.2,
        frequency: Math.random() * 5 + 2
      });
    }
  }
  
  const physics = rocket.balloonPhysics;
  const time = elapsed * 0.001;
  
  // Balloon deflates over time but with dramatic bursts
  physics.thrust = Math.max(0.05, 1.2 - (progress * 0.8));
  physics.momentum = Math.max(0.1, 1.0 - (progress * 0.6));
  
  // MAJOR DIRECTION CHANGES - like real balloon randomness!
  if (elapsed - physics.lastMajorChange > 300 + Math.random() * 800) {
    // Sudden dramatic direction change!
    const burstForce = physics.thrust * (200 + Math.random() * 300);
    const burstAngle = Math.random() * Math.PI * 2;
    
    physics.vx += Math.cos(burstAngle) * burstForce;
    physics.vy += Math.sin(burstAngle) * burstForce;
    
    // Change escape angle dramatically
    physics.escapeAngle += (Math.random() - 0.5) * Math.PI;
    physics.spin += (Math.random() - 0.5) * 30;
    
    physics.lastMajorChange = elapsed;
  }
  
  // CONTINUOUS AIR ESCAPE FORCES from multiple points
  let totalForceX = 0;
  let totalForceY = 0;
  
  physics.airBursts.forEach((burst, i) => {
    const burstTime = time * burst.frequency;
    const burstStrength = Math.sin(burstTime) * burst.strength * physics.thrust * 80;
    
    totalForceX += Math.cos(burst.angle) * burstStrength;
    totalForceY += Math.sin(burst.angle) * burstStrength;
    
    // Randomly shift burst angles
    if (Math.random() < 0.01) {
      burst.angle += (Math.random() - 0.5) * 0.5;
    }
  });
  
  // Apply air burst forces
  physics.vx += totalForceX;
  physics.vy += totalForceY;
  
  // SPIRAL AND LOOP PATTERNS (natural balloon behavior)
  physics.spiralPhase += time * 3;
  physics.loopPhase += time * 2;
  
  // Add spiral motion
  const spiralForce = Math.sin(physics.spiralPhase) * physics.thrust * 50;
  physics.vx += Math.cos(time * 4) * spiralForce;
  physics.vy += Math.sin(time * 4) * spiralForce;
  
  // Add loop-de-loop tendency
  const loopForce = Math.cos(physics.loopPhase) * physics.thrust * 40;
  physics.vx += Math.sin(time * 6) * loopForce;
  physics.vy += Math.cos(time * 6) * loopForce;
  
  // GRAVITY affects deflating balloon
  physics.vy += 30 * (1 - physics.thrust); // More gravity as balloon deflates
  
  // CHAOTIC TURBULENCE
  physics.vx += (Math.random() - 0.5) * physics.thrust * 60;
  physics.vy += (Math.random() - 0.5) * physics.thrust * 60;
  
  // MOMENTUM and drag (balloons are light and bouncy)
  physics.vx *= 0.98; // Less drag than before
  physics.vy *= 0.98;
  
  // Update position with momentum
  rocket.x += physics.vx * 0.016 * physics.momentum;
  rocket.y += physics.vy * 0.016 * physics.momentum;
  
  // BOUNCING BEHAVIOR - balloons are super bouncy!
  const canvasWidth = spaceportCanvas.width;
  const canvasHeight = spaceportCanvas.height;
  const margin = 30;
  
  if (rocket.x < margin || rocket.x > canvasWidth - margin) {
    physics.vx *= -0.9; // Very bouncy
    physics.vy *= 0.95; // Keep some Y momentum
    physics.spin += (Math.random() - 0.5) * 20;
    
    // Add burst of chaotic energy after bounce
    physics.vx += (Math.random() - 0.5) * 100;
    physics.vy += (Math.random() - 0.5) * 100;
  }
  
  if (rocket.y < margin || rocket.y > canvasHeight - margin) {
    physics.vy *= -0.9;
    physics.vx *= 0.95;
    physics.spin += (Math.random() - 0.5) * 20;
    
    // Balloons often get extra chaotic after hitting ceiling/floor
    physics.vx += (Math.random() - 0.5) * 150;
    physics.vy += (Math.random() - 0.5) * 150;
  }
  
  // VISUAL EFFECTS - wild spinning and scaling
  physics.spin += physics.thrust * 8;
  rocket.tilt = physics.spin + Math.sin(time * 10) * 20;
  rocket.scale = 1.0 + Math.sin(time * 12) * 0.15 + (physics.thrust * 0.1);
  
  // Create more dramatic particle trail
  if (Math.random() < physics.thrust * 1.5) {
    session.particles = session.particles || [];
    
    // Multiple trail points from air escaping
    physics.airBursts.forEach((burst, i) => {
      if (Math.random() < 0.3) {
        session.particles.push({
          type: Math.random() < 0.4 ? 'cartoon-star' : 'cartoon-puff',
          x: rocket.x + Math.cos(burst.angle) * 20,
          y: rocket.y + Math.sin(burst.angle) * 20,
          vx: -Math.cos(burst.angle) * 50 + (Math.random() - 0.5) * 30,
          vy: -Math.sin(burst.angle) * 50 + (Math.random() - 0.5) * 30,
          life: 1.0,
          decay: 0.02,
          size: Math.random() * 8 + 4,
          color: `hsl(${(i * 120 + time * 100) % 360}, 90%, 70%)`
        });
      }
    });
  }
}

function animateStandardRocketFlight(rocket, elapsed, session) {
  const progress = Math.min(elapsed / 3000, 1); // Extended to 3 seconds for more dramatic effect
  
  // Multi-stage launch animation with easing
  if (progress <= 0.2) {
    // Stage 1: Slow initial rise with maximum thrust effects (0-0.6s)
    const stageProgress = progress / 0.2;
    const easeOut = 1 - Math.pow(1 - stageProgress, 3); // Cubic ease-out
    rocket.y = rocket.originalY - (easeOut * 50); // Slow initial rise
    rocket.scale = 1.0; // Full size during initial thrust
    rocket.thrust = 1.0; // Maximum thrust effects
    rocket.tilt = Math.sin(elapsed * 0.01) * 2; // Slight vibration
  } else if (progress <= 0.6) {
    // Stage 2: Accelerating rise with trail effects (0.6-1.8s)
    const stageProgress = (progress - 0.2) / 0.4;
    const easeIn = Math.pow(stageProgress, 2); // Quadratic ease-in (acceleration)
    rocket.y = rocket.originalY - 50 - (easeIn * 300); // Accelerating upward
    rocket.scale = 1.0 - (stageProgress * 0.2); // Slight size reduction for perspective
    rocket.thrust = 0.8; // Strong thrust
    rocket.tilt = 0; // Straighten out
    
    // Add velocity trail particles more frequently
    if (Math.random() < 0.6) {
      session.particles = session.particles || [];
      session.particles.push({
        type: 'velocity-trail',
        x: rocket.x + (Math.random() - 0.5) * 8,
        y: rocket.y + getRocketHeight(rocket.type) / 2,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 8 + 5,
        life: 1.0,
        decay: 0.03,
        size: Math.random() * 6 + 4,
        color: `hsl(${Math.random() * 60 + 15}, 100%, ${70 + Math.random() * 20}%)`
      });
    }
  } else {
    // Stage 3: High altitude with perspective and atmospheric effects (1.8-3.0s)
    const stageProgress = (progress - 0.6) / 0.4;
    const easeOut = 1 - Math.pow(1 - stageProgress, 4); // Quartic ease-out
    
    // Dramatic height gain with perspective
    rocket.y = rocket.originalY - 350 - (easeOut * (spaceportCanvas.height * 0.8));
    
    // Perspective scaling (more realistic)
    const perspectiveScale = 1.0 - (stageProgress * 0.85); // Scale down to 15% at the end
    rocket.scale = Math.max(0.15, perspectiveScale);
    
    // Atmospheric effects
    rocket.thrust = 0.6 - (stageProgress * 0.4); // Thrust fades as it gets higher
    rocket.atmospheric = stageProgress; // Atmospheric fade effect
    
    // Sparse high-altitude trail
    if (Math.random() < 0.2) {
      session.particles = session.particles || [];
      session.particles.push({
        type: 'high-altitude-trail',
        x: rocket.x + (Math.random() - 0.5) * 4,
        y: rocket.y + getRocketHeight(rocket.type) / 2,
        vx: (Math.random() - 0.5) * 1,
        vy: Math.random() * 3 + 2,
        life: 1.0,
        decay: 0.02,
        size: Math.random() * 3 + 2,
        color: `hsla(${Math.random() * 40 + 10}, 80%, 60%, 0.7)`
      });
    }
  }
  
  // Continuous exhaust trail throughout launch
  if (Math.random() < 0.4) {
    session.particles = session.particles || [];
    const thrustIntensity = rocket.thrust || 0.5;
    session.particles.push({
      type: 'exhaust-trail',
      x: rocket.x + (Math.random() - 0.5) * 6,
      y: rocket.y + getRocketHeight(rocket.type) / 2 + 10,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 6 + 3,
      life: 1.0,
      decay: 0.025,
      size: Math.random() * 5 + 3,
      color: `hsl(${Math.random() * 50 + 10}, 90%, ${50 + thrustIntensity * 30}%)`,
      intensity: thrustIntensity
    });
  }
}

export function renderSpaceport() {
  if (!spaceportCanvas || !spaceportCtx) return;
  
  const session = getSpaceportSession();
  
  // Apply screen shake effect
  spaceportCtx.save();
  if (session.screenShake) {
    const elapsed = Date.now() - session.screenShake.startTime;
    const progress = elapsed / session.screenShake.duration;
    const intensity = session.screenShake.intensity * (1 - progress);
    
    const shakeX = (Math.random() - 0.5) * intensity;
    const shakeY = (Math.random() - 0.5) * intensity;
    spaceportCtx.translate(shakeX, shakeY);
  }
  
  // Clear canvas
  spaceportCtx.fillStyle = 'transparent';
  spaceportCtx.clearRect(0, 0, spaceportCanvas.width, spaceportCanvas.height);
  
  // Draw stars
  drawStars();
  
  // Draw horizon line
  drawHorizon();
  
  // Draw Tesla Energy Tower (left side)
  drawEnergyTower();
  
  // Draw Mission Control building (right side)
  drawMissionControl();
  
  // Draw zap effects
  drawZapEffects();
  
  // Draw launch pads and rockets
  drawLaunchPadsAndRockets();
  
  // Draw particle effects
  drawParticleEffects();
  
  spaceportCtx.restore();
}

// ===== RENDERING FUNCTIONS =====

function drawStars() {
  if (!spaceportCanvas || !spaceportCtx) return;
  
  spaceportCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * spaceportCanvas.width;
    const y = Math.random() * (horizonY - 100);
    const size = Math.random() * 2;
    
    spaceportCtx.beginPath();
    spaceportCtx.arc(x, y, size, 0, Math.PI * 2);
    spaceportCtx.fill();
  }
}

function drawHorizon() {
  // Earth horizon line
  spaceportCtx.strokeStyle = '#4a6741';
  spaceportCtx.lineWidth = 3;
  spaceportCtx.beginPath();
  spaceportCtx.moveTo(0, horizonY);
  spaceportCtx.lineTo(spaceportCanvas.width, horizonY);
  spaceportCtx.stroke();
  
  // Earth glow
  const gradient = spaceportCtx.createLinearGradient(0, horizonY, 0, spaceportCanvas.height);
  gradient.addColorStop(0, 'rgba(100, 150, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(50, 100, 150, 0.3)');
  
  spaceportCtx.fillStyle = gradient;
  spaceportCtx.fillRect(0, horizonY, spaceportCanvas.width, spaceportCanvas.height - horizonY);
}

function drawEnergyTower() {
  const session = getSpaceportSession();
  const towerX = spaceportCanvas.width * 0.1;
  const towerBase = horizonY;
  const towerHeight = 240;
  const towerTop = towerBase - towerHeight;
  
  // Tesla tower temperament variables
  const time = Date.now() * 0.001;
  const energyIntensity = session.activeRocket ? 
    0.7 + Math.sin(time * 3) * 0.3 : 0.2 + Math.sin(time * 0.5) * 0.1;
  
  // Dynamic color cycling
  const colorPhase = (time * 0.7) % (Math.PI * 2);
  const baseHue = session.activeRocket ? 
    180 + Math.sin(colorPhase) * 60 : 
    200 + Math.sin(colorPhase * 0.3) * 20;
  
  const primaryColor = `hsl(${baseHue}, 80%, ${60 + energyIntensity * 20}%)`;
  
  // Main tower structure
  spaceportCtx.strokeStyle = primaryColor;
  spaceportCtx.lineWidth = 3;
  
  // Tower legs
  const legSpread = 25;
  spaceportCtx.beginPath();
  spaceportCtx.moveTo(towerX - legSpread, towerBase);
  spaceportCtx.lineTo(towerX - 8, towerTop + 60);
  spaceportCtx.lineTo(towerX - 8, towerTop + 20);
  spaceportCtx.moveTo(towerX + legSpread, towerBase);
  spaceportCtx.lineTo(towerX + 8, towerTop + 60);
  spaceportCtx.lineTo(towerX + 8, towerTop + 20);
  spaceportCtx.stroke();
  
  // Central mast
  spaceportCtx.lineWidth = 4;
  spaceportCtx.beginPath();
  spaceportCtx.moveTo(towerX, towerBase);
  spaceportCtx.lineTo(towerX, towerTop + 20);
  spaceportCtx.stroke();
  
  // Tesla coil head
  const headRadius = 35;
  const headY = towerTop - 10;
  const glowColor = `hsl(${baseHue}, 90%, 70%)`;
  
  // Outer coil rings
  for (let ring = 0; ring < 4; ring++) {
    const ringRadius = headRadius - (ring * 6);
    const ringIntensity = energyIntensity * (1 - ring * 0.2);
    const ringAlpha = Math.max(0.1, ringIntensity);
    
    spaceportCtx.strokeStyle = `hsla(${baseHue}, 80%, 70%, ${ringAlpha})`;
    spaceportCtx.lineWidth = 3 - ring * 0.5;
    spaceportCtx.beginPath();
    spaceportCtx.arc(towerX, headY, ringRadius, 0, Math.PI * 2);
    spaceportCtx.stroke();
  }
  
  // Central energy core
  const coreRadius = 12 + Math.sin(time * 4) * 4;
  spaceportCtx.shadowColor = glowColor;
  spaceportCtx.shadowBlur = 20 + energyIntensity * 20;
  spaceportCtx.fillStyle = glowColor;
  spaceportCtx.beginPath();
  spaceportCtx.arc(towerX, headY, coreRadius, 0, Math.PI * 2);
  spaceportCtx.fill();
  spaceportCtx.shadowBlur = 0;
  
  // Energy crackling effects
  if (session.activeRocket && energyIntensity > 0.6) {
    drawTeslaLightning(towerX, headY, headRadius + 10, baseHue, energyIntensity);
  }
  
  // Occasional ZAP to active rocket
  if (session.activeRocket && Math.random() < 0.0011) {
    zapActiveRocket(towerX, headY, baseHue);
  }
}

function drawTeslaLightning(centerX, centerY, radius, hue, intensity) {
  const numBolts = 3 + Math.floor(Math.random() * 3);
  
  for (let i = 0; i < numBolts; i++) {
    const angle = (Math.PI * 2 * i) / numBolts + Math.random() * 0.5;
    const boltLength = radius + Math.random() * 15;
    
    spaceportCtx.strokeStyle = `hsla(${hue + Math.random() * 40 - 20}, 90%, 80%, ${intensity})`;
    spaceportCtx.lineWidth = 1 + Math.random() * 2;
    spaceportCtx.shadowColor = spaceportCtx.strokeStyle;
    spaceportCtx.shadowBlur = 8;
    
    spaceportCtx.beginPath();
    spaceportCtx.moveTo(centerX, centerY);
    
    // Jagged lightning path
    const steps = 4 + Math.floor(Math.random() * 3);
    
    for (let step = 1; step <= steps; step++) {
      const stepX = centerX + Math.cos(angle) * (boltLength * step / steps) + (Math.random() - 0.5) * 10;
      const stepY = centerY + Math.sin(angle) * (boltLength * step / steps) + (Math.random() - 0.5) * 10;
      spaceportCtx.lineTo(stepX, stepY);
    }
    
    spaceportCtx.stroke();
    spaceportCtx.shadowBlur = 0;
  }
}

function zapActiveRocket(towerX, towerY, hue) {
  const session = getSpaceportSession();
  if (!session.activeRocket) return;
  
  const activeRocket = session.rockets.get(session.activeRocket);
  if (!activeRocket) return;
  
  // Store zap effect for rendering
  const zapEffect = {
    startX: towerX,
    startY: towerY,
    endX: activeRocket.x,
    endY: activeRocket.y,
    hue: hue,
    intensity: 1.0,
    duration: 15, // frames
    createdAt: Date.now()
  };
  
  // Add to active zap effects
  if (!session.zapEffects) {
    session.zapEffects = [];
  }
  session.zapEffects.push(zapEffect);

  
  console.log(`⚡ ZAP! Tesla tower energizes rocket: ${activeRocket.taskTitle}`);
}

function drawZapEffects() {
  const session = getSpaceportSession();
  if (!session.zapEffects) return;
  
  const currentTime = Date.now();
  
  // Filter out expired zaps and draw active ones
  session.zapEffects = session.zapEffects.filter(zap => {
    const age = currentTime - zap.createdAt;
    const maxAge = zap.duration * (1000 / 60); // Convert frames to milliseconds
    
    if (age > maxAge) return false; // Remove expired zap
    
    // Draw the zap effect
    const progress = age / maxAge;
    const intensity = 1 - progress; // Fade out over time
    
    spaceportCtx.shadowColor = `hsl(${zap.hue}, 90%, 80%)`;
    spaceportCtx.shadowBlur = 15 * intensity;
    spaceportCtx.strokeStyle = `hsla(${zap.hue}, 90%, 85%, ${intensity})`;
    spaceportCtx.lineWidth = 3 * intensity;
    
    // Main zap bolt
    spaceportCtx.beginPath();
    spaceportCtx.moveTo(zap.startX, zap.startY);
    
    // Create jagged lightning path
    const segments = 8;
    const deltaX = (zap.endX - zap.startX) / segments;
    const deltaY = (zap.endY - zap.startY) / segments;
    
    for (let i = 1; i <= segments; i++) {
      const baseX = zap.startX + deltaX * i;
      const baseY = zap.startY + deltaY * i;
      const jitterX = (Math.random() - 0.5) * 30 * intensity;
      const jitterY = (Math.random() - 0.5) * 30 * intensity;
      
      spaceportCtx.lineTo(baseX + jitterX, baseY + jitterY);
    }
    
    spaceportCtx.lineTo(zap.endX, zap.endY);
    spaceportCtx.stroke();
    spaceportCtx.shadowBlur = 0;
    
    return true; // Keep this zap for next frame
  });
  

}

function drawMissionControl() {
  const session = getSpaceportSession();
  const buildingX = spaceportCanvas.width * 0.65; // Mission Control building position (moved left from task selector)
  const buildingBase = horizonY;
  const buildingHeight = 120;
  const buildingWidth = 140;
  const buildingTop = buildingBase - buildingHeight;
  
  // Main building structure
  spaceportCtx.strokeStyle = '#64d6ff';
  spaceportCtx.lineWidth = 3;
  spaceportCtx.fillStyle = 'rgba(0, 20, 40, 0.8)';
  
  // Building base
  spaceportCtx.fillRect(buildingX - buildingWidth/2, buildingTop, buildingWidth, buildingHeight);
  spaceportCtx.strokeRect(buildingX - buildingWidth/2, buildingTop, buildingWidth, buildingHeight);
  
  // Main entrance
  spaceportCtx.fillStyle = 'rgba(100, 214, 255, 0.2)';
  spaceportCtx.fillRect(buildingX - 15, buildingBase - 30, 30, 30);
  spaceportCtx.strokeRect(buildingX - 15, buildingBase - 30, 30, 30);
  
  // Multiple floors with windows
  for (let floor = 0; floor < 4; floor++) {
    const floorY = buildingTop + 20 + (floor * 25);
    for (let window = 0; window < 5; window++) {
      const windowX = buildingX - 50 + (window * 25);
      
      // Window glow effect
      spaceportCtx.fillStyle = session.isOperational ? 
        'rgba(100, 214, 255, 0.6)' : 'rgba(100, 214, 255, 0.2)';
      spaceportCtx.fillRect(windowX, floorY, 12, 15);
      
      spaceportCtx.strokeStyle = '#64d6ff';
      spaceportCtx.lineWidth = 1;
      spaceportCtx.strokeRect(windowX, floorY, 12, 15);
    }
  }
  
  // Command tower on top
  const towerHeight = 25;
  spaceportCtx.fillStyle = 'rgba(0, 30, 60, 0.9)';
  spaceportCtx.fillRect(buildingX - 20, buildingTop - towerHeight, 40, towerHeight);
  spaceportCtx.strokeRect(buildingX - 20, buildingTop - towerHeight, 40, towerHeight);
  
  // Communication mast
  spaceportCtx.strokeStyle = '#64d6ff';
  spaceportCtx.lineWidth = 2;
  spaceportCtx.beginPath();
  spaceportCtx.moveTo(buildingX, buildingTop - towerHeight);
  spaceportCtx.lineTo(buildingX, buildingTop - towerHeight - 20);
  spaceportCtx.stroke();
  
  // Radar dish (animated if operational)
  const radarRadius = 8;
  const rotationAngle = session.isOperational ? (Date.now() * 0.001) % (Math.PI * 2) : 0;
  
  spaceportCtx.save();
  spaceportCtx.translate(buildingX, buildingTop - towerHeight - 15);
  spaceportCtx.rotate(rotationAngle);
  spaceportCtx.beginPath();
  spaceportCtx.arc(0, 0, radarRadius, 0, Math.PI);
  spaceportCtx.stroke();
  spaceportCtx.restore();
  
  // Building label
  if (session.isOperational) {
    spaceportCtx.fillStyle = '#64d6ff';
    spaceportCtx.font = 'bold 12px Arial';
    spaceportCtx.textAlign = 'center';
    spaceportCtx.fillText('MISSION CONTROL', buildingX, buildingBase + 15);
  }
}

function drawLaunchPadsAndRockets() {
  const session = getSpaceportSession();
  for (const [rocketId, rocket] of session.rockets) {
    // Draw launch pad first (behind rocket)
    drawLaunchPad(rocket.launchPad);
    
    // Always draw rocket unless it's completely done launching
    if (!rocket.launchPhase || rocket.launchPhase !== 'completed') {
      drawRocket(rocket);
    }
  }
}

function drawLaunchPad(pad) {
  const ctx = spaceportCtx;
  const x = pad.x;
  const y = pad.y;
  const radius = pad.radius;
  
  // Ziggurat-style launch pad - trapezoid shape
  const baseWidth = radius * 3;
  const topWidth = radius * 2;
  const height = radius * 0.8;
  
  // Base layer
  ctx.fillStyle = pad.isActive ? 'rgba(80, 180, 80, 0.9)' : 'rgba(100, 100, 100, 0.9)';
  ctx.strokeStyle = pad.isActive ? '#50b450' : '#666';
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  ctx.moveTo(x - baseWidth/2, y);
  ctx.lineTo(x - topWidth/2, y - height);
  ctx.lineTo(x + topWidth/2, y - height);
  ctx.lineTo(x + baseWidth/2, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Middle layer
  const midWidth = radius * 2.4;
  const midTopWidth = radius * 1.6;
  const midHeight = height * 0.6;
  
  ctx.fillStyle = pad.isActive ? 'rgba(100, 200, 100, 0.9)' : 'rgba(120, 120, 120, 0.9)';
  ctx.strokeStyle = pad.isActive ? '#64c864' : '#777';
  
  ctx.beginPath();
  ctx.moveTo(x - midWidth/2, y - height * 0.4);
  ctx.lineTo(x - midTopWidth/2, y - height * 0.4 - midHeight);
  ctx.lineTo(x + midTopWidth/2, y - height * 0.4 - midHeight);
  ctx.lineTo(x + midWidth/2, y - height * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Top platform
  const topPlatformWidth = radius * 1.6;
  const platformHeight = height * 0.3;
  
  ctx.fillStyle = pad.isActive ? 'rgba(120, 255, 120, 0.9)' : 'rgba(140, 140, 140, 0.9)';
  ctx.strokeStyle = pad.isActive ? '#78ff78' : '#888';
  ctx.lineWidth = 3;
  
  ctx.beginPath();
  ctx.moveTo(x - topPlatformWidth/2, y - height);
  ctx.lineTo(x - topPlatformWidth/3, y - height - platformHeight);
  ctx.lineTo(x + topPlatformWidth/3, y - height - platformHeight);
  ctx.lineTo(x + topPlatformWidth/2, y - height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Active launch pad energy effects
  if (pad.isActive) {
    // Pulsing energy ring
    const pulseRadius = radius + Math.sin(Date.now() * 0.005) * 5;
    ctx.strokeStyle = 'rgba(100, 255, 100, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Circular gel button - click target
  const buttonRadius = radius * 0.6;
  const buttonY = y - height * 0.3;
  
  ctx.fillStyle = pad.isActive ? 'rgba(0, 150, 0, 0.7)' : 'rgba(80, 80, 80, 0.7)';
  ctx.strokeStyle = pad.isActive ? '#00aa00' : '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, buttonY, buttonRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Button highlight (gel effect)
  ctx.fillStyle = pad.isActive ? 'rgba(100, 255, 100, 0.4)' : 'rgba(150, 150, 150, 0.4)';
  ctx.beginPath();
  ctx.arc(x - buttonRadius * 0.3, buttonY - buttonRadius * 0.3, buttonRadius * 0.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Blast crater effects (after launch)
  if (pad.hasBlastCrater && pad.craterStartTime) {
    const elapsed = Date.now() - pad.craterStartTime;
    const craterProgress = Math.min(elapsed / 3000, 1);
    
    const craterRadius = radius * 0.8 * craterProgress;
    ctx.fillStyle = `rgba(60, 30, 20, ${0.8 * craterProgress})`;
    ctx.beginPath();
    ctx.arc(x, y - height * 0.2, craterRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Remove crater after 30 seconds
    if (elapsed > 30000) {
      pad.hasBlastCrater = false;
      pad.craterStartTime = null;
    }
  }
}

function drawRocket(rocket) {
  const ctx = spaceportCtx;
  const x = rocket.x;
  const y = rocket.y;
  
  // Handle launch phase transformations
  ctx.save();
  
  // Apply tilt (vibration during initial launch)
  if (rocket.tilt !== undefined) {
    ctx.translate(x, y);
    ctx.rotate(rocket.tilt * Math.PI / 180);
    ctx.translate(-x, -y);
  }
  
  // Apply scaling with perspective
  if (rocket.scale !== undefined) {
    ctx.translate(x, y);
    ctx.scale(rocket.scale, rocket.scale);
    ctx.translate(-x, -y);
  }
  
  // Apply atmospheric fade for high altitude
  if (rocket.atmospheric !== undefined) {
    ctx.globalAlpha = 1 - (rocket.atmospheric * 0.6); // Fade out but not completely
  }
  
  // Determine rocket state and colors
  let rocketColor = '#888'; // Default dormant
  let glowColor = null;
  
  // Launch phase special effects
  if (rocket.launchPhase === 'preparation') {
    rocketColor = '#ffff64';
    glowColor = '#ffff64';
    const vibration = Math.sin(Date.now() * 0.05) * 2;
    ctx.translate(vibration, 0);
  } else if (rocket.launchPhase === 'ignition') {
    rocketColor = '#ff6464';
    glowColor = '#ff6464';
    ctx.shadowBlur = 25;
  } else if (rocket.launchPhase === 'liftoff') {
    // Dynamic colors during launch phases
    const thrustIntensity = rocket.thrust || 0.5;
    rocketColor = `hsl(${60 - (thrustIntensity * 60)}, 100%, ${70 + (thrustIntensity * 20)}%)`;
    glowColor = rocketColor;
    ctx.shadowBlur = 20 + (thrustIntensity * 20);
    
    // Add heat distortion effect
    const distortion = Math.sin(Date.now() * 0.02) * thrustIntensity * 2;
    ctx.translate(distortion, 0);
  } else if (!rocket.category) {
    // Needs category - yellow/orange pulsing
    rocketColor = '#ffaa00';
    glowColor = '#ffaa00';
  } else if (rocket.isActive) {
    // Active rocket - green
    rocketColor = '#64ff64';
    glowColor = '#64ff64';
  } else {
    // Ready rocket - blue
    rocketColor = '#64d6ff';
  }
  
  // Rocket glow
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = ctx.shadowBlur || 15;
  }
  
  // Draw rocket based on type
  switch (rocket.type) {
    case 'v2':
      drawV2Rocket(ctx, x, y, rocketColor);
      break;
    case 'apollo':
      drawApolloRocket(ctx, x, y, rocketColor);
      // Draw service tower for Apollo rockets
      drawApolloServiceTower(ctx, rocket, x, y);
      break;
    case 'cartoon':
      drawCartoonRocket(ctx, x, y, rocketColor);
      break;
    case 'scout':
    default:
      drawScoutRocket(ctx, x, y, rocketColor);
      break;
  }
  
  // Thruster glow for active rocket
  if (rocket.isActive) {
    const thrusterY = y + getRocketHeight(rocket.type) / 2 + 15;
    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.beginPath();
    ctx.ellipse(x, thrusterY, 8, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Pulsing effect for rockets needing category
  if (!rocket.category) {
    const rocketHeight = getRocketHeight(rocket.type);
    const pulseSize = rocketHeight / 2 + Math.sin(Date.now() * 0.008) * 12;
    ctx.beginPath();
    ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffaa0040';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  
  ctx.shadowBlur = 0;
  
  // Status indicators
  if (!rocket.category) {
    // Question mark for unconfigured rockets
    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    const indicatorY = y - getRocketHeight(rocket.type) / 2 - 10;
    ctx.fillText('?', x + 20, indicatorY);
  } else if (rocket.category) {
    // Category indicator
    ctx.fillStyle = '#64d6ff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    const categoryName = rocket.category.split('.').pop() || 'Work';
    const indicatorY = y - getRocketHeight(rocket.type) / 2 - 5;
    ctx.fillText(categoryName.substring(0, 8), x, indicatorY);
  }
  
  // Time display
  let totalTime = rocket.totalTime;
  if (rocket.isActive && rocket.startTime) {
    totalTime += Date.now() - rocket.startTime;
  }
  
  const minutes = Math.floor(totalTime / (1000 * 60));
  const timeText = `${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`;
  
  // Background for time text
  const timeWidth = ctx.measureText(timeText).width + 8;
  const timeY = y + getRocketHeight(rocket.type) / 2 + 35;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(x - timeWidth/2, timeY - 5, timeWidth, 16);
  
  // Time text
  ctx.fillStyle = rocket.isActive ? '#64ff64' : rocketColor;
  ctx.font = '12px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText(timeText, x, timeY + 8);
  
  ctx.restore();
}

function drawParticleEffects() {
  const session = getSpaceportSession();
  if (!session.particles) return;
  
  const ctx = spaceportCtx;
  
  session.particles.forEach(particle => {
    ctx.save();
    
    switch (particle.type) {
      case 'flame':
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = particle.size;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'trail':
        ctx.globalAlpha = particle.life * 0.8;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = particle.size * 2;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'velocity-trail':
        // Fast-moving streaks during acceleration phase
        ctx.globalAlpha = particle.life * 0.9;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = particle.size * 1.5;
        ctx.fillRect(particle.x - particle.size/2, particle.y - particle.size/2, 
                    particle.size, particle.size * 2);
        break;
        
      case 'high-altitude-trail':
        // Sparse, fading trail for high altitude
        ctx.globalAlpha = particle.life * 0.5;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = particle.size * 0.8;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'exhaust-trail':
        // Continuous exhaust with varying intensity
        const intensity = particle.intensity || 0.5;
        ctx.globalAlpha = particle.life * (0.6 + intensity * 0.4);
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = particle.size * (1 + intensity);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (0.8 + intensity * 0.4), 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'debris':
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
        break;
        
      case 'smoke':
        ctx.globalAlpha = particle.life * 0.3;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'shockwave':
        ctx.globalAlpha = particle.life * 0.5;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
        
      case 'apollo-exhaust':
        // Massive F-1 engine exhaust
        const exhaustIntensity = particle.intensity || 1.0;
        ctx.globalAlpha = particle.life * exhaustIntensity;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = particle.size * 2;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * exhaustIntensity, 0, Math.PI * 2);
        ctx.fill();
        // Add bright inner core
        ctx.globalAlpha = particle.life * exhaustIntensity * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'apollo-smoke':
        // Massive smoke clouds with expansion
        if (particle.expansion) {
          particle.size *= particle.expansion;
        }
        ctx.globalAlpha = particle.life * 0.4;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'apollo-debris':
        // Launch pad debris with gravity
        if (particle.gravity) {
          particle.vy += particle.gravity;
        }
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x - particle.size/2, particle.y - particle.size/2, 
                    particle.size, particle.size);
        break;
        
      case 'apollo-shockwave':
        // Multiple expanding shockwaves
        particle.radius = Math.min(particle.radius + 4, particle.maxRadius);
        ctx.globalAlpha = particle.life * 0.6;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 4 - (particle.wave || 0);
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
        
      case 'cartoon-puff':
        // Colorful cartoon smoke puffs
        ctx.globalAlpha = particle.life * 0.8;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = particle.size;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        // Add cartoon outline
        ctx.globalAlpha = particle.life * 0.6;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
        
      case 'cartoon-star':
        // Twinkling cartoon stars
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(Date.now() * 0.01); // Spinning stars
        // Draw 5-pointed star
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5;
          const x = Math.cos(angle) * particle.size;
          const y = Math.sin(angle) * particle.size;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          // Inner point
          const innerAngle = angle + Math.PI / 5;
          const innerX = Math.cos(innerAngle) * (particle.size * 0.4);
          const innerY = Math.sin(innerAngle) * (particle.size * 0.4);
          ctx.lineTo(innerX, innerY);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        break;
        
      case 'cartoon-boing':
        // Bouncy cartoon shockwave
        particle.radius += 3;
        if (particle.radius > particle.maxRadius) {
          particle.radius = particle.maxRadius;
        }
        ctx.globalAlpha = particle.life * 0.8;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 5;
        ctx.setLineDash([]);
        // Create bouncy zigzag pattern
        ctx.beginPath();
        const segments = 16;
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const zigzag = Math.sin(i * 2) * 5; // Zigzag amplitude
          const radius = particle.radius + zigzag;
          const x = particle.x + Math.cos(angle) * radius;
          const y = particle.y + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        break;
    }
    
    ctx.restore();
  });
}

// ===== ROCKET RENDERING =====

function getRocketHeight(type) {
  switch (type) {
    case 'v2': return 120;
    case 'apollo': return 150; // Increased for enhanced Apollo design
    case 'cartoon': return 70; // Short and fat cartoon rocket
    case 'scout': return 80;
    default: return 80;
  }
}

function drawScoutRocket(ctx, x, y, color) {
  // Simple, clean rocket - single stage with classic fins
  const height = 80;
  const width = 18;
  const halfHeight = height / 2;
  
  ctx.fillStyle = color;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  
  // Main rocket body
  ctx.beginPath();
  ctx.rect(x - width/2, y - halfHeight + 15, width, height - 30);
  ctx.fill();
  ctx.stroke();
  
  // Nose cone
  ctx.beginPath();
  ctx.moveTo(x, y - halfHeight - 5);
  ctx.lineTo(x - width/2, y - halfHeight + 15);
  ctx.lineTo(x + width/2, y - halfHeight + 15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Four simple fins at bottom
  const finY = y + halfHeight - 15;
  const finSize = 12;
  
  // Left fin
  ctx.beginPath();
  ctx.moveTo(x - width/2, finY);
  ctx.lineTo(x - width/2 - finSize, finY + finSize);
  ctx.lineTo(x - width/2, finY + finSize);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Right fin
  ctx.beginPath();
  ctx.moveTo(x + width/2, finY);
  ctx.lineTo(x + width/2 + finSize, finY + finSize);
  ctx.lineTo(x + width/2, finY + finSize);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Top fin (simulated)
  ctx.beginPath();
  ctx.moveTo(x - 4, finY);
  ctx.lineTo(x, finY + finSize);
  ctx.lineTo(x + 4, finY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Bottom fin (simulated)
  ctx.beginPath();
  ctx.moveTo(x - 4, finY + finSize);
  ctx.lineTo(x, finY);
  ctx.lineTo(x + 4, finY + finSize);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Engine nozzle
  ctx.fillStyle = '#444';
  ctx.beginPath();
  ctx.rect(x - 6, y + halfHeight - 15, 12, 15);
  ctx.fill();
  ctx.stroke();
  
  // Simple body detail
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - width/2 + 2, y);
  ctx.lineTo(x + width/2 - 2, y);
  ctx.stroke();
}

function drawV2Rocket(ctx, x, y, color) {
  // Classic rocket shape - tall cylinder with pointed nose and fins
  const height = 120;
  const width = 24;
  const halfHeight = height / 2;
  
  ctx.fillStyle = color;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  
  // Main rocket body - simple cylinder
  ctx.beginPath();
  ctx.rect(x - width/2, y - halfHeight + 20, width, height - 40);
  ctx.fill();
  ctx.stroke();
  
  // Classic pointed nose cone
  ctx.beginPath();
  ctx.moveTo(x, y - halfHeight - 5); // Point at top
  ctx.lineTo(x - width/2, y - halfHeight + 20); // Left base
  ctx.lineTo(x + width/2, y - halfHeight + 20); // Right base
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Three fins at the bottom - classic triangular shape
  const finY = y + halfHeight - 20;
  const finHeight = 25;
  const finWidth = 15;
  
  // Fin 1 - left side
  ctx.beginPath();
  ctx.moveTo(x - width/2, finY);
  ctx.lineTo(x - width/2 - finWidth, finY + finHeight);
  ctx.lineTo(x - width/2, finY + finHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Fin 2 - right side  
  ctx.beginPath();
  ctx.moveTo(x + width/2, finY);
  ctx.lineTo(x + width/2 + finWidth, finY + finHeight);
  ctx.lineTo(x + width/2, finY + finHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Fin 3 - back (simulated with smaller triangle)
  ctx.beginPath();
  ctx.moveTo(x, finY);
  ctx.lineTo(x - 6, finY + finHeight);
  ctx.lineTo(x + 6, finY + finHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Engine nozzle
  ctx.fillStyle = '#444';
  ctx.beginPath();
  ctx.rect(x - 8, y + halfHeight - 20, 16, 20);
  ctx.fill();
  ctx.stroke();
  
  // Simple details
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  // Body panels
  ctx.beginPath();
  ctx.moveTo(x - width/2 + 2, y - 10);
  ctx.lineTo(x + width/2 - 2, y - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - width/2 + 2, y + 10);
  ctx.lineTo(x + width/2 - 2, y + 10);
  ctx.stroke();
}

function drawApolloRocket(ctx, x, y, color) {
  // Multi-stage rocket - looks like a proper Saturn V with enhanced details
  const height = 150; // Made taller for more imposing presence
  const halfHeight = height / 2;
  
  ctx.fillStyle = color;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  
  // First stage (S-IC) - bottom, widest with distinctive Saturn V proportions
  const stage1Width = 32;
  const stage1Height = 45;
  ctx.beginPath();
  ctx.rect(x - stage1Width/2, y + halfHeight - stage1Height, stage1Width, stage1Height);
  ctx.fill();
  ctx.stroke();
  
  // Add first stage details (fuel tank bands)
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const bandY = y + halfHeight - (stage1Height * i / 4);
    ctx.beginPath();
    ctx.moveTo(x - stage1Width/2, bandY);
    ctx.lineTo(x + stage1Width/2, bandY);
    ctx.stroke();
  }
  
  // Second stage (S-II) - middle stage
  const stage2Width = 26;
  const stage2Height = 45;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(x - stage2Width/2, y + halfHeight - stage1Height - stage2Height, stage2Width, stage2Height);
  ctx.fill();
  ctx.stroke();
  
  // Third stage (S-IVB) - upper stage
  const stage3Width = 22;
  const stage3Height = 35;
  ctx.beginPath();
  ctx.rect(x - stage3Width/2, y + halfHeight - stage1Height - stage2Height - stage3Height, stage3Width, stage3Height);
  ctx.fill();
  ctx.stroke();
  
  // Command and Service Module (CSM)
  const csmWidth = 18;
  const csmHeight = 25;
  ctx.beginPath();
  ctx.rect(x - csmWidth/2, y - halfHeight, csmWidth, csmHeight);
  ctx.fill();
  ctx.stroke();
  
  // Launch Escape System (LES) tower
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y - halfHeight);
  ctx.lineTo(x, y - halfHeight - 20);
  ctx.stroke();
  
  // Nose cone (emergency escape rocket)
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.moveTo(x, y - halfHeight - 25);
  ctx.lineTo(x - 4, y - halfHeight - 15);
  ctx.lineTo(x + 4, y - halfHeight - 15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Restore main rocket color
  ctx.fillStyle = color;
  
  // F-1 Engine cluster at bottom (5 massive engines like Saturn V)
  ctx.fillStyle = '#222';
  const engineY = y + halfHeight;
  const engineSize = 5; // Larger engines for Apollo
  
  // Center engine (larger)
  ctx.beginPath();
  ctx.arc(x, engineY, engineSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.stroke();
  
  // Four outer engines in cross pattern
  const outerEngines = [
    {x: -10, y: 0}, {x: 10, y: 0}, {x: 0, y: -10}, {x: 0, y: 10}
  ];
  outerEngines.forEach(engine => {
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x + engine.x, engineY + engine.y, engineSize - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.stroke();
  });
  
  // Stage separation lines (more prominent)
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - stage1Width/2, y + halfHeight - stage1Height);
  ctx.lineTo(x + stage1Width/2, y + halfHeight - stage1Height);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(x - stage2Width/2, y + halfHeight - stage1Height - stage2Height);
  ctx.lineTo(x + stage2Width/2, y + halfHeight - stage1Height - stage2Height);
  ctx.stroke();
  
  // Add distinctive Saturn V black and white stripes
  ctx.fillStyle = '#000';
  const stripeWidth = 3;
  for (let i = 0; i < 3; i++) {
    const stripeY = y + halfHeight - stage1Height - stage2Height - (i * 8);
    ctx.fillRect(x - stage3Width/2, stripeY, stage3Width, stripeWidth);
  }
}

function drawApolloServiceTower(ctx, rocket, rocketX, rocketY) {
  // Don't draw tower if rocket is launching or has launched
  if (rocket.launchPhase === 'liftoff' || rocket.launchPhase === 'completed') {
    return;
  }
  
  // Service tower positioning
  const towerX = rocketX + 60; // Tower is to the right of the rocket
  const towerHeight = 180;
  const towerTop = rocketY - 90;
  const towerBottom = rocketY + 90;
  const towerWidth = 12;
  
  // Animate tower swing during ignition phase
  let towerOffset = 0;
  if (rocket.launchPhase === 'ignition') {
    const swingProgress = (Date.now() - rocket.launchStartTime - 1000) / 500; // Swing during ignition
    if (swingProgress > 0) {
      towerOffset = Math.min(swingProgress, 1) * 40; // Swing 40 pixels away
    }
  }
  
  const finalTowerX = towerX + towerOffset;
  
  ctx.save();
  
  // Tower structure color
  ctx.strokeStyle = '#666';
  ctx.fillStyle = '#555';
  ctx.lineWidth = 3;
  
  // Main tower mast
  ctx.beginPath();
  ctx.moveTo(finalTowerX, towerBottom);
  ctx.lineTo(finalTowerX, towerTop);
  ctx.stroke();
  
  // Cross braces and platforms
  const platformLevels = [0.2, 0.4, 0.6, 0.8]; // Multiple service levels
  platformLevels.forEach(level => {
    const platformY = towerBottom - (towerHeight * level);
    
    // Platform
    ctx.beginPath();
    ctx.moveTo(finalTowerX - 15, platformY);
    ctx.lineTo(finalTowerX + 8, platformY);
    ctx.stroke();
    
    // Support brace
    ctx.beginPath();
    ctx.moveTo(finalTowerX, platformY);
    ctx.lineTo(finalTowerX - 8, platformY + 10);
    ctx.stroke();
  });
  
  // Service arm at rocket level (extends toward rocket)
  const serviceArmY = rocketY - 20;
  if (rocket.launchPhase !== 'ignition') {
    // Service arm connected
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(finalTowerX, serviceArmY);
    ctx.lineTo(rocketX + 16, serviceArmY); // Extends to rocket
    ctx.stroke();
    
    // Umbilical connection
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rocketX + 16, serviceArmY);
    ctx.lineTo(rocketX + 16, serviceArmY + 5);
    ctx.stroke();
  }
  
  // Tower base foundation
  ctx.fillStyle = '#444';
  ctx.fillRect(finalTowerX - 8, towerBottom, 16, 8);
  
  // Add some details - ladder rungs
  ctx.strokeStyle = '#777';
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const rungY = towerBottom - (i * 8);
    if (rungY > towerTop) {
      ctx.beginPath();
      ctx.moveTo(finalTowerX - 3, rungY);
      ctx.lineTo(finalTowerX + 3, rungY);
      ctx.stroke();
    }
  }
  
  ctx.restore();
}

function drawCartoonRocket(ctx, x, y, color) {
  // Classic cartoon bomb/balloon rocket - short, fat, and curvy!
  const height = 70;
  const width = 45; // Much wider than other rockets
  const halfHeight = height / 2;
  
  ctx.fillStyle = color;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  
  // Main body - rounded and chubby like a cartoon bomb
  ctx.beginPath();
  ctx.ellipse(x, y, width/2, halfHeight - 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Classic cartoon bomb fuse/nose (tiny pointy bit on top)
  ctx.fillStyle = '#444';
  ctx.beginPath();
  ctx.moveTo(x, y - halfHeight - 8);
  ctx.lineTo(x - 4, y - halfHeight + 5);
  ctx.lineTo(x + 4, y - halfHeight + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Cartoon sparkle fuse
  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  ctx.arc(x, y - halfHeight - 12, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Cartoon bomb-style band around the middle
  ctx.fillStyle = '#222';
  ctx.fillRect(x - width/2, y - 3, width, 6);
  
  // Cute little fins (more like cartoon bomb fins)
  ctx.fillStyle = color;
  ctx.strokeStyle = '#333';
  
  // Left fin
  ctx.beginPath();
  ctx.moveTo(x - width/2, y + halfHeight - 15);
  ctx.lineTo(x - width/2 - 8, y + halfHeight);
  ctx.lineTo(x - width/2 + 2, y + halfHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Right fin
  ctx.beginPath();
  ctx.moveTo(x + width/2, y + halfHeight - 15);
  ctx.lineTo(x + width/2 + 8, y + halfHeight);
  ctx.lineTo(x + width/2 - 2, y + halfHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Cartoon exhaust port (simple circle at bottom)
  ctx.fillStyle = '#444';
  ctx.beginPath();
  ctx.arc(x, y + halfHeight, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#666';
  ctx.stroke();
  
  // Add some cartoon details - rivets and panels
  ctx.fillStyle = '#555';
  // Rivets around the body
  const rivetPositions = [
    {x: -width/3, y: -10}, {x: width/3, y: -10},
    {x: -width/3, y: 0}, {x: width/3, y: 0},
    {x: -width/3, y: 10}, {x: width/3, y: 10}
  ];
  
  rivetPositions.forEach(rivet => {
    ctx.beginPath();
    ctx.arc(x + rivet.x, y + rivet.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // Cartoon-style highlight for that shiny look
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x - width/4, y - halfHeight/2, width/6, halfHeight/3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== DATABASE =====

async function saveRocketTimeToDatabase(rocket) {
  if (rocket.totalTime < 1000) return; // Don't save less than 1 second
  
  const hours = rocket.totalTime / (1000 * 60 * 60);
  const category = rocket.category || 'work';
  
  try {
    const timeLog = {
      taskId: parseInt(rocket.taskId),
      hours: hours,
      dateLogged: new Date().toISOString().split('T')[0],
      description: `Spaceport Mission: ${rocket.taskTitle}`,
      category: category,
      loggedAt: new Date().toISOString()
    };
    
    const success = await saveTimeLog(timeLog);
    if (success) {
      console.log(`💾 Mission Complete: ${hours.toFixed(2)} hours for ${rocket.taskTitle}`);
      showToast(`🚀 Mission Complete: ${hours.toFixed(2)}h logged`, 'success');
    }
    // Note: If save fails, service layer shows validation error, so no need for generic error toast
  } catch (error) {
    console.error('Error saving rocket mission time:', error);
    showToast('Failed to save mission time', 'error');
  }
}
