// Provedores de LLM no formato OpenAI Chat Completions.
//
// Ordem: PRINCIPAL (OpenAI, secrets CLASSIFICATION_*) e, se configurado, RESERVA
// (Gemini, secrets CLASSIFICATION_FALLBACK_*). Se o principal falhar por qualquer
// motivo — quota/billing, 5xx, rate limit, resposta vazia — o fluxo cai no reserva
// automaticamente, sem interromper a operação. Se só o principal estiver
// configurado, o comportamento é idêntico ao de antes (um provedor só).
export interface LlmProvider {
  url: string;
  apiKey: string;
  model: string;
  label: string;
}

const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export function classificationProviders(): LlmProvider[] {
  const providers: LlmProvider[] = [];
  const key = Deno.env.get('CLASSIFICATION_API_KEY');
  const model = Deno.env.get('CLASSIFICATION_MODEL');
  if (key && model) {
    providers.push({ url: Deno.env.get('CLASSIFICATION_API_URL') || DEFAULT_OPENAI_URL, apiKey: key, model, label: 'principal' });
  }
  const fallbackKey = Deno.env.get('CLASSIFICATION_FALLBACK_API_KEY');
  const fallbackModel = Deno.env.get('CLASSIFICATION_FALLBACK_MODEL');
  if (fallbackKey && fallbackModel) {
    providers.push({ url: Deno.env.get('CLASSIFICATION_FALLBACK_API_URL') || DEFAULT_GEMINI_URL, apiKey: fallbackKey, model: fallbackModel, label: 'reserva' });
  }
  return providers;
}

export function requireClassificationProviders(): LlmProvider[] {
  const providers = classificationProviders();
  if (!providers.length) throw new Error('CLASSIFICATION_API_KEY e CLASSIFICATION_MODEL são obrigatórios');
  return providers;
}

export function llmHeaders(provider: LlmProvider): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` };
}

// Extrai o texto da resposta (formato OpenAI: choices[0].message.content; alguns
// endpoints devolvem output_text). Lança se vier vazio.
export function llmContent(body: Record<string, any>): string {
  const content = body?.choices?.[0]?.message?.content || body?.output_text;
  if (!content) throw new Error('Modelo não retornou conteúdo');
  return String(content);
}

// Igual ao llmContent, mas já faz o JSON.parse tolerando cercas ```json.
export function parseLlmJson(body: Record<string, any>): Record<string, any> {
  return JSON.parse(llmContent(body).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

// Roda `attempt(provider)` no principal e, se lançar, tenta o próximo provedor.
// Só relança o erro do ÚLTIMO provedor — assim quem chama mantém sua própria
// semântica de erro (ex.: RateLimitError no último provedor volta o lead pra fila).
export async function withLlmFallback<T>(
  providers: LlmProvider[],
  attempt: (provider: LlmProvider) => Promise<T>,
  onFallback?: (provider: LlmProvider, error: unknown) => void,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < providers.length; i += 1) {
    try {
      return await attempt(providers[i]);
    } catch (error) {
      lastError = error;
      if (i === providers.length - 1) throw error;
      onFallback?.(providers[i], error);
    }
  }
  throw lastError;
}
