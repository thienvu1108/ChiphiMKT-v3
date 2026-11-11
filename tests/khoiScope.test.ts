import { describe, it, expect } from 'vitest';
import { resolveMyBlocks, legacyKhoiRoleCheck } from '../src/lib/khoiScope';

const blocks = [
  { id: 'bA', blockCode: 'E07', name: 'Khối E07', directorUid: 'gdA', assistantUids: ['trA', 'OLDtr'] },
  { id: 'bB', blockCode: 'E88', name: 'Khối E88', directorUid: 'gdB', assistantUids: [] },
  { id: 'bC', blockCode: 'E99', name: 'Khối E99' }, // chưa có GĐ
];
const ids = (r: any[]) => r.map((b) => b.id).sort();

describe('resolveMyBlocks', () => {
  it('GĐ Khối có tên directorUid', () => expect(ids(resolveMyBlocks(blocks, { id: 'gdA' }, 'gdA', 'a@x'))).toEqual(['bA']));
  it('Trợ lý có tên assistantUids', () => expect(ids(resolveMyBlocks(blocks, { id: 'trA' }, 'trA', null))).toEqual(['bA']));
  it('Trợ lý qua UID cũ (migratedFromUid)', () => expect(ids(resolveMyBlocks(blocks, { id: 'NEW', migratedFromUid: 'OLDtr' }, 'NEW', null))).toEqual(['bA']));
  it('Trợ lý qua hồ sơ cũ linkedToUid', () => expect(ids(resolveMyBlocks(blocks, { id: 'NEW2' }, 'NEW2', null, [{ id: 'OLDtr', linkedToUid: 'NEW2' }]))).toEqual(['bA']));
  it('assignedBlock KHÔNG cấp quyền Khối đã có GĐ', () => expect(ids(resolveMyBlocks(blocks, { id: 'x', assignedBlock: 'E07', assignedBlocks: ['bB'] }, 'x', null))).toEqual([]));
  it('assignedBlock vẫn cấp quyền Khối chưa có GĐ', () => expect(ids(resolveMyBlocks(blocks, { id: 'x', assignedBlock: 'E99' }, 'x', null))).toEqual(['bC']));
  it('được duyệt Trợ lý qua đăng ký mới đúng Khối', () => expect(ids(resolveMyBlocks(blocks, { id: 'y', assignedBlock: 'E88', vnOnboarding: { status: 'approved', position: 'tro_ly_khoi', blockId: 'bB' } }, 'y', null))).toEqual(['bB']));
  it('đăng ký mới NVKD không cấp quyền Khối', () => expect(ids(resolveMyBlocks(blocks, { id: 'y', vnOnboarding: { status: 'approved', position: 'nvkd', blockId: 'bB' } }, 'y', null))).toEqual([]));
  it('đăng ký chưa duyệt không cấp quyền', () => expect(ids(resolveMyBlocks(blocks, { id: 'y', vnOnboarding: { status: 'pending', position: 'gd_khoi', blockId: 'bB' } }, 'y', null))).toEqual([]));
  it('GĐ hai Khối (kiêm)', () => expect(ids(resolveMyBlocks([...blocks, { id: 'bD', blockCode: 'E01', directorUid: 'gdA' }], { id: 'gdA' }, 'gdA', null))).toEqual(['bA', 'bD']));
});

describe('legacyKhoiRoleCheck', () => {
  it('gd_khoi cũ không có tên ở Khối nào → hạ quyền', () => expect(legacyKhoiRoleCheck({ role: 'gd_khoi', assignedBlock: 'E07' }, 'OLDx', blocks, 'NEWx', 'k@x').downgrade).toBe(true));
  it('tro_ly_khoi cũ có tên qua UID cũ → giữ', () => expect(legacyKhoiRoleCheck({ role: 'tro_ly_khoi', assignedBlock: 'E07' }, 'OLDtr', blocks, 'NEW', null).downgrade).toBe(false));
  it('gd_khoi cũ của Khối chưa có GĐ → giữ', () => expect(legacyKhoiRoleCheck({ role: 'gd_khoi', assignedBlock: 'E99' }, 'OLDz', blocks, 'NEWz', null).downgrade).toBe(false));
  it('vai trò khác không bị đụng', () => expect(legacyKhoiRoleCheck({ role: 'gdkd', assignedBlock: 'E07' }, 'O', blocks, 'N', null).downgrade).toBe(false));
});
