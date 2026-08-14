// Normalização de identidade de pessoa, no mesmo idioma do company.ts: funções puras,
// sem I/O, que geram chaves de lookup em ordem decrescente de confiança.
//
// O lado do LinkedIn e o lado do Tally sujam o nome de formas diferentes:
// - LinkedIn: "Junior Bispo | Procurement", emojis, títulos ("Dr.", "MBA")
// - Tally: caixa aleatória, espaço sobrando, acento, e-mail digitado no campo de nome
// Por isso os dois passam pelo mesmo normalizador antes de qualquer comparação.

function clean(value: unknown) {
  return String(value ?? '').trim();
}

// Partículas de sobrenome composto. Removidas das chaves porque quem preenche
// formulário escreve "Samuel da Silva" ou "Samuel Silva" indiferentemente.
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del', 'la', 'van', 'von', 'y']);

// Títulos e certificações que aparecem colados no nome do LinkedIn.
const TITLES = /\b(dr|dra|eng|engo|prof|profa|mba|phd|msc|bsc|cfa|pmp|cpa|sr|jr|junior|filho|neto)\b\.?/gi;

export function stripProfileNoise(value: unknown) {
  return clean(value)
    // "Junior Bispo | Procurement" / "Ana Costa - CEO" / "Léo Silva (Playbook)"
    .split(/[|·•—–,(/\\]/)[0]
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/["'`´^~]/g, ' ')
    .trim();
}

export function normalizePersonName(value: unknown) {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Tokens significativos do nome, já sem partículas nem títulos. É a base de todas as
// chaves: comparar arrays de token evita depender da ordem em que a pessoa digitou.
export function nameTokens(value: unknown) {
  const withoutTitles = normalizePersonName(stripProfileNoise(value)).replace(TITLES, ' ');
  return normalizePersonName(withoutTitles)
    .split(' ')
    .filter((token) => token && token.length > 1 && !PARTICLES.has(token));
}

// Chave forte: todos os tokens em ordem. "lucas brito oliveira" != "lucas oliveira".
export function fullNameKey(value: unknown) {
  return nameTokens(value).join(' ');
}

// Chave fraca: primeiro + último token. Junta "Lucas Oliveira" com
// "LUCAS BRITO DE OLIVEIRA" — serve para GERAR candidato, nunca para decidir.
export function firstLastKey(value: unknown) {
  const tokens = nameTokens(value);
  if (!tokens.length) return '';
  if (tokens.length === 1) return tokens[0];
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

// Quantos tokens o nome tem. Nome de 2 tokens colide muito em português
// ("joao silva"); a partir de 3 a colisão é rara. O matcher usa isso para decidir
// se o nome sozinho basta como evidência.
export function nameSpecificity(value: unknown) {
  return nameTokens(value).length;
}

// Lixo de formulário: campo com 1-2 caracteres, nome igual ao sobrenome, ou texto
// de teste. Medido no CSV real: "X"/"X", "Q"/"Q", "Jo"/"Jo", "Ko"/"Ko", "NF"/"F".
export function isJunkName(first: unknown, last: unknown) {
  const f = clean(first);
  const l = clean(last);
  if (!f && !l) return true;
  // E-mail digitado no campo de nome OU de sobrenome. Caso real medido no export:
  // Nome="Daniel", Sobrenome="sdaniel22.ds@gmail.com".
  if (/@/.test(f) || /@/.test(l)) return true;
  if (f.replace(/\s/g, '').length <= 2 && l.replace(/\s/g, '').length <= 2) return true;
  if (normalizePersonName(f) && normalizePersonName(f) === normalizePersonName(l)) return true;
  if (/\b(teste|test|asdf|qwer)\b/i.test(`${f} ${l}`)) return true;
  const tokens = nameTokens(`${f} ${l}`);
  return tokens.length === 0;
}

export function emailDomain(value: unknown) {
  const email = clean(value).toLowerCase();
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1);
}

// Provedores pessoais. Um domínio fora desta lista é sinal de empresa e serve para
// corroborar identidade contra o company_name/company_url do lead.
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br',
  'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'mac.com',
  'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
  'proton.me', 'protonmail.com', 'tuta.io', 'tutanota.com', 'zoho.com', 'aol.com',
  'sapo.pt', 'gmx.com', 'yandex.com', 'mail.com', 'edu.br', 'usp.br',
]);

export function isCorporateEmail(value: unknown) {
  const domain = emailDomain(value);
  if (!domain || !domain.includes('.')) return false;
  if (CONSUMER_DOMAINS.has(domain)) return false;
  // Subdomínio de provedor pessoal também não conta.
  return ![...CONSUMER_DOMAINS].some((consumer) => domain.endsWith(`.${consumer}`));
}

// Telefone para E.164. O Tally já entrega "+5511992946933", mas CSV antigo e
// digitação manual trazem "(11) 99294-6933" — assumimos Brasil quando não há DDI.
export function phoneE164(value: unknown) {
  const raw = clean(value);
  if (!raw) return '';
  const hasPlus = raw.trimStart().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (!hasPlus) {
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;          // DDD + número
    else if (digits.length === 12 || digits.length === 13) { /* já tem DDI */ }
    else if (digits.length === 8 || digits.length === 9) return '';                    // sem DDD, inútil
  }
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length < 10 || digits.length > 15) return '';
  return `+${digits}`;
}

// Domínio do e-mail bate com a empresa do lead? Compara o rótulo do domínio com os
// tokens do nome da empresa e com o host do company_url.
export function emailMatchesCompany(email: unknown, companyName: unknown, companyUrl: unknown) {
  if (!isCorporateEmail(email)) return false;
  const domain = emailDomain(email);
  const label = domain.split('.')[0];
  if (!label || label.length < 3) return false;

  const urlHost = clean(companyUrl).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (urlHost && (urlHost === domain || urlHost.endsWith(`.${domain}`) || domain.endsWith(`.${urlHost}`))) return true;

  const companyKey = normalizePersonName(companyName).replace(/\s+/g, '');
  if (!companyKey) return false;
  return companyKey.includes(label) || label.includes(companyKey);
}
