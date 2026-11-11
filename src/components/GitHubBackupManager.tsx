import React, { useState, useEffect } from 'react';
import { 
  Github, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  FolderGit2, 
  KeyRound, 
  Eye, 
  EyeOff, 
  Save, 
  UploadCloud, 
  Download, 
  FileJson, 
  Copy, 
  Check, 
  Clock, 
  Database,
  GitCommit,
  ShieldCheck,
  Info,
  Rocket,
  Globe
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc, setDoc } from '../firestore-proxy';
import { deleteField } from 'firebase/firestore';
import { auth } from '../firebase';
import {
  V2_GITHUB_OWNER,
  V2_GITHUB_REPO,
  V2_GITHUB_BRANCH,
  V2_GITHUB_REPO_URL,
  V2_VERCEL_PROJECT,
  V2_VERCEL_URL,
  isLegacyRepo,
  isLegacyVercelUrl
} from '../lib/v2RepoConfig';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface GitHubBackupManagerProps {
  db: any;
  user: any;
  userProfile: any;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  allDataSources: {
    projects: any[];
    teams: any[];
    blocks: any[];
    blockBudgets: any[];
    reciprocalBudgets: any[];
    budgets: any[];
    costs: any[];
    acceptances: any[];
    finalAcceptances?: any[];
    efficiencyReports?: any[];
    docProcessing?: any[];
    auditLogs?: any[];
    allUsers: any[];
    rolePermissionsList?: any[];
    systemSettings?: any;
    supportRequests?: any[];
  };
}

