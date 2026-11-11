/**
 * Storage cleanup utility to prevent QuotaExceededError on window.localStorage.
 * Purges large bloated collections and non-essential caches.
 */

export function cleanupStorageQuota(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Identify all keys that store raw collections or large cached data
      if (
        key.startsWith('firestore_local_db_') ||
        key.startsWith('mayhomes_cache_') ||
        key.startsWith('temp_') ||
        key.startsWith('backup_')
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    if (keysToRemove.length > 0) {
      console.warn(`[StorageCleanup] Purged ${keysToRemove.length} bloated cache keys from localStorage.`);
    }
  } catch (e) {
    console.error('[StorageCleanup] Error cleaning localStorage:', e);
  }
}

/**
 * Emergency purge if quota is still exhausted.
 * Keeps only critical user preferences and removes any other non-essential data.
 */
export function emergencyStoragePurge(): void {
  if (typeof window === 'undefined') return;
  try {
    cleanupStorageQuota();
    const preservedPrefixes = ['mayhomes_selected_block_id', 'mayhomes_active_team_mgmt_id', 'mayhomes_guide_fb_custom_note'];
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!preservedPrefixes.includes(key) && !key.startsWith('firebase:authUser')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

// Run cleanup immediately upon module load
if (typeof window !== 'undefined') {
  cleanupStorageQuota();
}
