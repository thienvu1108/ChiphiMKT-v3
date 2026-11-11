import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import session from 'express-session';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { handleBackupRequest, type BackupContext } from './api/backup/github/[action].js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Local-only: commit & push the current working tree (old "Đẩy Code & Deploy Vercel").
async function legacyGitSyncCode(ctx: BackupContext) {
  const { token, owner, repo, branch } = ctx;
  const commitMsg = (typeof ctx.body.commitMessage === 'string' && ctx.body.commitMessage.trim())
    || `feat: Đồng bộ toàn bộ mã nguồn ứng dụng Mayhomes - ${new Date().toLocaleString('vi-VN')}`;
  const remoteUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

  try {
    await execAsync(`git config --global --add safe.directory "*"`);
  } catch (safeErr: any) {
    console.warn('Set safe.directory warning:', safeErr?.message || safeErr);
  }
  try {
    await execAsync(`git rev-parse --is-inside-work-tree`);
  } catch {
    await execAsync(`git init`);
  }
  await execAsync(`git config user.name "thienvu1108"`);
  await execAsync(`git config user.email "thienvu1108@gmail.com"`);
  await execAsync(`git config http.postBuffer 524288000`);
  await execAsync(`git config pull.rebase false`);
  await execAsync(`git remote set-url origin "${remoteUrl}" || git remote add origin "${remoteUrl}"`);

  let hasRemoteBranch = false;
  try {
    await execAsync(`git fetch origin ${branch} --depth=1`);
    hasRemoteBranch = true;
  } catch (fetchErr: any) {
    console.warn(`[Sync-Code] Could not fetch remote branch ${branch}:`, String(fetchErr?.message || fetchErr).split(token).join('***'));
  }
  if (hasRemoteBranch) {
    try {
      await execAsync(`git branch -M ${branch}`);
      await execAsync(`git reset origin/${branch}`);
    } catch (resetErr: any) {
      console.warn('[Sync-Code] Reset to origin error:', resetErr?.message || resetErr);
    }
  } else {
    try {
      await execAsync(`git checkout -B ${branch}`);
    } catch (bErr: any) {
      console.warn('[Sync-Code] Branch checkout error:', bErr?.message || bErr);
    }
  }

  await execAsync(`git add -A`);
  const { stdout: statusOut } = await execAsync(`git status --porcelain`);
  if (!statusOut.trim()) {
    let cleanSha = 'up-to-date';
    try {
      cleanSha = (await execAsync(`git rev-parse HEAD`)).stdout.trim();
    } catch { /* ignore */ }
    return {
      success: true,
      alreadyUpToDate: true,
      commitSha: cleanSha,
      commitShortSha: cleanSha.substring(0, 7),
      commitUrl: `https://github.com/${owner}/${repo}/commit/${cleanSha}`,
      repoUrl: `https://github.com/${owner}/${repo}`,
      branch,
      message: 'Mã nguồn hiện tại đã trùng khớp 100% với commit mới nhất trên GitHub, không có thay đổi cục bộ nào cần đẩy thêm.'
    };
  }

  await execFileAsync('git', ['commit', '-m', commitMsg]);
  // No force-push fallback: a rejected push must not overwrite remote history.
  await execAsync(`git push origin ${branch}`);
  const cleanSha = (await execAsync(`git rev-parse HEAD`)).stdout.trim();
  return {
    success: true,
    commitSha: cleanSha,
    commitShortSha: cleanSha.substring(0, 7),
    commitUrl: `https://github.com/${owner}/${repo}/commit/${cleanSha}`,
    repoUrl: `https://github.com/${owner}/${repo}`,
    branch,
    message: 'Đồng bộ toàn bộ mã nguồn lên GitHub thành công! Vercel sẽ tự động kích hoạt tiến trình build & deploy phiên bản mới.',
    syncedAt: new Date().toISOString()
  };
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(session({
    secret: process.env.SESSION_SECRET || 'mayhomes-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: true, 
      sameSite: 'none',
      maxAge: 3600000 // 1 hour
    }
  }));

  // v-next: đã gỡ OAuth Google Sheets và endpoint sao lưu sang Sheet.

  // GitHub Backup & Sync API — same handler as the Vercel function in
  // api/backup/github/[action].ts (Firebase ID token + admin role required,
  // GitHub token read server-side from settings_private/github_backup).
  // Locally, "sync-code" keeps the old behaviour: commit & push this working tree.
  app.post('/api/backup/github/:action', (req, res) =>
    handleBackupRequest(req, res, { localSyncCode: legacyGitSyncCode })
  );

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
