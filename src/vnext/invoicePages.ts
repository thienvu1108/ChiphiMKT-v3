import { useEffect, useMemo, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { auth } from '../firebase';
import { storageFor } from './storage';
import { expandPdfInvoicePages, pdfInvoiceName, type DeckImage } from '../../lib/vnext/invoiceDeck';

type RenderedPdf = { pages: number; sources: string[] };
const cache = new Map<string, Promise<RenderedPdf>>();

function loadPdf(img: DeckImage, share?: string) {
  const user = auth.currentUser;
  const key = JSON.stringify([share ? ['share', share] : ['user', user?.uid], img.ref]);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const params = new URLSearchParams({ id: img.ref, pdf: '1' });
    if (share) params.set('share', share);
    else params.set('inv', img.inv!);
    const response = await fetch('/api/nt-images/file?' + params, {
      headers: share ? {} : { authorization: `Bearer ${await user?.getIdToken()}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw Object.assign(new Error('Cannot load PDF'), { status: response.status });
    const { renderInvoicePdf } = await import('./renderInvoicePdf');
    return renderInvoicePdf(await response.arrayBuffer());
  })();
  cache.set(key, pending);
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  pending.catch((error) => {
    if (error.status !== 413 && cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}

/** HTML, PPTX and the viewer reuse the same rendered page sources. Snapshots store metadata only. */
export function useInvoicePages(images: DeckImage[], db: Firestore, share?: string) {
  const key = JSON.stringify(images);
  const input = useMemo(() => JSON.parse(key) as DeckImage[], [key]);
  const scope = share ?? auth.currentUser?.uid;
  const [prepared, setPrepared] = useState<{ input: DeckImage[]; scope?: string; images: DeckImage[]; sources: Map<string, string[]> }>();
  const current = prepared?.input === input && prepared.scope === scope ? prepared : undefined;
  const pending = !current && input.some((img) => pdfInvoiceName(img) !== undefined);
  useEffect(() => {
    if (!input.some((img) => pdfInvoiceName(img) !== undefined)) return;
    let active = true;
    const sources = new Map<string, string[]>();
    expandPdfInvoicePages(input, async (img) => {
      if (!active) throw new Error('PDF preparation cancelled');
      const pdf = await loadPdf(img, share);
      sources.set(img.ref, pdf.sources);
      return pdf.pages;
    }).then((expanded) => { if (active) setPrepared({ input, scope, images: expanded, sources }); });
    return () => { active = false; };
  }, [input, scope, share]);

  const resolve = (img: DeckImage) => {
    const src = img.pages && current?.sources.get(img.ref)?.[(img.page ?? 1) - 1];
    return src ? Promise.resolve(src) : storageFor(db, img.provider).url(img, share);
  };
  return { images: current?.images ?? input, pending, resolve };
}
