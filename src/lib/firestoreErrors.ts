/** Classification helpers for Firestore errors (kept pure for unit tests). */

export function firestoreErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? '');
  return String(error ?? '');
}

/**
 * True for a rules denial. Production returns code "permission-denied" / "Missing or
 * insufficient permissions"; the emulator returns the rule trace ("false for 'list' @ L9,
 * evaluation error at …").
 */
export function isPermissionDeniedError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? '').toLowerCase();
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return true;
  const msg = firestoreErrorText(error).toLowerCase();
  return (
    msg.includes('permission-denied') ||
    msg.includes('insufficient permissions') ||
    msg.includes('permission_denied') ||
    /false for '(list|get|read)' @ l\d+/.test(msg)
  );
}

/**
 * Listener reads (LIST / GET) denied by rules are expected while role permissions settle or for
 * screens a role cannot use: log quietly, never toast.
 */
export function shouldSilenceFirestoreError(error: unknown, isListenerOp: boolean): boolean {
  return isListenerOp && isPermissionDeniedError(error);
}
