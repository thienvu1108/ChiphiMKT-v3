/** Canonical app-owner email (super-admin bypass). Keep in sync with firestore.rules `isAppOwner()`. */
export const APP_OWNER_EMAIL = 'thienvu1108@gmail.com';

export function isAppOwnerEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === APP_OWNER_EMAIL;
}