export function GitHubBackupManager({
  db,
  user,
  userProfile,
  isAdmin,
  isSuperAdmin,
  allDataSources
}: GitHubBackupManagerProps) {
  // Config state
  const [token, setToken] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [repoUrl, setRepoUrl] = useState<string>(V2_GITHUB_REPO_URL);
  const [vercelUrl, setVercelUrl] = useState<string>(V2_VERCEL_URL);
  // GitHub token is stored ONLY in settings_private/github_backup (admin-only by
  // Firestore rules). settings/github_backup keeps non-secret config.
  const [savedTokenOnServer, setSavedTokenOnServer] = useState<boolean>(false);
  // true when an old token is still in the public doc (migrated on next admin save)
  const [legacyTokenInPublicDoc, setLegacyTokenInPublicDoc] = useState<boolean>(false);
  // true when Firestore settings/github_backup still points at the old repo/web
  const [legacyConfigDetected, setLegacyConfigDetected] = useState<boolean>(false);
  const [targetFolder, setTargetFolder] = useState<string>('backups');
  const [branch, setBranch] = useState<string>(V2_GITHUB_BRANCH);
  const [autoTimestampFolder, setAutoTimestampFolder] = useState<boolean>(false);

  // Status state
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; repo?: any } | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [copiedSha, setCopiedSha] = useState<boolean>(false);

  // Code Sync & Vercel Deploy state
  const [isSyncingCode, setIsSyncingCode] = useState<boolean>(false);
  const [codeSyncResult, setCodeSyncResult] = useState<{
    commitSha: string;
    commitShortSha: string;
    commitUrl: string;
    repoUrl: string;
    message: string;
    syncedAt: string;
  } | null>(null);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [isLoadingDeployments, setIsLoadingDeployments] = useState<boolean>(false);

  // Last sync info
  const [lastSyncResult, setLastSyncResult] = useState<{
    commitSha: string;
    commitShortSha: string;
    commitUrl: string;
    folderUrl: string;
    filesCount: number;
    totalRecords: number;
    syncedAt: string;
    summary: Record<string, number>;
  } | null>(null);

  // Parse owner and repo from URL or string
  const getOwnerAndRepo = () => {
    let clean = repoUrl.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
    return { owner: V2_GITHUB_OWNER, repo: V2_GITHUB_REPO };
  };

  // Load saved configuration from Firestore
  useEffect(() => {
    const loadConfig = async () => {
      try {
        if (!db) return;
        const canManage = isAdmin || isSuperAdmin;
        let privateToken = '';
        if (canManage) {
          try {
            const privSnap = await getDoc(doc(db, 'settings_private', 'github_backup'));
            if (privSnap.exists()) privateToken = String(privSnap.data()?.token || '');
          } catch (privErr) {
            console.warn('Cannot read private GitHub token (admin only):', privErr);
          }
        }
        if (privateToken) {
          setToken(privateToken);
          setSavedTokenOnServer(true);
        }
        const configDocRef = doc(db, 'settings', 'github_backup');
        const snap = await getDoc(configDocRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.token) {
            // Legacy location: only admins can still read it (rules). Use it until
            // the admin saves, which moves it to settings_private/github_backup.
            setLegacyTokenInPublicDoc(true);
            if (!privateToken) {
              setToken(data.token);
              setSavedTokenOnServer(true);
            }
          }
          // v2 web: if the stored config still targets the old repo, keep the
          // new v2 defaults (repo ChiphiMKT-v2 / main) instead. Admin re-saving
          // the config in the UI will persist the new values.
          const legacyRepo = !!data.repoUrl && isLegacyRepo(data.repoUrl);
          const legacyVercel = !!data.vercelUrl && isLegacyVercelUrl(data.vercelUrl);
          if (data.repoUrl && !legacyRepo) setRepoUrl(data.repoUrl);
          if (data.targetFolder) setTargetFolder(data.targetFolder);
          if (data.branch && !legacyRepo) setBranch(data.branch);
          if (data.vercelUrl && !legacyVercel) setVercelUrl(data.vercelUrl);
          setLegacyConfigDetected(legacyRepo || legacyVercel);
          if (typeof data.autoTimestampFolder === 'boolean') setAutoTimestampFolder(data.autoTimestampFolder);
          if (data.lastSyncResult) setLastSyncResult(data.lastSyncResult);
        }
      } catch (err) {
        console.error('Error loading github backup config:', err);
      }
    };
    loadConfig();
  }, [db, isAdmin, isSuperAdmin]);

  // Call the backup API with the caller's Firebase ID token (server checks admin role
  // and reads the GitHub token itself — the token is never sent from here, except
  // when testing a newly typed token before saving).
  const callBackupApi = async (action: string, payload: Record<string, any>) => {
    const currentUser = (user && typeof user.getIdToken === 'function') ? user : auth.currentUser;
    if (!currentUser) throw new Error('Bạn cần đăng nhập lại để dùng chức năng này.');
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/backup/github/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok || data?.success === false) {
      const fallback = res.status === 401
        ? 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.'
        : res.status === 403
          ? 'Chỉ Quản trị viên mới dùng được chức năng này.'
          : `Lỗi máy chủ (HTTP ${res.status})`;
      throw new Error(data?.error || fallback);
    }
    return data;
  };

  // Save config to Firestore
  const handleSaveConfig = async () => {
    if (!isAdmin && !isSuperAdmin) {
      toast.error('Chỉ Quản trị viên mới có quyền lưu cấu hình GitHub!');
      return;
    }
    setIsSavingConfig(true);
    try {
      const trimmedToken = token.trim();
      if (trimmedToken) {
        // 1) Secret → admin-only doc
        await setDoc(doc(db, 'settings_private', 'github_backup'), {
          token: trimmedToken,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || userProfile?.fullName || 'Admin'
        }, { merge: true });
      }
      // 2) Non-secret config → public doc; remove any legacy plaintext token.
      const configDocRef = doc(db, 'settings', 'github_backup');
      await setDoc(configDocRef, {
        token: deleteField(),
        repoUrl: repoUrl.trim(),
        targetFolder: targetFolder.trim() || 'backups',
        branch: branch.trim() || V2_GITHUB_BRANCH,
        vercelUrl: vercelUrl.trim() || V2_VERCEL_URL,
        vercelProject: V2_VERCEL_PROJECT,
        autoTimestampFolder,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || userProfile?.fullName || 'Admin'
      }, { merge: true });
      setLegacyConfigDetected(isLegacyRepo(repoUrl) || isLegacyVercelUrl(vercelUrl));
      setLegacyTokenInPublicDoc(false);
      if (trimmedToken) setSavedTokenOnServer(true);
      toast.success('Đã lưu cấu hình GitHub Backup thành công! Token được lưu ở vùng chỉ Quản trị viên đọc được.');
    } catch (err: any) {
      console.error('Save config error:', err);
      toast.error('Lỗi khi lưu cấu hình: ' + (err.message || String(err)));
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    if (!token.trim() && !savedTokenOnServer) {
      toast.error('Vui lòng nhập GitHub Personal Access Token trước khi kiểm tra!');
      return;
    }
    setIsTesting(true);
    setTestResult(null);

    const { owner, repo } = getOwnerAndRepo();

    try {
      const data = await callBackupApi('test', {
        // Only used to validate a newly typed (possibly unsaved) token.
        token: token.trim() || undefined,
        owner,
        repo,
        branch: branch.trim() || 'main'
      });

      setTestResult({
        success: true,
        message: `Kết nối thành công tới repository '${data.repo.fullName}'. Nhánh mặc định: '${data.repo.defaultBranch}'.`,
        repo: data.repo
      });
      toast.success(`Đã kết nối thành công tới GitHub repo: ${data.repo.fullName}`);
    } catch (err: any) {
      console.error('Test connection error:', err);
      setTestResult({
        success: false,
        message: err.message || 'Lỗi kiểm tra kết nối'
      });
      toast.error(err.message || 'Không thể kết nối tới GitHub repository');
    } finally {
      setIsTesting(false);
    }
  };

  // Format collections bundle
  const prepareCollectionsPayload = () => {
    const cleanUsers = (allDataSources.allUsers || []).map(u => ({
      id: u.id || u.uid,
      uid: u.uid || u.id,
      email: u.email,
      fullName: u.fullName || u.displayName,
      role: u.role,
      teamName: u.teamName,
      assignedBlock: u.assignedBlock,
      assignedBlocks: u.assignedBlocks,
      assignedProjects: u.assignedProjects
    }));

    return {
      reciprocal_budgets: allDataSources.reciprocalBudgets || [],
      block_budgets: allDataSources.blockBudgets || [],
      blocks: allDataSources.blocks || [],
      teams: allDataSources.teams || [],
      projects: allDataSources.projects || [],
      budgets: allDataSources.budgets || [],
      costs: allDataSources.costs || [],
      acceptances: allDataSources.acceptances || [],
      finalAcceptances: allDataSources.finalAcceptances || [],
      efficiencyReports: allDataSources.efficiencyReports || [],
      docProcessing: allDataSources.docProcessing || [],
      auditLogs: (allDataSources.auditLogs || []).slice(0, 500),
      supportRequests: allDataSources.supportRequests || [],
      users: cleanUsers,
      rolePermissions: allDataSources.rolePermissionsList || [],
      systemSettings: allDataSources.systemSettings || {}
    };
  };

  // Sync to GitHub
  const handleSyncToGitHub = async () => {
    if (!isAdmin && !isSuperAdmin) {
      toast.error('Chỉ Quản trị viên mới có quyền sao lưu đồng bộ dữ liệu!');
      return;
    }

    const { owner, repo } = getOwnerAndRepo();
    setIsSyncing(true);

    try {
      // Determine folder path
      let effectiveFolder = targetFolder.trim() || 'backups';
      if (autoTimestampFolder) {
        const dateStr = new Date().toISOString().slice(0, 10);
        effectiveFolder = `${effectiveFolder}/${dateStr}`;
      }

      toast.info('Máy chủ đang đọc dữ liệu Firestore và đồng bộ sang GitHub...');

      // Server reads Firestore itself (no large payload from the browser).
      const data = await callBackupApi('sync', {
        owner,
        repo,
        branch: branch.trim() || 'main',
        folderPath: effectiveFolder,
        commitMessage: `Backup dữ liệu Mayhomes Realestate - ${new Date().toLocaleString('vi-VN')} (${user?.email || 'admin'})`
      });

      const resultObj = {
        commitSha: data.commitSha,
        commitShortSha: data.commitShortSha || data.commitSha.slice(0, 7),
        commitUrl: data.commitUrl,
        folderUrl: data.folderUrl,
        filesCount: data.filesCount,
        totalRecords: data.totalRecords,
        syncedAt: data.syncedAt,
        summary: data.summary || {}
      };

      setLastSyncResult(resultObj);

      // Save to Firestore
      try {
        const configDocRef = doc(db, 'settings', 'github_backup');
        await setDoc(configDocRef, {
          lastSyncResult: resultObj,
          lastSyncAt: new Date().toISOString(),
          lastSyncBy: user?.email || 'admin'
        }, { merge: true });
      } catch (saveErr) {
        console.warn('Could not save sync history to settings:', saveErr);
      }

      toast.success(`Đã sao lưu thành công ${data.totalRecords} bản ghi lên GitHub! Commit: ${resultObj.commitShortSha}`);
    } catch (err: any) {
      console.error('GitHub sync error:', err);
      toast.error(err.message || 'Lỗi đồng bộ dữ liệu sang GitHub');
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch Vercel Deployments from GitHub
  const fetchDeployments = async () => {
    try {
      setIsLoadingDeployments(true);
      const data = await callBackupApi('deploy-status', { owner, repo });
      if (data.deployments) {
        setDeployments(data.deployments);
      }
    } catch (err: any) {
      console.error('Fetch deployments error:', err);
      toast.error(err?.message || 'Không lấy được trạng thái deploy');
    } finally {
      setIsLoadingDeployments(false);
    }
  };

  // Sync Whole Source Code to GitHub & Trigger Vercel Deploy
  const handleSyncCodeToGitHub = async () => {
    if (!isAdmin && !isSuperAdmin) {
      toast.error('Chỉ Quản trị viên mới có quyền triển khai!');
      return;
    }
    setIsSyncingCode(true);
    toast.info('Đang kiểm tra mã nguồn trên GitHub và yêu cầu Vercel deploy...');
    try {
      // On Vercel: triggers the Vercel Deploy Hook (if configured) and reports the
      // latest commit. On the local Express server: commits & pushes the working tree.
      const data = await callBackupApi('sync-code', {
        owner,
        repo,
        branch: branch.trim() || 'main',
        commitMessage: `feat: Cập nhật mã nguồn [deploy vercel] - ${new Date().toLocaleString('vi-VN')}`
      });

      const syncObj = {
        commitSha: data.commitSha,
        commitShortSha: data.commitShortSha || data.commitSha?.slice(0, 7),
        commitUrl: data.commitUrl,
        repoUrl: data.repoUrl,
        message: data.message,
        syncedAt: data.syncedAt || new Date().toISOString()
      };
      setCodeSyncResult(syncObj);

      if (data.deployTriggered) {
        toast.success(data.message || `Đã yêu cầu Vercel deploy lại từ commit ${syncObj.commitShortSha}.`);
      } else if (data.alreadyUpToDate) {
        toast.info(data.message || 'Mã nguồn đã đồng bộ hoàn toàn với GitHub!', { duration: 10000 });
      } else {
        toast.success(`Đã đẩy mã nguồn lên GitHub thành công! Commit: ${syncObj.commitShortSha}. Vercel đang tự động build và deploy.`);
      }

      // Auto-refresh deployment status after 6s
      setTimeout(() => {
        fetchDeployments();
      }, 6000);
    } catch (err: any) {
      console.error('Code sync error:', err);
      toast.error(err.message || 'Lỗi đồng bộ mã nguồn');
    } finally {
      setIsSyncingCode(false);
    }
  };

  // Download Offline Backup JSON
  const handleDownloadOfflineJSON = () => {
    try {
      const collections = prepareCollectionsPayload();
      const payload = {
        metadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: user?.email || 'admin',
          system: 'Mayhomes Realestate Management'
        },
        data: collections
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Mayhomes_Backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast.success('Đã tải xuống file JSON sao lưu hệ thống thành công!');
    } catch (err: any) {
      toast.error('Lỗi khi tải file JSON: ' + err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSha(true);
    toast.success('Đã sao chép vào clipboard!');
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const { owner, repo } = getOwnerAndRepo();

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm overflow-hidden bg-[var(--mh-surface)]">
        <div className="h-1.5 bg-gradient-to-r from-slate-900 via-indigo-600 to-purple-600 w-full" />
        <CardHeader className="pb-4 border-b border-[var(--mh-border)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-md shadow-slate-200">
                <Github className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-black text-[var(--mh-text)] tracking-tight flex items-center gap-2">
                  Sao lưu & Đồng bộ dữ liệu sang GitHub
                </CardTitle>
                <CardDescription className="text-xs font-medium text-[var(--mh-text-2)] mt-0.5">
                  Tự động đồng bộ toàn bộ bảng biểu, ngân sách, chi phí, tài khoản sang repository GitHub bảo đảm an toàn dữ liệu
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadOfflineJSON}
                className="rounded-xl border-[var(--mh-border)] text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] font-bold text-xs h-9"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-[var(--mh-text-2)]" /> Tải file JSON offline
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Target Repo Highlight Banner */}
          <div className="p-4 bg-[var(--mh-surface-2)] border border-[var(--mh-border)]/80 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <FolderGit2 className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-[var(--mh-text)]">
                  Kho lưu trữ mục tiêu: <span className="font-black text-indigo-700 font-mono text-sm">{owner}/{repo}</span>
                </p>
                <p className="text-[11px] text-[var(--mh-text-2)] font-medium mt-0.5">
                  Đường dẫn trực tiếp: <a href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer" className="text-indigo-600 underline font-semibold inline-flex items-center gap-1 hover:text-indigo-800">
                    https://github.com/{owner}/{repo} <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
                <p className="text-[11px] text-[var(--mh-text-2)] font-medium mt-0.5">
                  Web Vercel: <a href={vercelUrl || V2_VERCEL_URL} target="_blank" rel="noreferrer" className="text-indigo-600 underline font-semibold inline-flex items-center gap-1 hover:text-indigo-800">
                    {vercelUrl || V2_VERCEL_URL} <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="ml-1 text-[var(--mh-text-3)]">(project {V2_VERCEL_PROJECT})</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-[var(--mh-surface)] border-[var(--mh-border)] text-[var(--mh-text)] font-bold px-3 py-1">
                Nhánh: <span className="text-indigo-600 ml-1 font-mono">{branch || 'main'}</span>
              </Badge>
              <Badge variant="outline" className="bg-[var(--mh-surface)] border-[var(--mh-border)] text-[var(--mh-text)] font-bold px-3 py-1">
                Thư mục: <span className="text-amber-600 ml-1 font-mono">{targetFolder || 'backups'}</span>
              </Badge>
            </div>
          </div>

          {legacyConfigDetected && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-[11px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Cấu hình đã lưu trước đây đang trỏ tới repository/web cũ. Web v2 đang tạm dùng mặc định mới
                (<strong>{V2_GITHUB_OWNER}/{V2_GITHUB_REPO}</strong>, nhánh <strong>{V2_GITHUB_BRANCH}</strong>, web <strong>{V2_VERCEL_URL}</strong>).
                Bấm <strong>Lưu cấu hình</strong> để lưu hẳn giá trị mới.
              </span>
            </div>
          )}

          {/* Form Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Token and Auth */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[var(--mh-text)] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    GitHub Personal Access Token (PAT) <span className="text-rose-500">*</span>
                  </span>
                  <a 
                    href="https://github.com/settings/tokens/new?scopes=repo" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-indigo-600 hover:underline font-bold flex items-center gap-1"
                  >
                    Tạo Token mới trên GitHub <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </Label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx hoặc github_pat_..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="pr-10 font-mono text-xs rounded-xl bg-[var(--mh-surface-2)] border-[var(--mh-border)] focus:bg-[var(--mh-surface)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mh-text-3)] hover:text-[var(--mh-text-2)]"
                    title={showToken ? 'Ẩn token' : 'Hiện token'}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--mh-text-2)] leading-relaxed">
                  Token cần có quyền <strong>repo</strong> (đầy đủ quyền đọc/ghi repository) để có thể đẩy commit sao lưu dữ liệu.
                  Token chỉ được lưu ở vùng <strong>chỉ Quản trị viên</strong> đọc được và chỉ máy chủ dùng để gọi GitHub.
                </p>
                {legacyTokenInPublicDoc && (
                  <p className="text-[10px] text-amber-700 font-semibold leading-relaxed">
                    Token cũ đang nằm ở vị trí cấu hình chung. Bấm <strong>Lưu cấu hình</strong> để chuyển token sang vùng bảo mật chỉ Quản trị viên.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[var(--mh-text)]">Đường dẫn GitHub Repository</Label>
                <Input
                  type="text"
                  placeholder={V2_GITHUB_REPO_URL}
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="font-mono text-xs rounded-xl bg-[var(--mh-surface-2)] border-[var(--mh-border)] focus:bg-[var(--mh-surface)]"
                />
                <p className="text-[10px] text-[var(--mh-text-3)]">
                  Mặc định repository của web v2: <strong>{V2_GITHUB_REPO_URL}</strong> (nhánh <strong>{V2_GITHUB_BRANCH}</strong>)
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[var(--mh-text)]">Đường dẫn web Vercel</Label>
                <Input
                  type="text"
                  placeholder={V2_VERCEL_URL}
                  value={vercelUrl}
                  onChange={(e) => setVercelUrl(e.target.value)}
                  className="font-mono text-xs rounded-xl bg-[var(--mh-surface-2)] border-[var(--mh-border)] focus:bg-[var(--mh-surface)]"
                />
                <p className="text-[10px] text-[var(--mh-text-3)]">
                  Mặc định: <strong>{V2_VERCEL_URL}</strong> (Vercel project <strong>{V2_VERCEL_PROJECT}</strong>)
                </p>
              </div>
            </div>

            {/* Right: Path and Options */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[var(--mh-text)]">Thư mục trên GitHub</Label>
                  <Input
                    type="text"
                    placeholder="backups"
                    value={targetFolder}
                    onChange={(e) => setTargetFolder(e.target.value)}
                    className="font-mono text-xs rounded-xl bg-[var(--mh-surface-2)] border-[var(--mh-border)] focus:bg-[var(--mh-surface)]"
                  />
                  <p className="text-[10px] text-[var(--mh-text-3)]">Thư mục gốc lưu trữ dữ liệu</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[var(--mh-text)]">Nhánh (Branch)</Label>
                  <Input
                    type="text"
                    placeholder="main"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="font-mono text-xs rounded-xl bg-[var(--mh-surface-2)] border-[var(--mh-border)] focus:bg-[var(--mh-surface)]"
                  />
                  <p className="text-[10px] text-[var(--mh-text-3)]">Thường là main hoặc master</p>
                </div>
              </div>

              <div className="p-3 bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTimestampFolder}
                    onChange={(e) => setAutoTimestampFolder(e.target.checked)}
                    className="rounded border-[var(--mh-border-strong)] text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-[var(--mh-text)]">Tạo thư mục con theo ngày (VD: backups/2026-09-18/)</span>
                </label>
                <p className="text-[10px] text-[var(--mh-text-2)] pl-6">
                  Nếu bỏ tích, dữ liệu sẽ được cập nhật/ghi đè trực tiếp tại thư mục <code>{targetFolder || 'backups'}/</code> cố định.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isTesting || (!token && !savedTokenOnServer)}
                  className="rounded-xl text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 h-10 flex-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isTesting ? 'animate-spin' : ''}`} />
                  {isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig}
                  className="rounded-xl text-xs font-bold border-[var(--mh-border-strong)] text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] h-10 px-4"
                >
                  <Save className={`w-3.5 h-3.5 mr-1.5 ${isSavingConfig ? 'animate-spin' : ''}`} />
                  Lưu cấu hình
                </Button>
              </div>
            </div>
          </div>

          {/* Test connection result notice */}
          {testResult && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
              testResult.success 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <p className="font-bold">{testResult.success ? 'Kết nối GitHub hợp lệ!' : 'Lỗi kết nối GitHub'}</p>
                <p className="text-[11px] leading-relaxed">{testResult.message}</p>
              </div>
            </div>
          )}

          {/* Action 1: Deploy Source Code to GitHub & Vercel */}
          <div className="p-5 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl shadow-xl space-y-4 border border-indigo-700/40">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-400/30">
                    <Rocket className="w-5 h-5 text-indigo-400" />
                  </span>
                  <h4 className="text-base font-black tracking-tight text-white">
                    Đồng bộ Mã nguồn & Triển khai Vercel (Source Code Deploy)
                  </h4>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                    Tự động Deploy Vercel
                  </Badge>
                </div>
                <p className="text-xs text-[var(--mh-text-3)] font-medium leading-relaxed max-w-2xl">
                  Mã nguồn web v2 nằm trên nhánh <code className="text-amber-300 font-mono font-bold bg-[var(--mh-surface)]/10 px-1 py-0.5 rounded">{branch || 'main'}</code> của repository GitHub; Vercel tự build mỗi khi có commit mới. Nút này kiểm tra commit mới nhất và yêu cầu Vercel build lại (khi đã cấu hình Deploy Hook).
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  onClick={fetchDeployments}
                  disabled={isLoadingDeployments || !(isAdmin || isSuperAdmin)}
                  variant="outline"
                  size="sm"
                  className="bg-[var(--mh-surface)]/10 border-white/20 text-white hover:bg-[var(--mh-surface)]/20 font-bold text-xs h-11 px-4 rounded-xl"
                  title="Tải lại trạng thái Vercel Deploy"
                >
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoadingDeployments ? 'animate-spin' : ''}`} />
                  Kiểm tra Vercel
                </Button>

                <Button
                  onClick={handleSyncCodeToGitHub}
                  disabled={isSyncingCode || !(isAdmin || isSuperAdmin)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm h-11 px-6 rounded-xl shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.02]"
                >
                  <Rocket className={`w-4 h-4 mr-2 ${isSyncingCode ? 'animate-spin' : ''}`} />
                  {isSyncingCode ? 'Đang đẩy Code lên GitHub...' : 'Đẩy Code & Deploy Vercel'}
                </Button>
              </div>
            </div>

            {/* Code Sync Result Banner */}
            {codeSyncResult && (
              <div className="p-3 bg-[var(--mh-surface)]/10 border border-white/15 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{codeSyncResult.message}</span>
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-[var(--mh-text-3)] text-[11px]">Commit: <strong>{codeSyncResult.commitShortSha}</strong></span>
                  <a 
                    href={codeSyncResult.commitUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-300 hover:text-white underline font-bold"
                  >
                    Xem Commit trên GitHub <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {/* Live Vercel Deployments status */}
            {deployments.length > 0 && (
              <div className="pt-3 border-t border-white/10 space-y-2">
                <p className="text-[11px] font-bold text-indigo-200 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  Các phiên bản Deploy Vercel gần nhất từ GitHub:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {deployments.map((dep: any) => (
                    <div key={dep.id} className="p-2.5 bg-black/25 border border-white/10 rounded-xl flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-[11px] truncate max-w-[180px]">{dep.environment}</span>
                          <span className={`px-1.5 py-0.2 text-[9px] font-black rounded uppercase ${
                            dep.state === 'success' ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' :
                            dep.state === 'error' || dep.state === 'failure' ? 'bg-rose-500/30 text-rose-300' :
                            'bg-amber-500/30 text-amber-300'
                          }`}>
                            {dep.state}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--mh-text-3)] font-mono">
                          <span>SHA: {dep.shortSha}</span>
                          <span>•</span>
                          <span>{new Date(dep.createdAt).toLocaleTimeString('vi-VN')}</span>
                        </div>
                      </div>

                      {dep.targetUrl && (
                        <a 
                          href={dep.targetUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-[var(--mh-surface)]/15 hover:bg-[var(--mh-surface)]/25 text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                        >
                          Mở Web <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action 2: Sync Firestore Database Data */}
          <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-base font-black tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                Sao lưu Dữ liệu Firestore (JSON Data Backup)
              </h4>
              <p className="text-xs text-[var(--mh-text-3)] font-medium">
                Đẩy toàn bộ 15+ danh mục dữ liệu (Ngân sách đối ứng, Ngân sách khối, Chi phí, Nghiệm thu, Thành viên, ...) sang thư mục <span className="text-amber-300 font-mono font-bold">{targetFolder || 'backups'}</span> trên GitHub
              </p>
            </div>

            <Button
              onClick={handleSyncToGitHub}
              disabled={isSyncing || !(isAdmin || isSuperAdmin)}
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-black text-sm h-11 px-6 rounded-xl shadow-lg shadow-indigo-900/50 transition-all hover:scale-[1.02] shrink-0"
            >
              <UploadCloud className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Đang đẩy dữ liệu...' : 'Sao lưu Dữ liệu ngay'}
            </Button>
          </div>

          {/* Last sync result card */}
          {lastSyncResult && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-black text-emerald-900">Lần sao lưu gần nhất thành công</span>
                  <Badge className="bg-emerald-200/60 text-emerald-800 border-none text-[10px] font-bold">
                    {lastSyncResult.totalRecords} bản ghi ({lastSyncResult.filesCount} files)
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(lastSyncResult.syncedAt).toLocaleString('vi-VN')}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 bg-[var(--mh-surface)] rounded-xl border border-emerald-100 flex items-center justify-between">
                  <span className="text-[var(--mh-text-2)] font-medium text-[11px]">Commit SHA:</span>
                  <div className="flex items-center gap-1 font-mono font-bold text-[var(--mh-text)]">
                    <span>{lastSyncResult.commitShortSha}</span>
                    <button 
                      onClick={() => copyToClipboard(lastSyncResult.commitSha)}
                      className="p-1 hover:bg-[var(--mh-surface-2)] rounded text-[var(--mh-text-3)] hover:text-[var(--mh-text)]"
                      title="Copy full SHA"
                    >
                      {copiedSha ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <a 
                  href={lastSyncResult.commitUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-2.5 bg-[var(--mh-surface)] rounded-xl border border-emerald-100 flex items-center justify-between hover:bg-[var(--mh-surface-2)] text-indigo-600 font-bold transition-colors"
                >
                  <span className="flex items-center gap-1 text-[11px]"><GitCommit className="w-3.5 h-3.5" /> Xem Commit</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                </a>

                <a 
                  href={lastSyncResult.folderUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-2.5 bg-[var(--mh-surface)] rounded-xl border border-emerald-100 flex items-center justify-between hover:bg-[var(--mh-surface-2)] text-indigo-600 font-bold transition-colors"
                >
                  <span className="flex items-center gap-1 text-[11px]"><FolderGit2 className="w-3.5 h-3.5" /> Xem thư mục trên GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                </a>
              </div>

              {/* Collections breakdown pill list */}
              {lastSyncResult.summary && Object.keys(lastSyncResult.summary).length > 0 && (
                <div className="pt-2 border-t border-emerald-200/50">
                  <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-2">Chi tiết các danh mục đã sao lưu:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(lastSyncResult.summary).map(([colName, count]) => (
                      <span key={colName} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--mh-surface)] border border-emerald-200 text-[10px] font-semibold text-[var(--mh-text)]">
                        <span className="font-mono text-indigo-600">{colName}.json</span>: 
                        <strong className="text-[var(--mh-text)]">{count}</strong>
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100/70 text-[10px] font-bold text-emerald-900">
                      manifest.json & all_database_backup.json
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Guide & Safety Notice */}
          <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--mh-text-2)] space-y-1.5 leading-relaxed font-medium">
              <p className="font-bold text-indigo-950">Quy trình đồng bộ dữ liệu GitHub an toàn:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-[var(--mh-text-2)]">
                <li>Dữ liệu được chuyển đổi dạng chuẩn JSON đẹp (indent 2 spaces), chia thành từng file tương ứng với từng bảng trong hệ thống.</li>
                <li>Mỗi lần đồng bộ sẽ tự động tạo một commit Git kèm thời gian, người thực hiện và bảng tổng kết số lượng bản ghi.</li>
                <li>Hệ thống lưu trữ thêm file <code>all_database_backup.json</code> và <code>manifest.json</code> để dễ dàng phục hồi nguyên trạng bất cứ lúc nào.</li>
                <li>Personal Access Token chỉ Quản trị viên đọc được (vùng cài đặt bảo mật riêng) và chỉ máy chủ dùng để gọi GitHub — không gửi cho tài khoản khác.</li>
                <li>Máy chủ tự đọc dữ liệu Firestore khi sao lưu và chỉ chấp nhận yêu cầu từ tài khoản Quản trị viên đã đăng nhập.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
