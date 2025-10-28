/**
 * velocity-service.mjs
 * Personal Velocity Calibration System
 * 
 * Calculates personal velocity from completed tasks and predicts hours
 * based on scale estimates. Implements the self-learning estimation system.
 * 
 * Dependencies: task-service, timelog-service
 */

import { getTasks } from './task-service.mjs';
import { getTimeLogs } from './timelog-service.mjs';

/**
 * Calculate personal velocity from completed tasks
 * Velocity = Total Actual Hours / Total Expected Scale Points
 * 
 * @returns {Promise<Object|null>} Velocity data or null if insufficient data
 */
export async function calculatePersonalVelocity() {
  try {
    const allTasks = await getTasks({}, true); // Get all tasks including completed
    
    // Filter to completed tasks with estimation data
    const completedTasks = allTasks.filter(task => 
      task.status === 'Completed' && 
      task.estimationData?.scale?.expected &&
      task.estimationData.scale.expected > 0
    );
    
    if (completedTasks.length === 0) {
      return null;
    }
    
    let totalScalePoints = 0;
    let totalActualHours = 0;
    let tasksWithHours = 0;
    
    // Calculate total scale points and actual hours
    for (const task of completedTasks) {
      // Get actual hours from time logs
      const timeLogs = await getTimeLogs(task.id);
      const actualHours = timeLogs.reduce((sum, log) => sum + log.hours, 0);
      
      if (actualHours > 0) {
        totalScalePoints += task.estimationData.scale.expected;
        totalActualHours += actualHours;
        tasksWithHours++;
      }
    }
    
    if (totalScalePoints === 0 || tasksWithHours === 0) {
      return null;
    }
    
    const velocity = totalActualHours / totalScalePoints;
    
    return {
      velocity: velocity,
      sampleSize: tasksWithHours,
      totalHours: totalActualHours,
      totalPoints: totalScalePoints,
      averageHoursPerPoint: velocity
    };
  } catch (err) {
    console.error('Error calculating personal velocity:', err);
    return null;
  }
}

/**
 * Predict hours for a task based on estimation data and personal velocity
 * 
 * @param {Object} estimationData - Estimation data with scale and confidence
 * @returns {Promise<Object>} Prediction object with low/expected/high hours
 */
export async function predictTaskHours(estimationData) {
  if (!estimationData?.scale) {
    return {
      canPredict: false,
      message: 'No estimation data provided'
    };
  }
  
  const velocityData = await calculatePersonalVelocity();
  
  if (!velocityData) {
    return {
      canPredict: false,
      message: 'Complete more tasks with estimation data to enable predictions'
    };
  }
  
  const { low, expected, high } = estimationData.scale;
  const velocity = velocityData.velocity;
  
  return {
    canPredict: true,
    low: low * velocity,
    expected: expected * velocity,
    high: high * velocity,
    velocity: velocity,
    sampleSize: velocityData.sampleSize,
    confidence: estimationData.confidence || 100
  };
}

/**
 * Get confidence level hint text based on percentage
 * 
 * @param {number} confidence - Confidence percentage (0-100)
 * @returns {string} Hint text
 */
export function getConfidenceHint(confidence) {
  if (confidence >= 90) return "Very confident - I've done this before";
  if (confidence >= 70) return "Confident - Similar work completed";
  if (confidence >= 50) return "Reasonable guess - Some unknowns";
  if (confidence >= 30) return "Uncertain - Many unknowns";
  return "Total guess - Could be way off";
}

/**
 * Get scale interpretation hint based on value
 * 
 * @param {number} scale - Scale value (1-10)
 * @returns {string} Hint text
 */
export function getScaleHint(scale) {
  if (scale <= 2) return "Trivial tasks, quick fixes";
  if (scale <= 4) return "Small features, well-understood work";
  if (scale <= 6) return "Medium complexity, some unknowns";
  if (scale <= 8) return "Complex work, multiple components";
  return "Major features, significant complexity";
}

/**
 * Validate scale values (Low <= Expected <= High)
 * 
 * @param {number} low - Low estimate
 * @param {number} expected - Expected estimate
 * @param {number} high - High estimate
 * @returns {Object} Validation result with isValid and message
 */
export function validateScaleEstimates(low, expected, high) {
  if (low > expected) {
    return {
      isValid: false,
      message: 'Low estimate cannot be greater than Expected'
    };
  }
  
  if (expected > high) {
    return {
      isValid: false,
      message: 'Expected estimate cannot be greater than High'
    };
  }
  
  if (low < 1 || low > 10 || expected < 1 || expected > 10 || high < 1 || high > 10) {
    return {
      isValid: false,
      message: 'All estimates must be between 1 and 10'
    };
  }
  
  return {
    isValid: true,
    message: 'Valid scale estimates'
  };
}
