import { describe, it, expect } from 'vitest';
import { invoiceDeckImages } from '../lib/vnext/invoiceDeck';
const inv = (id: string, acc: string, mime: string, order: number) => ({ id, acceptanceId: acc, fileId: 'f' + id, name: id + '.x', mime, order, webViewLink: 'https://drive/' + id });
describe('invoiceDeckImages', () => {
  it('lọc theo bản ghi, xếp sau ảnh NT, giữ link Drive, đánh dấu PDF', () => {
    const r = invoiceDeckImages([inv('a', 'R1', 'application/pdf', 2), inv('b', 'R1', 'image/jpeg', 1), inv('c', 'R9', 'image/png', 1)], [{ id: 'R1' }]);
    expect(r.map((x) => x.inv)).toEqual(['a', 'b']);
    expect(r[0]).toMatchObject({ provider: 'drive', ref: 'fa', recordId: 'R1', link: 'https://drive/a', order: 100002 });
    expect(r[0].caption).toContain('PDF, trang 1');
    expect(r[1].caption).not.toContain('PDF');
  });
});
