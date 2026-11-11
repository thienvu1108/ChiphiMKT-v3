/**
 * Shim cho 'firebase/firestore' (alias trong vite.config.ts): ghi changeLog TRƯỚC khi ghi dữ liệu vào collection quan trọng.
 * - before = tài liệu hiện tại (rules kiểm tra before == dữ liệu thật, actor == auth.uid, at == request.time → không giả mạo được).
 * - Lỗi ghi nhật ký KHÔNG chặn thao tác dữ liệu (chỉ cảnh báo console). Ghi dữ liệu lỗi → đánh dấu entry 'failed'.
 * - Chỉ bật với DB *-staging.
 */
export * from '@firebase/firestore';
import * as F from '@firebase/firestore';
import { CHANGELOG, changeLogEnabledFor, isKeyPath, sanitize, type ChangeOp } from '../../lib/vnext/changeLog';

type Op = { ref: F.DocumentReference<any>; op: ChangeOp; data?: any; options?: any };
const dbIdOf = (fs: any) => fs?._databaseId?.database as string | undefined;
const enabled = (ref: F.DocumentReference<any>) => changeLogEnabledFor(dbIdOf(ref.firestore)) && isKeyPath(ref.path);
const auth = () => { try { const a = (globalThis as any).__CL_AUTH__; return a?.currentUser || null; } catch { return null; } };

async function writeLogs(ops: Op[]): Promise<F.DocumentReference[]> {
  const mine = ops.filter((o) => enabled(o.ref));
  if (!mine.length) return [];
  const u = auth(); if (!u) return [];
  try {
    const fs = mine[0].ref.firestore;
    const befores = await Promise.all(mine.map((o) => F.getDocFromServer(o.ref).catch(() => F.getDoc(o.ref)).then((s) => (s.exists() ? s.data() : null))));
    const refs: F.DocumentReference[] = [];
    // ≤ 8 bản ghi / lô để không vượt giới hạn 20 lượt truy cập tài liệu của rules.
    for (let i = 0; i < mine.length; i += 8) {
      const b = F.writeBatch(fs);
      mine.slice(i, i + 8).forEach((o, k) => {
        const before = befores[i + k];
        const r = F.doc(F.collection(fs, CHANGELOG));
        refs.push(r);
        const [col, docId] = o.ref.path.split('/');
        b.set(r, { col, docId, op: o.op === 'set' && !before ? 'create' : o.op, before, patch: o.data === undefined ? null : sanitize(o.data), options: o.options?.merge ? 'merge' : null, actor: u.uid, actorName: u.displayName || u.email || '', at: F.serverTimestamp() });
      });
      await b.commit();
    }
    return refs;
  } catch (e: any) { console.warn('[changeLog] bỏ qua:', e?.code || e?.message); return []; }
}
async function markFailed(refs: F.DocumentReference[]) {
  for (const r of refs) await F.updateDoc(r, { status: 'failed' }).catch(() => {});
}
async function run<T>(ops: Op[], fn: () => Promise<T>): Promise<T> {
  const logs = await writeLogs(ops);
  try { return await fn(); } catch (e) { await markFailed(logs); throw e; }
}

export function setDoc(ref: any, data: any, options?: any): Promise<void> {
  return run([{ ref, op: 'set', data, options }], () => (options ? F.setDoc(ref, data, options) : F.setDoc(ref, data)));
}
export function updateDoc(ref: any, ...args: any[]): Promise<void> {
  const data = args.length === 1 ? args[0] : Object.fromEntries(args.reduce((a: any[], v, i) => (i % 2 ? a : [...a, [String(args[i]), args[i + 1]]]), []));
  return run([{ ref, op: 'update', data }], () => (F.updateDoc as any)(ref, ...args));
}
export function deleteDoc(ref: any): Promise<void> { return run([{ ref, op: 'delete' }], () => F.deleteDoc(ref)); }
export async function addDoc(colRef: any, data: any): Promise<any> {
  const ref = F.doc(colRef);
  await setDoc(ref, data);
  return ref;
}
export function writeBatch(fs: any): F.WriteBatch {
  const real = F.writeBatch(fs); const ops: Op[] = [];
  const w: any = {
    set(ref: any, data: any, options?: any) { ops.push({ ref, op: 'set', data, options }); options ? real.set(ref, data, options) : real.set(ref, data); return w; },
    update(ref: any, ...args: any[]) { ops.push({ ref, op: 'update', data: args.length === 1 ? args[0] : { [String(args[0])]: args[1] } }); (real.update as any)(ref, ...args); return w; },
    delete(ref: any) { ops.push({ ref, op: 'delete' }); real.delete(ref); return w; },
    commit() { return run(ops, () => real.commit()); },
  };
  return w;
}
