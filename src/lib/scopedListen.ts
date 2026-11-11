import { onSnapshot, type Query, type QueryDocumentSnapshot } from 'firebase/firestore';
/** Nghe nhiều truy vấn (VD GĐKD: mỗi Phòng 1 truy vấn teamId == …) và gộp theo id; cb nhận {docs} như QuerySnapshot.
 *  Gọi cb ngoài callback của SDK (tránh huỷ listener ngay trong callback → lỗi nội bộ Firestore). */
export function listenMerged(qs: Query[], cb: (s: { docs: QueryDocumentSnapshot[] }) => void, onErr?: (e: any) => void): () => void {
  let closed = false;
  if (!qs.length) { setTimeout(() => !closed && cb({ docs: [] }), 0); return () => { closed = true; }; }
  const parts: QueryDocumentSnapshot[][] = qs.map(() => []);
  const ready = qs.map(() => false);
  let queued = false;
  const emit = () => {
    if (queued) return; queued = true;
    setTimeout(() => { queued = false; if (closed || !ready.every(Boolean)) return; const m = new Map<string, QueryDocumentSnapshot>(); parts.flat().forEach((d) => m.set(d.id, d)); cb({ docs: [...m.values()] }); }, 0);
  };
  const uns = qs.map((q, i) => onSnapshot(q, (s) => { parts[i] = s.docs; ready[i] = true; emit(); }, (e) => { parts[i] = []; ready[i] = true; emit(); if (!closed) setTimeout(() => onErr?.(e), 0); }));
  return () => { closed = true; uns.forEach((u) => u()); };
}
