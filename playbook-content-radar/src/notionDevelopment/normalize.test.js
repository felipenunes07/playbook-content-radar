import { describe, expect, it } from 'vitest';
import { filterCardsByPlatform, groupCardsByStatus, normalizeNotionContentPage } from './normalize.js';

describe('normalizeNotionContentPage', () => {
  it('normaliza card do calendário do Notion', () => {
    const card = normalizeNotionContentPage({
      id: 'page-1',
      url: 'https://notion.so/page-1',
      properties: {
        Title: { title: [{ plain_text: 'Post sobre agentes' }] },
        Platform: { multi_select: [{ name: 'LinkedIn' }] },
        'Status ': { status: { name: 'Em edição' } },
        'Publish Date': { date: { start: '2026-07-15' } },
        Campaign: { multi_select: [{ name: 'Educational' }] },
        'URL/Link': { url: 'https://linkedin.com/posts/example' },
        '🎯 Felipe': { checkbox: true },
      },
    });

    expect(card).toMatchObject({
      id: 'page-1',
      title: 'Post sobre agentes',
      notionUrl: 'https://notion.so/page-1',
      contentUrl: 'https://linkedin.com/posts/example',
      status: 'Em edição',
      platforms: ['LinkedIn'],
      publishDate: '2026-07-15',
      campaign: ['Educational'],
      assignedToFelipe: true,
    });
  });

  it('filtra e agrupa por plataforma e status', () => {
    const cards = [
      { title: 'A', platforms: ['LinkedIn'], status: 'In progress' },
      { title: 'B', platforms: ['YouTube'], status: 'Ready to publish' },
      { title: 'C', platforms: ['LinkedIn', 'YouTube'], status: 'In progress' },
    ];

    const linkedin = filterCardsByPlatform(cards, 'LinkedIn');
    const groups = groupCardsByStatus(linkedin);

    expect(linkedin.map((card) => card.title)).toEqual(['A', 'C']);
    expect(groups['In progress'].map((card) => card.title)).toEqual(['A', 'C']);
    expect(groups['Ready to publish']).toEqual([]);
  });

  it('normaliza linha migrada para Supabase', () => {
    const card = normalizeNotionContentPage({
      source: 'supabase',
      id: 'row-1',
      notion_page_url: 'https://notion.so/row-1',
      title: 'Roteiro novo',
      platforms: ['YouTube'],
      status: 'Ready to publish',
      publish_date: '2026-07-20',
      campaigns: ['Educational'],
      assigned_to_felipe: false,
    });

    expect(card).toMatchObject({
      id: 'row-1',
      notionUrl: 'https://notion.so/row-1',
      title: 'Roteiro novo',
      platforms: ['YouTube'],
      status: 'Ready to publish',
      publishDate: '2026-07-20',
      campaign: ['Educational'],
    });
  });

  it('normaliza card criado pelo sistema com template e fases', () => {
    const card = normalizeNotionContentPage({
      source: 'production_item',
      id: 'item-1',
      title: 'Lead magnet novo',
      platform: 'LinkedIn',
      template_key: 'lead_magnet_post',
      template_name: 'New Lead Magnet Post',
      status: 'Not started',
      campaign: 'Lead Magnet',
      sections: [{ title: 'Oferta', done: false }],
      assigned_to_felipe: true,
    });

    expect(card).toMatchObject({
      id: 'item-1',
      title: 'Lead magnet novo',
      platforms: ['LinkedIn'],
      templateKey: 'lead_magnet_post',
      templateName: 'New Lead Magnet Post',
      campaign: ['Lead Magnet'],
      assignedToFelipe: true,
      sections: [{ title: 'Oferta', done: false }],
      sourceType: 'system',
    });
  });
});
