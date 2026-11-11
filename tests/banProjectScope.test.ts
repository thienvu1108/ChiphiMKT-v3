import { describe, expect, it } from 'vitest';

/** Mirror UI: chỉ dự án có banKdId === Ban.id (không khớp tên). */
function projectsOfBan(projects: { id: string; banKdId?: string; banKdName?: string }[], ban: { id: string; name: string }) {
  return projects.filter((p) => p.banKdId && p.banKdId === ban.id).map((p) => p.id);
}

describe('Ban Ngân sách — scope dự án', () => {
  const ban = { id: 'BAN1', name: 'Ban Alpha' };
  const projects = [
    { id: 'P1', banKdId: 'BAN1', banKdName: 'Ban Alpha' },
    { id: 'P2', banKdId: 'BAN2', banKdName: 'Ban Alpha' }, // cùng tên khác Ban
    { id: 'P3', banKdName: 'Ban Alpha' }, // chỉ tên — loại
    { id: 'P4', banKdId: 'BAN1' },
  ];
  it('chỉ khớp banKdId === Ban.id', () => {
    expect(projectsOfBan(projects, ban).sort()).toEqual(['P1', 'P4']);
  });
  it('dòng NS ngoài Ban bị loại khi filter allowedProjectIds', () => {
    const allowed = new Set(projectsOfBan(projects, ban));
    const lines = [{ projectId: 'P1' }, { projectId: 'P2' }, { projectId: 'P3' }];
    expect(lines.filter((l) => allowed.has(l.projectId)).map((l) => l.projectId)).toEqual(['P1']);
  });
});
