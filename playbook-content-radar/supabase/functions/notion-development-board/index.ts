import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { adminClient, corsHeaders, json } from '../_shared/server.ts';

const VICTOR_PAGE_URL = 'https://app.notion.com/p/playbooklab/Plan-create-track-your-content-2dbf8d62b79a80398426e2d064f1889f';
const VICTOR_DATABASE_ID = '2dbf8d62b79a8114bb6eed2ec507e33d';
const VICTOR_DATA_SOURCE_ID = '2dbf8d62-b79a-8180-9383-000b7d8a58f7';
const OWNER_NAME = 'Victor Baggio';
const FELIPE_PROPERTY = '\u{1F3AF} Felipe';

const PRODUCTION_TEMPLATES: Record<string, {
  name: string;
  platform: string;
  campaign: string;
  sections: Array<{ title: string; prompt: string; done: boolean }>;
}> = {
  linkedin_post: {
    name: 'New LinkedIn Post',
    platform: 'LinkedIn',
    campaign: 'Editorial',
    sections: [
      { title: 'Explicacao', prompt: 'Qual ponto de vista esse post precisa defender?', done: false },
      { title: 'Hook', prompt: 'Primeira linha com tensao, promessa ou contraste.', done: false },
      { title: 'Texto', prompt: 'Rascunho do post em linguagem natural.', done: false },
      { title: 'CTA', prompt: 'Proxima acao esperada: comentar, baixar, responder ou agendar.', done: false },
      { title: 'Materiais', prompt: 'Prints, links, provas e referencias usados no post.', done: false },
    ],
  },
  lead_magnet_post: {
    name: 'New Lead Magnet Post',
    platform: 'LinkedIn',
    campaign: 'Lead Magnet',
    sections: [
      { title: 'Oferta', prompt: 'O que a pessoa recebe e por que vale pedir acesso.', done: false },
      { title: 'Dor', prompt: 'Problema concreto que o lead magnet resolve.', done: false },
      { title: 'Prova', prompt: 'Resultado, exemplo, print ou caso que sustenta a promessa.', done: false },
      { title: 'Post', prompt: 'Texto final do LinkedIn com CTA claro.', done: false },
      { title: 'Entrega', prompt: 'Link, arquivo, automacao ou fluxo de resposta.', done: false },
    ],
  },
  youtube_video: {
    name: 'New YouTube Video',
    platform: 'YouTube',
    campaign: 'Video',
    sections: [
      { title: 'Explicacao', prompt: 'Ideia central, publico e promessa do video.', done: false },
      { title: 'Script', prompt: 'Abertura, blocos principais, exemplos e fechamento.', done: false },
      { title: 'Materiais de Apoio/Descricao', prompt: 'Links, capitulos, descricao, exemplos e arquivos usados.', done: false },
      { title: 'Titulo e Thumbnail', prompt: 'Opcoes de titulo, thumbnail e angulo de curiosidade.', done: false },
      { title: 'Checklist de Publicacao', prompt: 'Descricao, tags, cards, tela final e link de CTA.', done: false },
    ],
  },
};

function plainText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join('');
  if (value.plain_text) return value.plain_text;
  if (value.text?.content) return value.text.content;
  if (value.title) return plainText(value.title);
  if (value.rich_text) return plainText(value.rich_text);
  return '';
}

function multiSelectNames(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => item?.name || item).filter(Boolean);
  if (Array.isArray(value.multi_select)) return value.multi_select.map((item: any) => item?.name).filter(Boolean);
  return [];
}

function selectName(value: any): string {
  if (!value) return '';
  return value.status?.name || value.select?.name || value.name || '';
}

function dateStart(value: any): string | null {
  if (!value) return null;
  const start = value.date?.start || value.start || value;
  return typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return String(record.message || record.error_description || record.error || record.details || JSON.stringify(record));
  }
  return String(error);
}

function sourceIds() {
  return {
    databaseId: Deno.env.get('NOTION_VICTOR_CONTENT_DATABASE_ID') || VICTOR_DATABASE_ID,
    dataSourceId: Deno.env.get('NOTION_VICTOR_CONTENT_DATA_SOURCE_ID') || VICTOR_DATA_SOURCE_ID,
  };
}

