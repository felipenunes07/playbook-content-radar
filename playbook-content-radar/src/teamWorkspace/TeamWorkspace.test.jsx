import { describe, expect, it } from 'vitest';
import { NOTE_KINDS, STATUSES, formatFileSize, localDateKey, safeFileName, upsertById } from './TeamWorkspace.jsx';

describe('TeamWorkspace helpers', () => {
  it('keeps the three requested kanban stages in order', () => {
    expect(STATUSES.map((status) => status.id)).toEqual(['todo', 'doing', 'done']);
  });

  it('supports day, meeting and idea notes', () => {
    expect(Object.keys(NOTE_KINDS)).toEqual(['day', 'meeting', 'idea']);
  });

  it('adds and updates shared records without duplicating them', () => {
    const added = upsertById([], { id: 'task-1', title: 'Primeira versão' });
    expect(upsertById(added, { id: 'task-1', title: 'Versão final' })).toEqual([
      { id: 'task-1', title: 'Versão final' }
    ]);
  });

  it('normalizes attachment names for storage paths', () => {
    expect(safeFileName('Print reunião ção.png')).toBe('Print-reuniao-cao.png');
  });

  it('formats attachment sizes for the interface', () => {
    expect(formatFileSize(1536)).toBe('2 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('keeps daily items grouped by the local calendar day', () => {
    expect(localDateKey(new Date(2026, 6, 31, 23, 45))).toBe('2026-07-31');
  });
});
