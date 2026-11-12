import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query as fsQuery, where as fsWhere } from 'firebase/firestore';
import { db } from '../firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeMonth } from '../../lib/vnext/ntReport';
import { buildOverview } from '../../lib/vnext/overviewReport';
import { OverviewReportView } from './OverviewReportView';

interface OverviewReportManagerProps {
  acceptances: any[];
  projects: any[];
  blocks: any[];
  teams: any[];
  bans: any[];
  user?: any;
}

export function OverviewReportManager({ acceptances, projects, blocks, teams, bans }: OverviewReportManagerProps) {
  const months = useMemo(() => {
    const s = new Set<string>();
    for (const a of acceptances || []) { const m = normalizeMonth(a?.month); if (/^[0-9]{4}-[0-9]{2}$/.test(m)) s.add(m); }
    const arr = [...s].sort((a, b) => b.localeCompare(a));
    return arr.length ? arr : [normalizeMonth(new Date().toISOString().slice(0, 7))].filter((m) => /^[0-9]{4}-[0-9]{2}$/.test(m));
  }, [acceptances]);

  const [month, setMonth] = useState('');
  const [nsLines, setNsLines] = useState<any[]>([]);
  const [nsSupport, setNsSupport] = useState<Record<string, any>>({});
  const [canBanLines, setCanBanLines] = useState<any[]>([]);

  useEffect(() => { if (!month && months.length) setMonth(months[0]); }, [months, month]);

  useEffect(() => {
    if (!month) return;
    const uL = onSnapshot(fsQuery(collection(db, 'ns_lines'), fsWhere('period', '==', month)),
      (s) => setNsLines(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setNsLines([]));
    const uS = onSnapshot(fsQuery(collection(db, 'nsSupport'), fsWhere('period', '==', month)),
      (s) => { const o: Record<string, any> = {}; s.docs.forEach((d) => { o[d.id] = { id: d.id, ...(d.data() as any) }; }); setNsSupport(o); }, () => setNsSupport({}));
    const uC = onSnapshot(fsQuery(collection(db, 'can_ban'), fsWhere('month', '==', month)),
      (s) => setCanBanLines(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setCanBanLines([]));
    return () => { uL(); uS(); uC(); };
  }, [month]);

  const o = useMemo(() => buildOverview({ period: month, nsLines, nsSupport, acceptances, canBanLines, projects, bans, blocks, teams }),
    [month, nsLines, nsSupport, acceptances, canBanLines, projects, bans, blocks, teams]);

  const monthPicker = (
    <div className="min-w-[160px]">
      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Chọn tháng" /></SelectTrigger>
        <SelectContent className="max-h-72">{months.map((m) => <SelectItem key={m} value={m}>Tháng {+m.slice(5)}/{m.slice(0, 4)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return <OverviewReportView o={o} headerRight={monthPicker} />;
}
