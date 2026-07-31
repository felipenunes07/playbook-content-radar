import { describe, expect, it } from 'vitest';
import { NOTE_KINDS, STATUSES, upsertById } from './TeamWorkspace.jsx';

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
});