async function notionRequest(path: string, notionVersion: string, body: Record<string, unknown>) {
  const token = Deno.env.get('NOTION_TOKEN');
  if (!token) throw new Error('NOTION_TOKEN missing');

  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': notionVersion,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Notion HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function queryAllVictorCalendarPages() {
  const { dataSourceId, databaseId } = sourceIds();
  const results: any[] = [];
  let startCursor: string | null = null;
  let useLegacyDatabaseQuery = false;

  while (true) {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ property: 'Publish Date', direction: 'ascending' }],
      ...(startCursor ? { start_cursor: startCursor } : {}),
    };

    let payload: any;
    if (!useLegacyDatabaseQuery) {
      try {
        payload = await notionRequest(`data_sources/${dataSourceId}/query`, '2025-09-03', body);
      } catch (error) {
        console.warn('Data source query failed; trying legacy database query:', error);
        useLegacyDatabaseQuery = true;
      }
    }

    if (useLegacyDatabaseQuery) {
      payload = await notionRequest(`databases/${databaseId}/query`, '2022-06-28', body);
    }

    results.push(...(payload.results || []));
    if (!payload.has_more || !payload.next_cursor) break;
    startCursor = payload.next_cursor;
  }

  return results;
}

function notionPageToRow(page: any) {
  const properties = page.properties || {};

  return {
    notion_page_url: page.url,
    owner_name: OWNER_NAME,
    title: plainText(properties.Title) || plainText(properties.Name) || 'Sem titulo',
    platforms: multiSelectNames(properties.Platform),
    status: selectName(properties['Status ']) || selectName(properties.Status) || 'Not started',
    publish_date: dateStart(properties['Publish Date']),
    campaigns: multiSelectNames(properties.Campaign),
    performance: selectName(properties.Performance) || null,
    content_url: properties['URL/Link']?.url || null,
    assigned_to_felipe: properties[FELIPE_PROPERTY]?.checkbox === true,
    notion_created_time: page.created_time || null,
    last_synced_at: new Date().toISOString(),
    raw_properties: properties,
  };
}

async function listSnapshotRows(client: any) {
  const { data, error } = await client
    .from('notion_content_items')
    .select('*')
    .eq('owner_name', OWNER_NAME)
    .order('publish_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({ ...row, source: 'supabase' }));
}

async function listProductionRows(client: any) {
  const { data, error } = await client
    .from('content_production_items')
    .select('*')
    .eq('owner_name', OWNER_NAME)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({ ...row, source: 'production_item' }));
}

async function createProductionItem(client: any, payload: Record<string, any>) {
  const templateKey = String(payload.templateKey || '');
  const template = PRODUCTION_TEMPLATES[templateKey];
  if (!template) throw new Error('Template invalido');

  const title = String(payload.title || '').trim() || template.name;
  const { data, error } = await client
    .from('content_production_items')
    .insert({
      owner_name: OWNER_NAME,
      title,
      platform: template.platform,
      template_key: templateKey,
      template_name: template.name,
      status: 'Not started',
      campaign: template.campaign,
      assigned_to_felipe: Boolean(payload.assignedToFelipe),
      sections: template.sections,
      source: 'system',
    })
    .select('*')
    .single();

  if (error) throw error;
  return { ...data, source: 'production_item' };
}

async function updateProductionItem(client: any, payload: Record<string, any>) {
  const id = String(payload.id || '');
  if (!id) throw new Error('id obrigatorio');

  const updates: Record<string, unknown> = {};
  if (typeof payload.title === 'string' && payload.title.trim()) updates.title = payload.title.trim();
  if (Array.isArray(payload.sections)) updates.sections = payload.sections;
  if (Array.isArray(payload.attachments)) updates.attachments = payload.attachments;
  if (typeof payload.status === 'string' && payload.status) updates.status = payload.status;
  if (typeof payload.description === 'string') updates.description = payload.description;
  if (typeof payload.publishDate === 'string' || payload.publishDate === null) updates.publish_date = payload.publishDate || null;
  if (typeof payload.templateKey === 'string' && PRODUCTION_TEMPLATES[payload.templateKey]) {
    const template = PRODUCTION_TEMPLATES[payload.templateKey];
    updates.template_key = payload.templateKey;
    updates.template_name = template.name;
    updates.platform = template.platform;
    updates.campaign = template.campaign;
  }

  const { data, error } = await client
    .from('content_production_items')
    .update(updates)
    .eq('id', id)
    .eq('owner_name', OWNER_NAME)
    .select('*')
    .single();

  if (error) throw error;
  return { ...data, source: 'production_item' };
}

