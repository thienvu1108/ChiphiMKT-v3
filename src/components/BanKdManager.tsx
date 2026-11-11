import React, { useState, useMemo } from 'react';
import { 
  Building2, Plus, Edit3, Trash2, Search, Users, Phone, Mail, 
  FolderPlus, Check, X, ArrowRight, Shield, AlertCircle, Sparkles,
  Layers, MapPin, Tag, RefreshCw, UserCheck, ExternalLink, Briefcase,
  ChevronRight, PhoneCall, Copy, MoreVertical, FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch 
} from '../firestore-proxy';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface BanKdContact {
  id: string;
  name: string;
  title: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface BanKd {
  id: string;
  name: string;
  code?: string;
  description?: string;
  leaderName?: string;
  leaderPhone?: string;
  leaderEmail?: string;
  contacts?: BanKdContact[];
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
}

interface BanKdManagerProps {
  banKdList: BanKd[];
  projects: any[];
  isAdmin: boolean;
  isAccountant: boolean;
  isSuperAdmin: boolean;
  user: any;
  logAction: (action: string, entity: string, id?: string, data?: any) => Promise<void>;
  onNavigateToProjects?: () => void;
}

export const BanKdManager: React.FC<BanKdManagerProps> = ({
  banKdList,
  projects,
  isAdmin,
  isAccountant,
  isSuperAdmin,
  user,
  logAction,
  onNavigateToProjects
}) => {
  const canManage = isAdmin || isSuperAdmin || isAccountant;

  // Search and view state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBanKdForDetail, setSelectedBanKdForDetail] = useState<BanKd | null>(null);

  // Dialog states for Ban KD CRUD
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [targetBanKd, setTargetBanKd] = useState<BanKd | null>(null);

  // Form states for Ban KD
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLeaderName, setFormLeaderName] = useState('');
  const [formLeaderPhone, setFormLeaderPhone] = useState('');
  const [formLeaderEmail, setFormLeaderEmail] = useState('');

  // Dialog states for Contacts Management
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [activeBanForContacts, setActiveBanForContacts] = useState<BanKd | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactNotes, setContactNotes] = useState('');

  // Dialog states for Project Assignment
  const [isProjectAssignDialogOpen, setIsProjectAssignDialogOpen] = useState(false);
  const [activeBanForProjects, setActiveBanForProjects] = useState<BanKd | null>(null);
  const [projectAssignSearch, setProjectAssignSearch] = useState('');
  const [projectAssignFilterRegion, setProjectAssignFilterRegion] = useState<string>('all');
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [selectedProjectIdsToAssign, setSelectedProjectIdsToAssign] = useState<string[]>([]);
  const [isSavingProjectAssignment, setIsSavingProjectAssignment] = useState(false);

  // Filtered Ban KD list
  const filteredBanKdList = useMemo(() => {
    let list = [...banKdList];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(b => 
        (b.name || '').toLowerCase().includes(q) ||
        (b.code || '').toLowerCase().includes(q) ||
        (b.leaderName || '').toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q) ||
        (b.contacts || []).some(c => (c.name || '').toLowerCase().includes(q) || (c.title || '').toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  }, [banKdList, searchTerm]);

  // Map of Ban KD ID -> Projects belonging to this Ban KD
  const projectsByBanKdId = useMemo(() => {
    const map: Record<string, any[]> = {};
    banKdList.forEach(b => {
      map[b.id] = [];
    });
    projects.forEach(p => {
      if (p.banKdId && map[p.banKdId]) {
        map[p.banKdId].push(p);
      } else if (p.banKdName) {
        const found = banKdList.find(b => (b.name || '').toLowerCase().trim() === (p.banKdName || '').toLowerCase().trim());
        if (found && map[found.id]) {
          map[found.id].push(p);
        }
      }
    });
    return map;
  }, [banKdList, projects]);

  // Overall metrics
  const totalAssignedProjects = useMemo(() => {
    return projects.filter(p => !!p.banKdId || (p.banKdName && banKdList.some(b => b.name === p.banKdName))).length;
  }, [projects, banKdList]);

  const totalContacts = useMemo(() => {
    return banKdList.reduce((acc, b) => acc + (b.contacts?.length || 0), 0);
  }, [banKdList]);

  // Handle Open Add
  const handleOpenAdd = () => {
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setFormLeaderName('');
    setFormLeaderPhone('');
    setFormLeaderEmail('');
    setIsAddDialogOpen(true);
  };

  // Handle Save New Ban KD
  const handleSaveNewBanKd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Vui lòng nhập Tên Ban Kinh Doanh');
      return;
    }

    try {
      const newDoc = {
        name: formName.trim(),
        code: formCode.trim() || `BKD-${Date.now().toString().slice(-4)}`,
        description: formDescription.trim(),
        leaderName: formLeaderName.trim(),
        leaderPhone: formLeaderPhone.trim(),
        leaderEmail: formLeaderEmail.trim().toLowerCase(),
        contacts: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.email || user?.uid || 'system'
      };

      const docRef = await addDoc(collection(db, 'ban_kd'), newDoc);
      await logAction('CREATE', 'ban_kd', docRef.id, { name: formName });
      toast.success(`Đã thêm ${formName.trim()} thành công!`);
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error('Error adding Ban KD:', error);
      toast.error('Lỗi khi thêm Ban KD');
    }
  };

  // Handle Open Edit
  const handleOpenEdit = (ban: BanKd) => {
    setTargetBanKd(ban);
    setFormName(ban.name || '');
    setFormCode(ban.code || '');
    setFormDescription(ban.description || '');
    setFormLeaderName(ban.leaderName || '');
    setFormLeaderPhone(ban.leaderPhone || '');
    setFormLeaderEmail(ban.leaderEmail || '');
    setIsEditDialogOpen(true);
  };

  // Handle Save Edit Ban KD
  const handleSaveEditBanKd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBanKd || !formName.trim()) {
      toast.error('Vui lòng nhập Tên Ban Kinh Doanh');
      return;
    }

    try {
      const updatePayload: any = {
        name: formName.trim(),
        code: formCode.trim(),
        description: formDescription.trim(),
        leaderName: formLeaderName.trim(),
        leaderPhone: formLeaderPhone.trim(),
        leaderEmail: formLeaderEmail.trim().toLowerCase(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'ban_kd', targetBanKd.id), updatePayload);

      // If the name changed, optionally update all projects assigned to this Ban KD
      if (targetBanKd.name !== formName.trim()) {
        const assigned = projectsByBanKdId[targetBanKd.id] || [];
        if (assigned.length > 0) {
          const batch = writeBatch(db);
          assigned.forEach(p => {
            batch.update(doc(db, 'projects', p.id), {
              banKdName: formName.trim(),
              updatedAt: serverTimestamp()
            });
          });
          await batch.commit();
        }
      }

      await logAction('UPDATE', 'ban_kd', targetBanKd.id, updatePayload);
      toast.success(`Đã cập nhật ${formName.trim()} thành công!`);
      setIsEditDialogOpen(false);
      setTargetBanKd(null);
    } catch (error) {
      console.error('Error updating Ban KD:', error);
      toast.error('Lỗi khi cập nhật Ban KD');
    }
  };

  // Handle Delete Ban KD
  const handleConfirmDeleteBanKd = async () => {
    if (!targetBanKd) return;
    try {
      // Unassign projects first
      const assigned = projectsByBanKdId[targetBanKd.id] || [];
      if (assigned.length > 0) {
        const batch = writeBatch(db);
        assigned.forEach(p => {
          batch.update(doc(db, 'projects', p.id), {
            banKdId: '',
            banKdName: '',
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
      }

      await deleteDoc(doc(db, 'ban_kd', targetBanKd.id));
      await logAction('DELETE', 'ban_kd', targetBanKd.id, { name: targetBanKd.name });
      toast.success(`Đã xóa ${targetBanKd.name} và bỏ gán ${assigned.length} dự án liên quan`);
      setIsDeleteDialogOpen(false);
      setTargetBanKd(null);
      if (selectedBanKdForDetail?.id === targetBanKd.id) {
        setSelectedBanKdForDetail(null);
      }
    } catch (error) {
      console.error('Error deleting Ban KD:', error);
      toast.error('Lỗi khi xóa Ban KD');
    }
  };

  // ==========================================
  // PROJECT ASSIGNMENT LOGIC
  // ==========================================
  const handleOpenProjectAssignment = (ban: BanKd) => {
    setActiveBanForProjects(ban);
    setProjectAssignSearch('');
    setProjectAssignFilterRegion('all');
    setShowOnlyUnassigned(false);
    
    // Pre-check all projects currently assigned to this Ban KD
    const assigned = (projectsByBanKdId[ban.id] || []).map(p => p.id);
    setSelectedProjectIdsToAssign(assigned);
    setIsProjectAssignDialogOpen(true);
  };

  // Filter projects available in the assignment dialog
  const assignableProjects = useMemo(() => {
    let list = [...projects];
    if (projectAssignFilterRegion !== 'all') {
      list = list.filter(p => p.region === projectAssignFilterRegion);
    }
    if (showOnlyUnassigned && activeBanForProjects) {
      list = list.filter(p => !p.banKdId || p.banKdId === activeBanForProjects.id);
    }
    if (projectAssignSearch.trim()) {
      const q = projectAssignSearch.toLowerCase().trim();
      list = list.filter(p => 
        (p.name || '').toLowerCase().includes(q) ||
        (p.projectCode || '').toLowerCase().includes(q) ||
        (p.region || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  }, [projects, projectAssignFilterRegion, showOnlyUnassigned, activeBanForProjects, projectAssignSearch]);

  const handleSaveProjectAssignment = async () => {
    if (!activeBanForProjects) return;
    setIsSavingProjectAssignment(true);

    try {
      const previouslyAssigned = (projectsByBanKdId[activeBanForProjects.id] || []).map(p => p.id);
      const currentlySelected = new Set(selectedProjectIdsToAssign);

      // Projects to ADD to this Ban KD
      const toAdd = selectedProjectIdsToAssign.filter(id => !previouslyAssigned.includes(id));
      // Projects to REMOVE from this Ban KD
      const toRemove = previouslyAssigned.filter(id => !currentlySelected.has(id));

      const batch = writeBatch(db);

      toAdd.forEach(pId => {
        batch.update(doc(db, 'projects', pId), {
          banKdId: activeBanForProjects.id,
          banKdName: activeBanForProjects.name,
          updatedAt: serverTimestamp()
        });
      });

      toRemove.forEach(pId => {
        batch.update(doc(db, 'projects', pId), {
          banKdId: '',
          banKdName: '',
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();

      await logAction('ASSIGN_PROJECTS_TO_BAN_KD', 'ban_kd', activeBanForProjects.id, {
        banName: activeBanForProjects.name,
        addedCount: toAdd.length,
        removedCount: toRemove.length
      });

      toast.success(`Đã cập nhật dự án cho ${activeBanForProjects.name} (+${toAdd.length}, -${toRemove.length})`);
      setIsProjectAssignDialogOpen(false);
      setActiveBanForProjects(null);
    } catch (error) {
      console.error('Error saving project assignment:', error);
      toast.error('Lỗi khi đồng bộ dự án với Ban KD');
    } finally {
      setIsSavingProjectAssignment(false);
    }
  };

  // Quick single project removal
  const handleQuickRemoveProject = async (ban: BanKd, projectId: string, projectName: string) => {
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        banKdId: '',
        banKdName: '',
        updatedAt: serverTimestamp()
      });
      await logAction('REMOVE_PROJECT_FROM_BAN_KD', 'projects', projectId, {
        projectName,
        banName: ban.name
      });
      toast.info(`Đã gỡ dự án "${projectName}" khỏi ${ban.name}`);
    } catch (error) {
      console.error('Error removing project from Ban KD:', error);
      toast.error('Lỗi khi gỡ dự án khỏi Ban KD');
    }
  };

  // Batch auto-sync all projects with banKdName to banKdId
  const handleAutoSyncAllProjects = async () => {
    let synced = 0;
    try {
      const batch = writeBatch(db);
      projects.forEach(p => {
        if (!p.banKdId && p.banKdName) {
          const match = banKdList.find(b => b.name.toLowerCase().trim() === p.banKdName.toLowerCase().trim());
          if (match) {
            batch.update(doc(db, 'projects', p.id), {
              banKdId: match.id,
              banKdName: match.name,
              updatedAt: serverTimestamp()
            });
            synced++;
          }
        }
      });

      if (synced > 0) {
        await batch.commit();
        toast.success(`Đã tự động đồng bộ ID cho ${synced} dự án!`);
      } else {
        toast.info('Tất cả dự án đã được đồng bộ chuẩn hóa.');
      }
    } catch (error) {
      console.error('Error auto syncing projects:', error);
      toast.error('Lỗi khi đồng bộ dự án');
    }
  };

  // ==========================================
  // CONTACTS / PERSONNEL MANAGEMENT LOGIC
  // ==========================================
  const handleOpenContactsDialog = (ban: BanKd) => {
    setActiveBanForContacts(ban);
    setEditingContactId(null);
    setContactName('');
    setContactTitle('');
    setContactPhone('');
    setContactEmail('');
    setContactNotes('');
    setIsContactDialogOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBanForContacts) return;
    if (!contactName.trim() || !contactTitle.trim()) {
      toast.error('Vui lòng nhập đầy đủ Họ tên và Chức danh');
      return;
    }

    try {
      const existingContacts = [...(activeBanForContacts.contacts || [])];
      if (editingContactId) {
        // Edit existing contact
        const idx = existingContacts.findIndex(c => c.id === editingContactId);
        if (idx !== -1) {
          existingContacts[idx] = {
            id: editingContactId,
            name: contactName.trim(),
            title: contactTitle.trim(),
            phone: contactPhone.trim(),
            email: contactEmail.trim(),
            notes: contactNotes.trim()
          };
        }
      } else {
        // Add new contact
        existingContacts.push({
          id: 'ct_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          name: contactName.trim(),
          title: contactTitle.trim(),
          phone: contactPhone.trim(),
          email: contactEmail.trim(),
          notes: contactNotes.trim()
        });
      }

      await updateDoc(doc(db, 'ban_kd', activeBanForContacts.id), {
        contacts: existingContacts,
        updatedAt: serverTimestamp()
      });

      // Update local state copy so UI reflects immediately
      setActiveBanForContacts({
        ...activeBanForContacts,
        contacts: existingContacts
      });

      toast.success(editingContactId ? 'Đã cập nhật vị trí nhân sự!' : 'Đã thêm nhân sự vào Ban KD!');
      setEditingContactId(null);
      setContactName('');
      setContactTitle('');
      setContactPhone('');
      setContactEmail('');
      setContactNotes('');
    } catch (error) {
      console.error('Error saving contact:', error);
      toast.error('Lỗi khi lưu thông tin liên hệ');
    }
  };

  const handleEditContact = (c: BanKdContact) => {
    setEditingContactId(c.id);
    setContactName(c.name);
    setContactTitle(c.title);
    setContactPhone(c.phone || '');
    setContactEmail(c.email || '');
    setContactNotes(c.notes || '');
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!activeBanForContacts) return;
    try {
      const updated = (activeBanForContacts.contacts || []).filter(c => c.id !== contactId);
      await updateDoc(doc(db, 'ban_kd', activeBanForContacts.id), {
        contacts: updated,
        updatedAt: serverTimestamp()
      });
      setActiveBanForContacts({
        ...activeBanForContacts,
        contacts: updated
      });
      toast.success('Đã xóa thông tin liên hệ');
      if (editingContactId === contactId) {
        setEditingContactId(null);
        setContactName('');
        setContactTitle('');
        setContactPhone('');
        setContactEmail('');
        setContactNotes('');
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast.error('Lỗi khi xóa liên hệ');
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã sao chép ${label}: ${text}`);
  };

  // Unique regions in projects for filter
  const uniqueRegions = useMemo(() => {
    const set = new Set<string>();
    projects.forEach(p => {
      if (p.region && p.region !== 'Chưa xác định') set.add(p.region);
    });
    return Array.from(set);
  }, [projects]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Card */}
      <Card className="border-none shadow-sm overflow-hidden bg-[var(--mh-surface)]">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 w-full" />
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
                  <Briefcase className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl sm:text-2xl font-black text-[var(--mh-text)]">
                      Quản lý Ban Kinh Doanh (Ban KD)
                    </CardTitle>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded-lg text-xs">
                      {banKdList.length} Ban
                    </Badge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm font-medium text-[var(--mh-text-2)] mt-0.5">
                    Tổ chức phân cấp các Ban Kinh Doanh, đồng bộ dự án hệ thống và quản lý đầu mối liên hệ từng ban
                  </CardDescription>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-xl text-xs font-bold border-[var(--mh-border)] text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] gap-1.5"
                onClick={handleAutoSyncAllProjects}
                title="Đồng bộ tự động ID Ban KD cho tất cả dự án"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                <span>Đồng bộ Dự án</span>
              </Button>

              {onNavigateToProjects && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-xl text-xs font-bold border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 gap-1.5"
                  onClick={onNavigateToProjects}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Danh mục Dự án ({projects.length})</span>
                </Button>
              )}

              {canManage && (
                <Button
                  size="sm"
                  onClick={handleOpenAdd}
                  className="h-10 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200 gap-1.5 px-4"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Ban KD mới</span>
                </Button>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4">
            <div className="p-3.5 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 rounded-2xl border border-blue-100/70 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-blue-600 tracking-wider">Tổng số Ban KD</p>
                <p className="text-2xl font-black text-[var(--mh-text)] mt-0.5">{banKdList.length}</p>
              </div>
              <div className="w-10 h-10 bg-[var(--mh-surface)] rounded-xl shadow-xs flex items-center justify-center text-blue-600">
                <Briefcase className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 rounded-2xl border border-emerald-100/70 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Dự án đã gán vào Ban</p>
                <p className="text-2xl font-black text-[var(--mh-text)] mt-0.5">
                  {totalAssignedProjects} <span className="text-xs text-[var(--mh-text-3)] font-semibold">/ {projects.length} DA</span>
                </p>
              </div>
              <div className="w-10 h-10 bg-[var(--mh-surface)] rounded-xl shadow-xs flex items-center justify-center text-emerald-600">
                <Building2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 bg-gradient-to-br from-purple-50/80 to-pink-50/40 rounded-2xl border border-purple-100/70 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-purple-600 tracking-wider">Đầu mối nhân sự & liên hệ</p>
                <p className="text-2xl font-black text-[var(--mh-text)] mt-0.5">{totalContacts}</p>
              </div>
              <div className="w-10 h-10 bg-[var(--mh-surface)] rounded-xl shadow-xs flex items-center justify-center text-purple-600">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Filter / Search Bar */}
        <CardContent className="pt-0">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--mh-text-3)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm Ban KD theo tên, mã ban, trưởng ban, dự án hoặc chức danh nhân sự..."
              className="pl-10 h-11 bg-[var(--mh-surface-2)]/70 border-[var(--mh-border)] rounded-xl text-xs sm:text-sm focus:bg-[var(--mh-surface)] transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mh-text-3)] hover:text-[var(--mh-text-2)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main List of Ban KD */}
      {filteredBanKdList.length === 0 ? (
        <Card className="border-dashed border-2 border-[var(--mh-border)] rounded-3xl p-12 text-center bg-[var(--mh-surface)]/50">
          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Briefcase className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-[var(--mh-text)]">
            {searchTerm ? 'Không tìm thấy Ban Kinh Doanh nào phù hợp' : 'Chưa có Ban Kinh Doanh nào'}
          </h3>
          <p className="text-xs sm:text-sm text-[var(--mh-text-2)] max-w-md mx-auto mt-1 mb-5">
            {searchTerm 
              ? 'Hãy thử tìm bằng từ khóa khác hoặc xóa bộ lọc tìm kiếm.'
              : 'Hãy tạo Ban Kinh Doanh đầu tiên để phân loại và gán các dự án bất động sản trên hệ thống.'}
          </p>
          {canManage && (
            <Button
              onClick={handleOpenAdd}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-10 px-5 text-xs shadow-md shadow-blue-100"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Tạo Ban KD mới
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredBanKdList.map((ban) => {
            const assignedProjects = projectsByBanKdId[ban.id] || [];
            const contacts = ban.contacts || [];

            return (
              <Card 
                key={ban.id} 
                className="border-[var(--mh-border)]/90 shadow-sm hover:shadow-md transition-all rounded-3xl overflow-hidden bg-[var(--mh-surface)] flex flex-col justify-between"
              >
                <div>
                  {/* Top Header */}
                  <div className="p-5 border-b border-[var(--mh-border)] flex items-start justify-between gap-3 bg-[var(--mh-surface-2)]/50">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-blue-600 text-white font-black text-[10px] tracking-wider px-2 py-0.5 rounded-md font-mono">
                          {ban.code || 'BKD'}
                        </Badge>
                        <h3 className="text-base sm:text-lg font-black text-[var(--mh-text)] truncate">
                          {ban.name}
                        </h3>
                      </div>
                      {ban.description && (
                        <p className="text-xs text-[var(--mh-text-2)] line-clamp-1">
                          {ban.description}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-[var(--mh-text-2)] hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          onClick={() => handleOpenEdit(ban)}
                          title="Chỉnh sửa thông tin Ban KD"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-[var(--mh-text-3)] hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          onClick={() => {
                            setTargetBanKd(ban);
                            setIsDeleteDialogOpen(true);
                          }}
                          title="Xóa Ban KD"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Body: Leader, Projects, Contacts */}
                  <div className="p-5 space-y-5">
                    {/* Leader Information Bar */}
                    <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-100/80 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                          {ban.leaderName ? ban.leaderName.trim().charAt(0).toUpperCase() : 'B'}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider block">
                            Trưởng ban / Phụ trách
                          </span>
                          <p className="text-xs font-bold text-[var(--mh-text)] truncate">
                            {ban.leaderName || 'Chưa phân công'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {ban.leaderPhone && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 rounded-lg text-[11px] font-bold border-blue-200 text-blue-700 bg-[var(--mh-surface)] hover:bg-blue-100/50 gap-1"
                            onClick={() => copyToClipboard(ban.leaderPhone || '', 'SĐT Trưởng ban')}
                            title="Sao chép số điện thoại"
                          >
                            <Phone className="w-3 h-3 text-blue-600" />
                            <span className="font-mono">{ban.leaderPhone}</span>
                          </Button>
                        )}
                        {ban.leaderEmail && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg text-blue-700 hover:bg-blue-100/50"
                            onClick={() => copyToClipboard(ban.leaderEmail || '', 'Email Trưởng ban')}
                            title={ban.leaderEmail}
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Section 1: Assigned Projects */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">
                            Dự án thuộc Ban ({assignedProjects.length})
                          </h4>
                        </div>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 rounded-lg gap-1"
                            onClick={() => handleOpenProjectAssignment(ban)}
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span>Gán / Thay đổi DA</span>
                          </Button>
                        )}
                      </div>

                      {assignedProjects.length === 0 ? (
                        <div className="p-4 bg-[var(--mh-surface-2)] rounded-2xl border border-dashed border-[var(--mh-border)] text-center text-xs text-[var(--mh-text-3)]">
                          Chưa có dự án nào được gán vào Ban này. Bấm <strong>"Gán / Thay đổi DA"</strong> để liên kết dự án.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {assignedProjects.map(p => (
                            <div 
                              key={p.id}
                              className="group flex items-center gap-1.5 px-2.5 py-1 bg-[var(--mh-surface-2)] hover:bg-blue-50 border border-[var(--mh-border)] hover:border-blue-200 rounded-xl text-xs font-medium text-[var(--mh-text)] transition-colors"
                            >
                              <span className="font-semibold truncate max-w-[140px] sm:max-w-[180px]">{p.name}</span>
                              {p.region && p.region !== 'Chưa xác định' && (
                                <span className="text-[10px] text-[var(--mh-text-3)] font-medium">({p.region})</span>
                              )}
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickRemoveProject(ban, p.id, p.name)}
                                  className="text-[var(--mh-text-3)] hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                  title="Gỡ dự án khỏi Ban"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Section 2: Contact Personnel */}
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-600" />
                          <h4 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">
                            Đầu mối liên hệ & Nhân sự ({contacts.length})
                          </h4>
                        </div>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 rounded-lg gap-1"
                            onClick={() => handleOpenContactsDialog(ban)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Thêm / Quản lý liên hệ</span>
                          </Button>
                        )}
                      </div>

                      {contacts.length === 0 ? (
                        <div className="p-3 bg-[var(--mh-surface-2)] rounded-2xl border border-dashed border-[var(--mh-border)] text-center text-xs text-[var(--mh-text-3)]">
                          Chưa có thông tin các vị trí liên hệ trong ban.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                          {contacts.map((c) => (
                            <div 
                              key={c.id}
                              className="p-2.5 bg-[var(--mh-surface-2)] hover:bg-purple-50/40 rounded-xl border border-[var(--mh-border)] hover:border-purple-200 transition-all text-xs flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-[var(--mh-text)] truncate">{c.name}</span>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-50 text-purple-700 border-purple-200 font-bold">
                                    {c.title}
                                  </Badge>
                                </div>
                                {c.phone && (
                                  <div 
                                    className="flex items-center gap-1 text-[11px] text-[var(--mh-text-2)] font-mono cursor-pointer hover:text-blue-600"
                                    onClick={() => copyToClipboard(c.phone || '', 'SĐT')}
                                  >
                                    <Phone className="w-2.5 h-2.5 text-[var(--mh-text-3)]" />
                                    <span>{c.phone}</span>
                                  </div>
                                )}
                                {c.email && (
                                  <div 
                                    className="flex items-center gap-1 text-[11px] text-[var(--mh-text-2)] truncate cursor-pointer hover:text-blue-600"
                                    onClick={() => copyToClipboard(c.email || '', 'Email')}
                                  >
                                    <Mail className="w-2.5 h-2.5 text-[var(--mh-text-3)]" />
                                    <span className="truncate">{c.email}</span>
                                  </div>
                                )}
                              </div>

                              {c.phone && (
                                <a 
                                  href={`tel:${c.phone}`}
                                  className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 transition-colors"
                                  title={`Gọi ${c.name}: ${c.phone}`}
                                >
                                  <PhoneCall className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Bar */}
                <div className="px-5 py-3 bg-[var(--mh-surface-2)]/70 border-t border-[var(--mh-border)] flex items-center justify-between text-xs text-[var(--mh-text-2)]">
                  <span className="font-mono text-[11px]">
                    {assignedProjects.length} Dự án • {contacts.length} Vị trí liên hệ
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-100/50 rounded-lg px-2.5 gap-1"
                      onClick={() => handleOpenProjectAssignment(ban)}
                    >
                      <span>Xem & Gán DA</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ==========================================
          DIALOG: ADD BAN KD
         ========================================== */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[var(--mh-text)] flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-600" /> Thêm Ban Kinh Doanh mới
            </DialogTitle>
            <DialogDescription className="font-medium text-[var(--mh-text-2)] text-xs">
              Tạo Ban KD mới để quản lý tập trung các dự án và thông tin liên hệ các vị trí
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveNewBanKd} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-bold text-[var(--mh-text)]">
                  Tên Ban Kinh Doanh <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="VD: Ban Kinh Doanh 1, Ban KD Miền Bắc..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="rounded-xl border-[var(--mh-border)] h-10 text-xs sm:text-sm font-semibold"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[var(--mh-text)]">Mã Ban</Label>
                <Input
                  placeholder="VD: BKD-01"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  className="rounded-xl border-[var(--mh-border)] h-10 font-mono text-xs sm:text-sm uppercase font-bold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[var(--mh-text)]">Mô tả / Phạm vi phụ trách</Label>
              <Input
                placeholder="VD: Phụ trách các dự án khu vực miền Trung và nghỉ dưỡng"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="rounded-xl border-[var(--mh-border)] h-10 text-xs"
              />
            </div>

            <div className="p-3.5 bg-[var(--mh-surface-2)] rounded-2xl border border-[var(--mh-border)] space-y-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-blue-700">
                <UserCheck className="w-4 h-4" />
                <span>Trưởng Ban / Đầu mối chính (tùy chọn)</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[var(--mh-text-2)]">Họ và tên Trưởng ban</Label>
                <Input
                  placeholder="VD: Nguyễn Văn A"
                  value={formLeaderName}
                  onChange={(e) => setFormLeaderName(e.target.value)}
                  className="rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)] h-9 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-[var(--mh-text-2)]">Số điện thoại</Label>
                  <Input
                    placeholder="VD: 0912345678"
                    value={formLeaderPhone}
                    onChange={(e) => setFormLeaderPhone(e.target.value)}
                    className="rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)] h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-[var(--mh-text-2)]">Email</Label>
                  <Input
                    placeholder="VD: truongban@mayhomes.vn"
                    value={formLeaderEmail}
                    onChange={(e) => setFormLeaderEmail(e.target.value)}
                    className="rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)] h-9 text-xs"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className="rounded-xl h-10 text-xs font-bold"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 text-xs font-bold px-5 shadow-md shadow-blue-100"
              >
                Xác nhận thêm Ban KD
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ==========================================
          DIALOG: EDIT BAN KD
         ========================================== */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[var(--mh-text)] flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-blue-600" /> Chỉnh sửa Ban Kinh Doanh
            </DialogTitle>
            <DialogDescription className="font-medium text-[var(--mh-text-2)] text-xs">
              Cập nhật thông tin Ban KD: thay đổi tên sẽ tự động đồng bộ sang các dự án trực thuộc
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEditBanKd} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-bold text-[var(--mh-text)]">
                  Tên Ban Kinh Doanh <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="rounded-xl border-[var(--mh-border)] h-10 text-xs sm:text-sm font-semibold"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[var(--mh-text)]">Mã Ban</Label>
                <Input
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  className="rounded-xl border-[var(--mh-border)] h-10 font-mono text-xs sm:text-sm uppercase font-bold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[var(--mh-text)]">Mô tả / Phạm vi phụ trách</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="rounded-xl border-[var(--mh-border)] h-10 text-xs"
              />
            </div>

            <div className="p-3.5 bg-[var(--mh-surface-2)] rounded-2xl border border-[var(--mh-border)] space-y-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-blue-700">
                <UserCheck className="w-4 h-4" />
                <span>Trưởng Ban / Đầu mối chính</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[var(--mh-text-2)]">Họ và tên Trưởng ban</Label>
                <Input
                  value={formLeaderName}
                  onChange={(e) => setFormLeaderName(e.target.value)}
                  className="rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)] h-9 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-[var(--mh-text-2)]">Số điện thoại</Label>
                  <Input
                    value={formLeaderPhone}
                    onChange={(e) => setFormLeaderPhone(e.target.value)}
                    className="rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)] h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-[var(--mh-text-2)]">Email</Label>
                  <Input
                    value={formLeaderEmail}
                    onChange={(e) => setFormLeaderEmail(e.target.value)}
                    className="rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)] h-9 text-xs"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                className="rounded-xl h-10 text-xs font-bold"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 text-xs font-bold px-5 shadow-md shadow-blue-100"
              >
                Lưu thay đổi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ==========================================
          DIALOG: DELETE BAN KD CONFIRMATION
         ========================================== */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-rose-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Xác nhận xóa Ban KD?
            </DialogTitle>
            <DialogDescription className="font-medium text-[var(--mh-text-2)] text-xs leading-relaxed pt-1">
              Bạn có chắc chắn muốn xóa <strong>{targetBanKd?.name}</strong>?
              {targetBanKd && (projectsByBanKdId[targetBanKd.id]?.length || 0) > 0 && (
                <span className="block mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold">
                  ⚠️ Có {projectsByBanKdId[targetBanKd.id].length} dự án đang thuộc Ban này. Khi xóa, các dự án sẽ được tự động bỏ gán khỏi Ban.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="rounded-xl h-10 text-xs font-bold"
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteBanKd}
              className="rounded-xl h-10 text-xs font-bold bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-200"
            >
              Xác nhận Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==========================================
          DIALOG: PROJECT ASSIGNMENT & SYNC
         ========================================== */}
      <Dialog open={isProjectAssignDialogOpen} onOpenChange={setIsProjectAssignDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] rounded-3xl border-none shadow-2xl p-6 flex flex-col">
          <DialogHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg sm:text-xl font-black text-[var(--mh-text)] flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-blue-600" />
                  Gán dự án vào {activeBanForProjects?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-[var(--mh-text-2)] mt-0.5">
                  Chọn các dự án trên hệ thống để gán vào Ban KD này. Dữ liệu sẽ tự động đồng bộ với danh mục Dự án, Ngân sách Khối, Nghiệm thu MKT và Đối ứng.
                </DialogDescription>
              </div>
              <Badge className="bg-blue-100 text-blue-800 font-mono font-extrabold text-xs px-2.5 py-1">
                {selectedProjectIdsToAssign.length} dự án đã chọn
              </Badge>
            </div>
          </DialogHeader>

          {/* Search & Filter bar for Projects */}
          <div className="space-y-2.5 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2 relative">
                <Search className="w-3.5 h-3.5 text-[var(--mh-text-3)] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={projectAssignSearch}
                  onChange={(e) => setProjectAssignSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc mã dự án..."
                  className="pl-9 h-9 text-xs rounded-xl bg-[var(--mh-surface-2)] border-[var(--mh-border)]"
                />
              </div>
              <div>
                <Select value={projectAssignFilterRegion} onValueChange={setProjectAssignFilterRegion}>
                  <SelectTrigger className="h-9 text-xs rounded-xl bg-[var(--mh-surface-2)] border-[var(--mh-border)]">
                    <SelectValue placeholder="Khu vực" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl text-xs">
                    <SelectItem value="all">Tất cả khu vực</SelectItem>
                    {uniqueRegions.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-[var(--mh-text-2)]">
                <input
                  type="checkbox"
                  checked={showOnlyUnassigned}
                  onChange={(e) => setShowOnlyUnassigned(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-[var(--mh-border-strong)] accent-blue-600"
                />
                <span>Chỉ hiện dự án chưa gán vào Ban nào</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = assignableProjects.map(p => p.id);
                    setSelectedProjectIdsToAssign(prev => Array.from(new Set([...prev, ...allIds])));
                  }}
                  className="text-blue-600 hover:underline font-bold text-[11px]"
                >
                  Chọn tất cả lọc ({assignableProjects.length})
                </button>
                <span className="text-[var(--mh-text-3)]">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedProjectIdsToAssign([])}
                  className="text-[var(--mh-text-2)] hover:underline font-medium text-[11px]"
                >
                  Bỏ chọn hết
                </button>
              </div>
            </div>
          </div>

          {/* Project List Selection Table */}
          <div className="flex-1 overflow-auto border border-[var(--mh-border)] rounded-2xl min-h-[250px] max-h-[380px] overscroll-contain [-webkit-overflow-scrolling:touch]">
            <Table className="min-w-[480px]">
              <TableHeader className="bg-[var(--mh-surface-2)]/80 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead className="text-[11px] font-bold">Tên Dự án</TableHead>
                  <TableHead className="text-[11px] font-bold">Khu vực</TableHead>
                  <TableHead className="text-[11px] font-bold">Ban KD hiện tại</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignableProjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-xs text-[var(--mh-text-3)]">
                      Không tìm thấy dự án phù hợp với điều kiện tìm kiếm.
                    </TableCell>
                  </TableRow>
                ) : (
                  assignableProjects.map((p) => {
                    const isChecked = selectedProjectIdsToAssign.includes(p.id);
                    const isAssignedToOther = p.banKdId && p.banKdId !== activeBanForProjects?.id;
                    const otherBanName = p.banKdName || banKdList.find(b => b.id === p.banKdId)?.name || 'Ban khác';

                    return (
                      <TableRow 
                        key={p.id}
                        className={`cursor-pointer transition-colors ${
                          isChecked ? 'bg-blue-50/50' : 'hover:bg-[var(--mh-surface-2)]/50'
                        }`}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedProjectIdsToAssign(prev => prev.filter(id => id !== p.id));
                          } else {
                            setSelectedProjectIdsToAssign(prev => [...prev, p.id]);
                          }
                        }}
                      >
                        <TableCell className="text-center py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProjectIdsToAssign(prev => [...prev, p.id]);
                              } else {
                                setSelectedProjectIdsToAssign(prev => prev.filter(id => id !== p.id));
                              }
                            }}
                            className="w-4 h-4 rounded border-[var(--mh-border-strong)] accent-blue-600 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="font-bold text-xs text-[var(--mh-text)] py-2.5">
                          {p.name}
                        </TableCell>
                        <TableCell className="text-xs text-[var(--mh-text-2)] py-2.5">
                          {p.region || 'Chưa xác định'}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {p.banKdId === activeBanForProjects?.id ? (
                            <Badge className="bg-blue-100 text-blue-800 text-[10px] font-bold border-none">
                              Ban này
                            </Badge>
                          ) : isAssignedToOther ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-medium" title="Sẽ chuyển từ ban này sang ban hiện tại">
                              {otherBanName}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-[var(--mh-text-3)] italic">Chưa gán</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="pt-4 flex items-center justify-between">
            <div className="text-xs text-[var(--mh-text-2)] font-medium">
              Đã chọn: <strong className="text-blue-700 font-mono font-bold">{selectedProjectIdsToAssign.length}</strong> dự án
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsProjectAssignDialogOpen(false)}
                className="rounded-xl h-10 text-xs font-bold"
                disabled={isSavingProjectAssignment}
              >
                Hủy
              </Button>
              <Button
                onClick={handleSaveProjectAssignment}
                disabled={isSavingProjectAssignment}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 text-xs font-bold px-5 shadow-md shadow-blue-100 gap-1.5"
              >
                {isSavingProjectAssignment ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang lưu...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Lưu & Đồng bộ Dự án
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==========================================
          DIALOG: CONTACTS & PERSONNEL MANAGEMENT
         ========================================== */}
      <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] rounded-3xl border-none shadow-2xl p-6 flex flex-col">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg sm:text-xl font-black text-[var(--mh-text)] flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Thông tin liên hệ các vị trí • {activeBanForContacts?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--mh-text-2)]">
              Quản lý danh sách nhân sự, chức danh và đầu mối liên lạc (SĐT, Email, Ghi chú) của Ban Kinh Doanh này.
            </DialogDescription>
          </DialogHeader>

          {/* Form Add / Edit Contact */}
          <form onSubmit={handleSaveContact} className="p-4 bg-purple-50/50 rounded-2xl border border-purple-100/80 space-y-3 my-2">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-black uppercase tracking-wider text-purple-900">
                {editingContactId ? 'Chỉnh sửa nhân sự / vị trí' : 'Thêm vị trí mới vào Ban'}
              </h5>
              {editingContactId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingContactId(null);
                    setContactName('');
                    setContactTitle('');
                    setContactPhone('');
                    setContactEmail('');
                    setContactNotes('');
                  }}
                  className="text-xs text-[var(--mh-text-2)] hover:text-[var(--mh-text)] font-bold"
                >
                  Hủy sửa
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-[var(--mh-text)]">
                  Họ và tên <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="VD: Trần Thị B"
                  className="h-9 text-xs rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)]"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-[var(--mh-text)]">
                  Chức danh / Vị trí <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  placeholder="VD: Phó Ban, Giám đốc KD, Trợ lý..."
                  className="h-9 text-xs rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)]"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-[var(--mh-text)]">Số điện thoại</Label>
                <Input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="0912..."
                  className="h-9 text-xs rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)] font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-[var(--mh-text)]">Email</Label>
                <Input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="email@..."
                  className="h-9 text-xs rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-[var(--mh-text)]">Ghi chú / Zalo</Label>
                <Input
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  placeholder="Zalo, ghi chú..."
                  className="h-9 text-xs rounded-xl bg-[var(--mh-surface)] border-[var(--mh-border)]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                className="h-8 px-4 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs"
              >
                {editingContactId ? 'Cập nhật nhân sự' : 'Thêm vào danh sách'}
              </Button>
            </div>
          </form>

          {/* Current Contacts List */}
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] pr-1">
            <h5 className="text-xs font-black uppercase tracking-wider text-[var(--mh-text-2)] px-1">
              Danh sách hiện tại ({activeBanForContacts?.contacts?.length || 0})
            </h5>
            {(activeBanForContacts?.contacts || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--mh-text-3)] bg-[var(--mh-surface-2)] rounded-2xl">
                Chưa có thông tin nhân sự nào. Hãy điền form bên trên để thêm.
              </div>
            ) : (
              (activeBanForContacts?.contacts || []).map((c) => (
                <div 
                  key={c.id}
                  className="p-3 bg-[var(--mh-surface)] rounded-2xl border border-[var(--mh-border)]/80 hover:border-purple-300 transition-all flex items-center justify-between gap-3 text-xs shadow-2xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-[var(--mh-text)] text-sm">{c.name}</span>
                      <Badge className="bg-purple-100 text-purple-800 border-none font-bold text-[10px]">
                        {c.title}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[var(--mh-text-2)] text-[11px] flex-wrap">
                      {c.phone && (
                        <span className="flex items-center gap-1 font-mono font-semibold text-[var(--mh-text)]">
                          <Phone className="w-3 h-3 text-emerald-600" /> {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-blue-600" /> {c.email}
                        </span>
                      )}
                      {c.notes && (
                        <span className="text-[var(--mh-text-3)] italic">({c.notes})</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-[var(--mh-text-2)] hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                      onClick={() => handleEditContact(c)}
                      title="Sửa thông tin"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-[var(--mh-text-3)] hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      onClick={() => handleDeleteContact(c.id)}
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              onClick={() => setIsContactDialogOpen(false)}
              className="rounded-xl h-10 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 px-5"
            >
              Hoàn tất
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default BanKdManager;
