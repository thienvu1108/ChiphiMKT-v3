// Default GitHub repository + Vercel project for the v2 web (chiphimkt-v2).
// These are only *defaults*: an admin can still override repo/branch/vercelUrl
// in Settings → "Sao lưu & Đồng bộ dữ liệu sang GitHub", which is stored in
// Firestore doc `settings/github_backup` (DB `chiphi-mkt`).
// NEVER put tokens here.

export const V2_GITHUB_OWNER = 'thienvu1108';
export const V2_GITHUB_REPO = 'ChiphiMKT-v2';
export const V2_GITHUB_BRANCH = 'main';
export const V2_GITHUB_REPO_URL = `https://github.com/${V2_GITHUB_OWNER}/${V2_GITHUB_REPO}`;

export const V2_VERCEL_PROJECT = 'chiphimkt-v2';
// Production domain of Vercel project chiphimkt-v2 (also reachable at chiphimkt-v2.vercel.app).
export const V2_VERCEL_URL = 'https://chiphi.mayhomes.net';

// Repos the old web(s) used to point at. If the stored Firestore config still
// references one of these, the v2 web falls back to the new defaults above
// (until an admin re-saves the config in the UI).
const LEGACY_REPOS = ['thienvu1108/realestate', 'thienvu1108/chiphimkt'];

export function normalizeRepoSlug(input: string | undefined | null): string {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .slice(0, 2)
    .join('/')
    .toLowerCase();
}

export function isLegacyRepo(input: string | undefined | null): boolean {
  const slug = normalizeRepoSlug(input);
  return !!slug && LEGACY_REPOS.includes(slug);
}

// Old Vercel/production URLs that should not be used as the v2 web link.
// (chiphi.mayhomes.net is NOT legacy any more: since the 2026-10-06 cutover it is the v2 domain.)
const LEGACY_WEB_HOSTS = ['realestate', 'chiphimkt.vercel.app'];

export function isLegacyVercelUrl(input: string | undefined | null): boolean {
  const v = String(input || '').trim().toLowerCase();
  if (!v) return false;
  if (v.includes('chiphimkt-v2')) return false;
  return LEGACY_WEB_HOSTS.some((h) => v.includes(h));
}
