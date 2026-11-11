import { describe, expect, it } from 'vitest';
import { normalizeRoleKey, ruleHasPerm, uiHasPermission, findRolePermDoc } from '../src/lib/rolePermissions';

const stored = [
  { id: 'tro_ly_khoi', permissions: ['block.view', 'block_budget.view', 'block_budget.create', 'block_budget.edit', 'report_nt.view'] },
  { id: 'assistant', permissions: ['home.view', 'register.view'] },
  { id: 'gd_khoi', permissions: ['block.view', 'block_budget.view', 'block_budget.create', 'block_budget.edit', 'block_budget.delete'] },
  { id: 'mod', permissions: ['block.view', 'report_nt.view', 'bankd.view'] },
];

describe('normalizeRoleKey (mirrors firestore.rules)', () => {
  it('keeps tro_ly_khoi as its own role (P0-4)', () => {
    expect(normalizeRoleKey('tro_ly_khoi')).toBe('tro_ly_khoi');
    expect(normalizeRoleKey('Trợ lý Khối')).toBe('tro_ly_khoi');
    expect(normalizeRoleKey('assistant')).toBe('assistant');
    expect(normalizeRoleKey('pho_ban_kd')).toBe('pho_ban_kd');
    expect(normalizeRoleKey('Phó Ban KD')).toBe('pho_ban_kd');
  });
  it('an assignedBlock alone never upgrades role "user"', () => {
    expect(normalizeRoleKey('user')).toBe('user');
    expect(normalizeRoleKey(undefined)).toBe('user');
  });
});

describe('rule-aligned permissions', () => {
  it('tro_ly_khoi reads rolePermissions/tro_ly_khoi, not assistant', () => {
    expect(findRolePermDoc(stored, 'tro_ly_khoi')?.id).toBe('tro_ly_khoi');
    expect(ruleHasPerm({ roleKey: 'tro_ly_khoi', rolePermissionsList: stored }, 'block_budget.create')).toBe(true);
    expect(ruleHasPerm({ roleKey: 'tro_ly_khoi', rolePermissionsList: stored }, 'home.view')).toBe(false);
    expect(uiHasPermission({ roleKey: 'tro_ly_khoi', rolePermissionsList: stored }, 'block_budget.create')).toBe(true);
  });
  it('no delete button when block_budget.delete is missing (P1-4)', () => {
    expect(uiHasPermission({ roleKey: 'tro_ly_khoi', rolePermissionsList: stored }, 'block_budget.delete')).toBe(false);
    expect(uiHasPermission({ roleKey: 'gd_khoi', rolePermissionsList: stored }, 'block_budget.delete')).toBe(true);
  });
  it('Ngân sách đối ứng hidden when reciprocal_budget.view is not stored (P1-2)', () => {
    expect(uiHasPermission({ roleKey: 'gd_khoi', rolePermissionsList: stored }, 'reciprocal_budget.view')).toBe(false);
  });
  it('assistant cannot register block budgets when not stored (P1-4)', () => {
    expect(uiHasPermission({ roleKey: 'assistant', rolePermissionsList: stored }, 'block_budget.create')).toBe(false);
  });
  it('mod without home.view / admin.budgets.view does not get budget screens', () => {
    expect(uiHasPermission({ roleKey: 'mod', rolePermissionsList: stored }, 'home.view')).toBe(false);
    expect(uiHasPermission({ roleKey: 'mod', rolePermissionsList: stored }, 'admin.budgets.view')).toBe(false);
  });
  it('role "user" only sees Quy trình đối ứng', () => {
    expect(uiHasPermission({ roleKey: 'user', rolePermissionsList: stored }, 'process_doiung.create')).toBe(true);
    expect(uiHasPermission({ roleKey: 'user', rolePermissionsList: stored }, 'block_budget.create')).toBe(false);
  });
  it('falls back to rule defaults only when the role doc is missing', () => {
    expect(ruleHasPerm({ roleKey: 'accountant', rolePermissionsList: stored }, 'block_budget.view')).toBe(true);
    expect(ruleHasPerm({ roleKey: 'super_admin', rolePermissionsList: [] }, 'anything')).toBe(true);
  });
});
