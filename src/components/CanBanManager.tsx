import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query as fsQuery, where as fsWhere, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Home, Save, Loader2, Plus } from 'lucide-react';
import { normalizeMonth } from '../../lib/vnext/ntReport';
import { CAN_BAN_COLLECTION, canBanDocId, canBanOf, parseCanBanQty, type CanBanLine } from '../../lib/vnext/canBan';
import { AcceptanceSearchableSelect } from './acceptance/AcceptanceSearchableSelect';

interface CanBanManagerProps {
  blocks: any[];
  projects: any[];
  acceptances: any[];
  user: any;
  isAdmin: boolean;
}

/** Mục "Căn bán": Admin nhập số căn bán theo Tháng × Khối × Dự án (collection can_ban). */
export function CanBanManager({ blocks, projects, acceptances, user, isAdmin }: CanBanManagerProps) {
  const months = useMemo(() => {
    const s = new Set<string>();
    for (const a of acceptances || []) { const m = normalizeMonth(a?.month); if (/^[0-9]{4}-[0-9]{2}$/.test(m)) s.add(m); }
    const arr = [...s].sort((a, b) => b.localeCompare(a));
    return arr.length ? arr : [normalizeMonth(new Date().toISOString().slice(0, 7))].filter((m) => /^[0-9]{4}-[0-9]{2}$/.test(m));
  }, [acceptances]);

  const [month, setMonth] = useState<string>('');
  const [blockId, setBlockId] = useState<string>('');
  const [lines, setLines] = useState<CanBanLine[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extraProjectIds, setExtraProjectIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!month && months.length) setMonth(months[0]); }, [months, month]);
  useEffect(() => { if (!blockId && (blocks || []).length) setBlockId(blocks[0].id); }, [blocks, blockId]);
  // Đổi Tháng/Khối → bỏ nháp chưa lưu, bỏ dự án thêm tay.
  useEffect(() => { setDrafts({}); setExtraProjectIds([]); }, [month, blockId]);

  // Nạp can_ban của kỳ đang chọn (realtime).
  useEffect(() => {
    if (!isAdmin || !month) { setLines([]); return; }
    const q = fsQuery(collection(db, CAN_BAN_COLLECTION), fsWhere('month', '==', month));
    const unsub = onSnapshot(q, (s) => setLines(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setLines([]));
    return () => unsub();
  }, [isAdmin, month]);

  const projName = (id: string) => {
    const p = (projects || []).find((x: any) => x.id === id || x.projectId === id);
    return { name: p?.name || p?.projectName || id, code: p?.projectCode || '' };
  };

  // Dự án của Khối trong kỳ: lấy từ bản ghi Nghiệm thu (blockId + tháng) ∪ dòng can_ban đã có ∪ thêm tay.
  const blockProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of acceptances || []) {
      if (a?.blockId === blockId && normalizeMonth(a?.month) === month && a?.projectId) ids.add(a.projectId);
    }
    for (const l of lines) { if (l.blockId === blockId && l.projectId) ids.add(l.projectId); }
    for (const id of extraProjectIds) if (id) ids.add(id);
    return [...ids];
  }, [acceptances, blockId, month, lines, extraProjectIds]);

  const rows = useMemo(() => blockProjectIds
    .map((id) => ({ id, ...projName(id), saved: canBanOf(lines, month, blockId, id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' })), [blockProjectIds, lines, month, blockId]);

  const addableProjects = useMemo(() => {
    const have = new Set(blockProjectIds);
    return (projects || []).filter((p: any) => !have.has(p.id)).map((p: any) => ({
      value: p.id,
      label: (p.projectCode ? `[${p.projectCode}] ` : '') + (p.name || p.id),
      code: p.projectCode || '',
      searchString: `${p.projectCode || ''} ${p.name || ''} ${p.id}`.toLowerCase(),
    }));
  }, [projects, blockProjectIds]);

  const changedCount = rows.reduce((n, r) => {
    const d = drafts[r.id];
    if (d === undefined) return n;
    const q = parseCanBanQty(d);
    return q !== null && q !== r.saved ? n + 1 : n;
  }, 0);

  const totalCanBan = rows.reduce((s, r) => {
    const d = drafts[r.id];
    const q = d !== undefined ? parseCanBanQty(d) : r.saved;
    return s + (q ?? r.saved);
  }, 0);

  const handleSave = async () => {
    if (saving) return;
    const batch = writeBatch(db);
    let count = 0;
    for (const r of rows) {
      const d = drafts[r.id];
      if (d === undefined) continue;
      const q = parseCanBanQty(d);
      if (q === null) { toast.error(`Số căn bán của "${r.name}" không hợp lệ (nhập số nguyên ≥ 0)`); return; }
      if (q === r.saved) continue;
      batch.set(doc(db, CAN_BAN_COLLECTION, canBanDocId(month, blockId, r.id)), {
        month, blockId, projectId: r.id, soLuong: q,
        updatedAt: new Date().toISOString(), updatedByUid: user?.uid || '', updatedByName: user?.displayName || user?.email || '',
      });
      count++;
    }
    if (!count) { toast.info('Không có thay đổi để lưu.'); return; }
    setSaving(true);
    try {
      await batch.commit();
      toast.success(`Đã lưu số căn bán cho ${count} dự án.`);
      setDrafts({});
    } catch (e: any) {
      toast.error('Không lưu được: ' + (e?.code || e?.message || e));
    } finally { setSaving(false); }
  };

  if (!isAdmin) {
    return <Card className="border-none shadow-sm"><CardContent className="py-10 text-center text-sm text-[var(--mh-text-3)]">Chỉ Quản trị viên (Admin) được nhập số căn bán.</CardContent></Card>;
  }

  const blockName = (blocks || []).find((b: any) => b.id === blockId)?.name || '';

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Home className="w-5 h-5 text-indigo-600" /> Căn bán</CardTitle>
          <CardDescription className="text-[var(--mh-text-2)] font-medium">Nhập số lượng căn bán theo Tháng × Khối × từng Dự án (dùng cho Báo cáo Tổng quan).</CardDescription>
        </div>
        <Button onClick={handleSave} disabled={saving || changedCount === 0} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu{changedCount ? ` (${changedCount})` : ''}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px]">
            <label className="text-[11px] font-bold text-[var(--mh-text-3)] uppercase block mb-1">Tháng</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Chọn tháng" /></SelectTrigger>
              <SelectContent className="max-h-72">{months.map((m) => <SelectItem key={m} value={m}>Tháng {+m.slice(5)}/{m.slice(0, 4)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="min-w-[200px]">
            <label className="text-[11px] font-bold text-[var(--mh-text-3)] uppercase block mb-1">Khối</label>
            <Select value={blockId} onValueChange={setBlockId}>
              <SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Chọn Khối" /></SelectTrigger>
              <SelectContent className="max-h-72">{(blocks || []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name || b.blockCode || b.id}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Badge variant="outline" className="h-9 px-3 flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">
            <Building2 className="w-3.5 h-3.5" /> Tổng căn bán: {totalCanBan.toLocaleString('vi-VN')}
          </Badge>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--mh-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--mh-surface-2)] text-[var(--mh-text-2)] text-[11px] uppercase font-black">
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">Dự án</th>
                <th className="text-right px-3 py-2 w-40">Số căn bán</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const d = drafts[r.id];
                const dirty = d !== undefined && parseCanBanQty(d) !== r.saved;
                return (
                  <tr key={r.id} className={`border-t border-[var(--mh-border)] ${dirty ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-1.5 text-[var(--mh-text-3)] font-mono text-xs">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <div className="font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                        {r.code && <span className="font-mono text-[10px] bg-indigo-100 text-indigo-700 px-1.5 rounded">{r.code}</span>}
                        {r.name}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Input
                        value={d !== undefined ? d : String(r.saved)}
                        inputMode="numeric"
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        className={`h-8 w-32 ml-auto text-right font-mono font-bold ${d !== undefined && parseCanBanQty(d) === null ? 'border-rose-400' : 'border-[var(--mh-border)]'}`}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--mh-text-3)] text-sm">Khối này chưa có dự án nào trong kỳ. Thêm dự án bên dưới để nhập.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-[var(--mh-text-3)]" />
          <div className="min-w-[280px] max-w-[360px]">
            <AcceptanceSearchableSelect
              value=""
              items={addableProjects}
              placeholder="Thêm dự án khác để nhập…"
              searchPlaceholder="Tìm dự án (không cần dấu)…"
              onValueChange={(pid) => { if (pid) setExtraProjectIds((prev) => (prev.includes(pid) ? prev : [...prev, pid])); }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
