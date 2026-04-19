let lastTimestamp = 0;
let counter = 0;

/**
 * Generate a unique timestamp that avoids collisions
 * Uses Date.now() + counter for same-millisecond timestamps
 */
export function generateUniqueTimestamp(): number {
  const now = Date.now();
  
  if (now === lastTimestamp) {
    // Same millisecond as last call, increment counter
    counter++;
    return now + counter;
  } else {
    // New millisecond, reset counter
    lastTimestamp = now;
    counter = 0;
    return now;
  }
}

/**
 * Get current timestamp (alias for Date.now() for consistency)
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}
