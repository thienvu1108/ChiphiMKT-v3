/** null = không giới hạn theo Phòng; mảng = GĐKD chỉ các Phòng này (có thể rỗng). */
export function gdkdScopedTeamIds(role: string | undefined, teamIds: string[]): string[] | null {
  return role === 'gdkd' ? [...new Set(teamIds.filter(Boolean))] : null;
}
