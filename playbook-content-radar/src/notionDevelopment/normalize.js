export const DEVELOPMENT_STATUSES = [
  'Not started',
  'In progress',
  'Em edição',
  'Ready to publish',
  'Programado',
  'Published',
  'Cancelled',
];

export const PLATFORM_ORDER = ['LinkedIn', 'YouTube'];

function plainText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join('');
  if (value.plain_text) return value.plain_text;
  if (value.text?.content) return value.text.content;
  if (value.title) return plainText(value.title);
  if (value.rich_text) return plainText(value.rich_text);
  return '';
}

function multiSelectNames(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => item?.name || item).filter(Boolean);
  if (Array.isArray(value.multi_select)) return value.multi_select.map((item) => item.name).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value].filter(Boolean);
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

function selectName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.status?.name || value.select?.name || value.name || '';
}

function dateStart(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.date?.start || value.start || '';
}

export function normalizeNotionContentPage(page) {
  if (page?.source === 'production_item' || page?.template_key) {
    return {
      id: page.id || page.title,
      title: page.title || 'Sem titulo',
      notionUrl: '',
      contentUrl: page.content_url || '',
      status: page.status || 'Not started',
      platforms: page.platform ? [page.platform] : ['Sem plataforma'],
      publishDate: page.publish_date || '',
      campaign: page.campaign ? [page.campaign] : [],
      performance: '',
      assignedToFelipe: Boolean(page.assigned_to_felipe),
      createdTime: page.created_at || '',
      templateKey: page.template_key || '',
      templateName: page.template_name || '',
      sections: Array.isArray(page.sections) ? page.sections : [],
      attachments: Array.isArray(page.attachments) ? page.attachments : [],
      description: page.description || '',
      notionSourceId: page.notion_source_id || '',
      sourceType: 'system',
    };
  }

  if (page?.source === 'supabase' || page?.notion_page_url) {
    return {
      id: page.id || page.notion_page_url || page.title,
      title: page.title || 'Sem título',
      notionUrl: page.notion_page_url || '',
      contentUrl: page.content_url || '',
      status: page.status || 'Not started',
      platforms: Array.isArray(page.platforms) && page.platforms.length ? page.platforms : ['Sem plataforma'],
      publishDate: page.publish_date || '',
      campaign: Array.isArray(page.campaigns) ? page.campaigns : [],
      performance: page.performance || '',
      assignedToFelipe: Boolean(page.assigned_to_felipe),
      createdTime: page.notion_created_time || page.created_at || '',
      templateKey: '',
      templateName: '',
      sections: [],
      attachments: [],
      description: '',
      sourceType: 'notion',
    };
  }

  const properties = page?.properties || page || {};
  const title = plainText(properties.Title) || plainText(properties.Name) || 'Sem título';
  const platforms = multiSelectNames(properties.Platform);

  return {
    id: page?.id || page?.url || title,
    title,
    notionUrl: page?.url || '',
    contentUrl: properties['URL/Link']?.url || properties['URL/Link'] || '',
    status: selectName(properties['Status ']) || selectName(properties.Status) || 'Not started',
    platforms: platforms.length ? platforms : ['Sem plataforma'],
    publishDate: dateStart(properties['Publish Date']),
    campaign: multiSelectNames(properties.Campaign),
    performance: selectName(properties.Performance),
    assignedToFelipe: properties['🎯 Felipe']?.checkbox === true || properties['🎯 Felipe'] === '__YES__',
    createdTime: page?.created_time || page?.createdTime || properties['Created time'] || '',
    templateKey: '',
    templateName: '',
    sections: [],
    attachments: [],
    description: '',
    sourceType: 'notion',
  };
}

export function groupCardsByStatus(cards) {
  const groups = Object.fromEntries(DEVELOPMENT_STATUSES.map((status) => [status, []]));
  for (const card of cards) {
    const key = DEVELOPMENT_STATUSES.includes(card.status) ? card.status : 'Not started';
    groups[key].push(card);
  }
  return groups;
}

export function filterCardsByPlatform(cards, platform) {
  if (!platform || platform === 'all') return cards;
  return cards.filter((card) => card.platforms.includes(platform));
}
