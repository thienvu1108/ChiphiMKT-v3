/** Kiểm tra file Drive nằm trong cây thư mục gốc (đi ngược parents, tối đa `maxDepth` cấp). */
export async function isUnderRoot(getParents: (id: string) => Promise<string[] | null>, fileId: string, root: string, maxDepth = 10): Promise<boolean> {
  if (!root || !fileId) return false;
  let frontier = [fileId];
  const seen = new Set<string>();
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const ps = await getParents(id);
      if (!ps) continue;
      for (const p of ps) { if (p === root) return true; if (!seen.has(p)) { seen.add(p); next.push(p); } }
    }
    frontier = next;
  }
  return false;
}