async function promoteSnapshotItem(client: any, payload: Record<string, any>) {
  const sourceId = String(payload.id || '');
  if (!sourceId) throw new Error('id obrigatorio');

  const { data: source, error: sourceError } = await client
    .from('notion_content_items')
    .select('*')
    .eq('id', sourceId)
    .eq('owner_name', OWNER_NAME)
    .single();
  if (sourceError) throw sourceError;

  const templateKey = source.platforms?.includes('YouTube')
    ? 'youtube_video'
    : source.campaigns?.includes('Lead Magnet')
      ? 'lead_magnet_post'
      : 'linkedin_post';
  const template = PRODUCTION_TEMPLATES[templateKey];

  const { data, error } = await client
    .from('content_production_items')
    .upsert({
      owner_name: OWNER_NAME,
      notion_source_id: source.id,
      title: source.title,
      platform: template.platform,
      template_key: templateKey,
      template_name: template.name,
      status: source.status || 'Not started',
      publish_date: source.publish_date,
      campaign: source.campaigns?.[0] || template.campaign,
      content_url: source.content_url,
      assigned_to_felipe: Boolean(source.assigned_to_felipe),
      sections: template.sections,
      source: 'notion_import',
    }, { onConflict: 'notion_source_id' })
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, source: 'production_item' };
}

async function uploadAttachment(client: any, payload: Record<string, any>) {
  const itemId = String(payload.id || '');
  const mimeType = String(payload.mimeType || '');
  const base64 = String(payload.base64 || '');
  if (!itemId || !base64 || !/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) throw new Error('Imagem invalida');

  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('A imagem deve ter no maximo 10 MB');
  const extension = mimeType.split('/')[1].replace('jpeg', 'jpg');
  const path = `${OWNER_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${itemId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from('content-production').upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) throw error;
  const { data } = client.storage.from('content-production').getPublicUrl(path);
  return { url: data.publicUrl, path, name: String(payload.name || `imagem.${extension}`), type: mimeType };
}

async function deleteAttachment(client: any, payload: Record<string, any>) {
  const path = String(payload.path || '');
  const ownerPrefix = `${OWNER_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
  if (!path.startsWith(ownerPrefix)) throw new Error('Caminho de anexo invalido');
  const { error } = await client.storage.from('content-production').remove([path]);
  if (error) throw error;
}

async function syncNotionIntoSupabase(client: any) {
  const pages = await queryAllVictorCalendarPages();
  const rows = pages.map(notionPageToRow).filter((row) => row.notion_page_url);

  if (!rows.length) return { syncedCount: 0 };

  const { error } = await client
    .from('notion_content_items')
    .upsert(rows, { onConflict: 'notion_page_url' });

  if (error) throw error;
  return { syncedCount: rows.length };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, error: 'Use POST' }, 405);

  try {
    const payload = await request.json().catch(() => ({}));
    const owner = payload?.owner || 'victor';
    if (owner !== 'victor') throw new Error('Por enquanto a aba esta conectada apenas ao calendario do Victor');

    const client = adminClient();

    if (payload?.action === 'create_item') {
      const item = await createProductionItem(client, payload);
      return json({ success: true, item });
    }

    if (payload?.action === 'update_item') {
      const item = await updateProductionItem(client, payload);
      return json({ success: true, item });
    }

    if (payload?.action === 'promote_item') {
      const item = await promoteSnapshotItem(client, payload);
      return json({ success: true, item });
    }

    if (payload?.action === 'upload_attachment') {
      const attachment = await uploadAttachment(client, payload);
      return json({ success: true, attachment });
    }

    if (payload?.action === 'delete_attachment') {
      await deleteAttachment(client, payload);
      return json({ success: true });
    }

    let mode = 'supabase_snapshot';
    let warning = '';
    let syncedCount = 0;

    if (Deno.env.get('NOTION_TOKEN')) {
      try {
        const sync = await syncNotionIntoSupabase(client);
        syncedCount = sync.syncedCount;
        mode = 'notion_synced_snapshot';
      } catch (error) {
        warning = `Nao consegui sincronizar com o Notion agora; mostrando snapshot salvo. ${errorMessage(error)}`;
      }
    } else {
      warning = 'NOTION_TOKEN nao configurado no Supabase; mostrando somente o snapshot salvo no nosso banco.';
    }

    const productionItems = await listProductionRows(client);
    const snapshotItems = await listSnapshotRows(client);
    const promotedSourceIds = new Set(productionItems.map((item: any) => item.notion_source_id).filter(Boolean));
    const items = [...productionItems, ...snapshotItems.filter((item: any) => !promotedSourceIds.has(item.id))];
    return json({
      success: true,
      warning,
      templates: Object.entries(PRODUCTION_TEMPLATES).map(([key, template]) => ({
        key,
        name: template.name,
        platform: template.platform,
        campaign: template.campaign,
        sections: template.sections,
      })),
      source: {
        owner: OWNER_NAME,
        pageUrl: VICTOR_PAGE_URL,
        dataSourceId: sourceIds().dataSourceId,
        mode,
        syncedCount,
      },
      items,
    });
  } catch (error) {
    return json({ success: false, error: errorMessage(error) }, 500);
  }
});
