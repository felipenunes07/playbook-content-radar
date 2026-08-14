// Mapeamento post -> formulário do Tally.
//
// O vínculo já existia implícito no banco: content_posts.cta_keyword é a palavra que
// a pessoa comenta pra receber o material, e ela corresponde ao lead magnet. Os
// mesmos códigos aparecem em lead_magnet_bookings.lead_magnet ('OS', 'MCP'), o que
// confirma a convenção. Em vez de mapear 253 posts na mão, semeamos daqui.
//
// Só entram pares inequívocos. Códigos ambíguos (ex.: 'MAPS' e 'MAPA' com dois
// formulários de Google Maps; 'ASSISTENTE' com dois formulários de assistente) ficam
// de fora de propósito: o vínculo é sinal de CONFIANÇA no matcher, então um vínculo
// errado produziria falso positivo — exatamente o que não pode acontecer. O que falta
// o time completa em post_lead_magnets, que é a fonte da verdade em produção.

export type LeadMagnetLink = { cta: string; formId: string; formName: string };

export const CTA_TO_TALLY_FORM: LeadMagnetLink[] = [
  { cta: 'OS', formId: '7RO9QA', formName: 'O Setup inicial do OS da sua empresa' },
  { cta: 'FLOW', formId: 'EkEkX4', formName: 'KipFlow - API brasileira boa de verdade' },
  { cta: 'FABLE', formId: 'kdpqLe', formName: 'Claude Flabe 5' },
  { cta: 'MCP', formId: 'jaqkJJ', formName: '18 MCPs + o guia de instalação completo' },
  { cta: 'SDR', formId: 'VLaVrE', formName: '36 Skills de SDR para Claude' },
  { cta: 'SMB', formId: 'lb1gzV', formName: 'Claude para Pequenos Negócios' },
  { cta: 'HUBSPOT', formId: 'Bz9VeR', formName: 'Pacote Claude + HubSpot (plug and play)' },
  { cta: 'PIPEDRIVE', formId: 'jazoo6', formName: 'Pacote Claude + Pipedrive (plug and play)' },
  { cta: 'PIPE', formId: 'jazoo6', formName: 'Pacote Claude + Pipedrive (plug and play)' },
  { cta: 'SPY', formId: 'wor6W1', formName: 'Espião de Anúncios' },
  { cta: 'GAMMA', formId: 'kdYjj6', formName: 'Claude + Gamma' },
  { cta: 'INSTA', formId: 'wvJKMX', formName: 'Instagram Scraper' },
  { cta: 'N8N', formId: 'nGP8rp', formName: '2200+ N8N Workflows' },
  { cta: 'COPILOTO', formId: 'GxRXQj', formName: 'Copiloto para Prospecção' },
  { cta: 'FUNIL', formId: 'rjOlql', formName: 'Funil de Conteúdo + Venda Playbook Lab' },
  { cta: 'LEADS', formId: 'mDxxlX', formName: '4000 Leads Grátis' },
  { cta: 'BETA', formId: 'mBe8YQ', formName: 'Beta, Assistente de Inbound' },
];

export function normalizeCta(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

const BY_CTA = new Map(CTA_TO_TALLY_FORM.map((link) => [normalizeCta(link.cta), link]));

/** 'Sem CTA' é o valor que o classificador grava quando o post não tem CTA — não é
 *  um código de lead magnet e nunca deve virar vínculo. */
export function formForCta(cta: unknown): LeadMagnetLink | null {
  const key = normalizeCta(cta);
  if (!key || key === 'SEMCTA') return null;
  return BY_CTA.get(key) ?? null;
}

/** Constrói post_id -> form_ids a partir dos posts, para alimentar o matcher sem
 *  depender da tabela ainda estar populada. */
export function buildPostFormMap(posts: Array<{ id: string; cta_keyword?: string | null }>) {
  const map = new Map<string, string[]>();
  for (const post of posts) {
    const link = formForCta(post.cta_keyword);
    if (link) map.set(post.id, [link.formId]);
  }
  return map;
}
