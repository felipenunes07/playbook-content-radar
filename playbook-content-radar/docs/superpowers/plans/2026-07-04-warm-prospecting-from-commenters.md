# Plano — Prospecção quente a partir de quem comenta nos posts

> Origem: reunião Victor + Felipe (transcrição 2026-07-04).
> Objetivo do Victor: transformar quem comenta nos posts do LinkedIn em leads
> qualificados e prospectados **em ~10 min/semana**, sem contratar SDR. Prospecção
> "quente" (a pessoa comentou dias antes num post nosso), não fria de ferramenta.

---

## 1. O que o Victor pediu (resumo fiel da reunião)

Fluxo desejado, na ordem que ele descreveu:

1. **Na tabela de posts** (a que já existe, seção "Posts"), cada post ganha:
   - Um botão **"Prospectar"** (rodar o fluxo). Fica sempre disponível; só roda quando clicado. Posts que ele não quiser prospectar ficam ali como histórico, sem rodar.
   - Colunas de números que ficam com **"—" enquanto não roda** e se preenchem depois:
     - **Total de comentários** do post.
     - **Total de leads** (= nº de comentaristas do post).
     - **Oportunidades** = leads menos quem já está no banco (já prospectado antes).
     - **Novos qualificados** = quantos entraram novos e passaram no filtro.
   - "Pode levar bons minutos rodando se o post for grande" → depois carrega os dados.

2. **O processo** (backend), ao clicar:
   - Extrai os comentários do post.
   - Deduplica contra o banco (o "de-para" pra saber se já falamos com o cara).
   - Salva **todos** os novos (mesmo os não-qualificados existem no banco só pra cruzar depois — ex.: "esses 700 eu não preciso ver, só precisam existir pra cruzar").
   - Faz **scrape do profile** da pessoa **e da company** (Victor: "faz os dois, já enriquece completo").
   - **Filtra** o que retorna e passa **só o relevante** pra um agente de IA qualificar (não jogar tudo → economiza janela de contexto).

3. **Critério de qualificação** (pra treinar o agente):
   - **Cargo**: só cargo alto — C-level, gerência, diretoria. Cortar vendedor/estagiário/baixo.
   - **Área**: preferir Marketing, Vendas, Operações. Evitar Financeiro, RH/"regar".
   - **Porte da empresa**: **200+ colaboradores** no começo (talvez subir pra 2k+; ambicioso, quer falar com os grandes também).
   - **Faturamento**: difícil de obter → estimado, "nice to have".
   - Edge case citado: pessoa **desempregada** → às vezes não vem company, ou vem uma company **do passado** e qualifica errado. Precisa tratar (depende do actor/payload — "tem que fazer um estudo").

4. **Lista de leads** (novo menu "Lista"/"Prospecção"):
   - Mostra os leads (foco nos **novos** — ex.: 15–50 novos por semana; os antigos ficam no banco só pra cruzar).
   - Por lead: um botão **"Gerar mensagem"** → mensagem personalizada de 1º contato.
     - Por ora usa **a mensagem que o Victor já tem no WhatsApp** (ele vai me passar o texto/ângulo).
     - No futuro: escolher **ângulos/mensagens diferentes** pra testar (não automatizar isso agora).
   - Um **checkbox "Prospectado"** (manual). Victor quer poder escrever ele mesmo e só marcar como prospectado — **não** enviar automático agora ("quero às vezes ir lá e escrever na minha mão").

5. **Fora de escopo agora** (Victor foi explícito):
   - Envio automático da DM / webhook / agente respondendo conversas no WhatsApp → **futuro**.
   - Botão "geral" (prospectar todos os posts de uma vez) → desejável, mas v1 pode ser por post.

---

## 2. Como isso encaixa no que já existe

- **Front**: `src/contentMetrics/ContentMetricsWorkspace.jsx` (seções via `METRICS_SECTIONS` em `routes.js`), tabela de posts em `components.jsx` → `OperationalPostsTable` / `PostsSection`. Dados carregados por `repository.js` (`loadContentMetrics`, lê views do Supabase, com fallback local).
- **Back**: Edge Functions Deno em `supabase/functions/*`, helper `_shared/apify.ts` (`runActor` com orçamento de tempo), `_shared/server.ts` (`adminClient`, `startRun/finishRun`, `requireCollectorSecret`), padrão de LLM em `classify-content` (usa `CLASSIFICATION_API_KEY`/`CLASSIFICATION_MODEL`).
- **Actors Apify já em uso** (ver memória `collectors-ops-playbook`): posts `harvestapi/linkedin-post-search`; perfil em lote `apimaestro/linkedin-profile-batch-scraper-no-cookies-required`.
- **Reaproveitar**: o padrão `runActor` + `startRun/finishRun` + upsert com `onConflict`, e o padrão de invocação do front (`client.functions.invoke(...)`, ver `InstagramSection.pullNow`).
- **Novidade real**: (a) raspar **comentários** de um post (actor novo, a validar); (b) raspar **company**; (c) agente de **qualificação**; (d) **gerador de mensagem**; (e) modelo de dados de **leads**; (f) UI de prospecção. Este repo hoje é só métricas de conteúdo (memória `content-radar-has-no-ghl-integration`) — isto adiciona a primeira camada "comercial".

---

## 3. Arquitetura proposta

### 3.1. Modelo de dados (nova migration `supabase/migrations/2026070xxxxx_prospecting.sql`)

- **`prospecting_jobs`** — 1 linha por clique no botão de um post (ou "geral" no futuro).
  `id, post_id (fk content_posts), status (running/success/partial/failed), total_comments,
  total_leads, opportunities, new_qualified, started_at, finished_at, error_message, raw jsonb`.
- **`leads`** — banco de pessoas. **Dedup por `public_identifier`** (o slug do /in/). Campos:
  `id, public_identifier (unique), profile_url, full_name, headline, job_title, seniority,
  area (marketing/vendas/ops/financeiro/rh/outro), company_name, company_url,
  company_size, company_revenue_estimated, location,
  qualification_status (pending/qualified/disqualified), qualification_reason,
  enrichment_status (pending/enriched/error), profile_raw jsonb, company_raw jsonb,
  first_seen_post_id, created_at, updated_at`.
- **`lead_comments`** — 1 linha por (post, lead): o rastro do "de-para".
  `id, post_id, lead_id, comment_text, commented_at, unique(post_id, lead_id)`.
- **`lead_outreach`** — estado de prospecção por lead (mantido separado pra permitir várias abordagens depois).
  `id, lead_id, generated_message text, angle text, status (new/prospected/replied),
  prospected_at, channel (linkedin/whatsapp), created_at`.
- **View `v_post_prospecting_stats`** — agrega por `post_id`: nº comentários, nº leads,
  oportunidades (leads cujo `created_at` do lead == deste job, i.e. novos), novos qualificados.
  Alimenta as colunas da tabela de posts.
- RLS no mesmo padrão das outras tabelas (select pra anon/authenticated; escrita só via service role nas functions).

### 3.2. Backend (Edge Functions)

**Problema de tempo/custo (crítico):** um post grande (700 comentários) fazendo profile+company
por pessoa estoura o limite de parede (~400s) e fica caro. Solução em **duas fases**:

1. **`prospect-post`** (rápido, síncrono) — `{ postId }`:
   - Roda **1 actor de comentários** no `post_url` → lista de comentaristas (nome, profile_url, headline se vier, texto).
   - Salva tudo em `lead_comments` + cria/atualiza `leads` básicos (dedup por `public_identifier`), marcando novos como `enrichment_status='pending'`.
   - Calcula e grava as contagens no `prospecting_jobs` (comentários, leads, oportunidades = novos).
   - **Não** enriquece aqui. Retorna rápido pro front já mostrar os números.
2. **`enrich-leads`** (worker em lote, re-invocável / cron) — processa N leads `pending`:
   - **Pré-filtro barato por cargo** usando o `headline` que já veio do comentário (se o actor de comentários trouxer headline). Só quem passa no cargo alto vai pro scrape caro de profile+company. Isso corta custo de Apify drasticamente. *(Se o actor de comentários não trouxer headline, este pré-filtro cai e enriquecemos todos os novos — decisão a validar no estudo do payload.)*
   - Scrape **profile** (`apimaestro/...` já usado) + **company**.
   - **Trata desempregado**: se profile sem empresa atual → não puxar company do passado; marcar `company_size=null` e deixar o agente decidir com o que há (nunca qualificar por empresa antiga).
   - Monta um **payload enxuto** (só cargo, área inferida, empresa atual, porte, localização) e chama o **agente de qualificação** (LLM, padrão `classify-content`): retorna `qualification_status` + `reason`, aplicando as regras (cargo alto, área comercial, 200+ colab).
   - Atualiza `leads`. Atualiza `new_qualified` do job.

3. **`generate-lead-message`** — `{ leadId, angle? }`:
   - LLM + template do Victor + dados enxutos do lead + gancho do post que ele comentou → mensagem de 1º contato personalizada. **Só gera, não envia.** Grava em `lead_outreach.generated_message`.

Todas seguem o padrão `requireCollectorSecret` + `startRun/finishRun` + orçamento de tempo do `_shared/apify.ts`.

### 3.3. Frontend

- **Nova seção** em `routes.js` `METRICS_SECTIONS`: `{ id: 'prospecting', label: 'Prospecção', ... }` + ícone.
- **Tabela de posts** (`OperationalPostsTable` / `PostsSection`): adicionar colunas Comentários / Leads / Oportunidades / Novos qualificados (mostram "—" sem job) + botão **"Prospectar"** por linha que chama `prospect-post` e faz poll do `prospecting_jobs` (spinner "Rodando…" → carrega números). Reaproveita o padrão de `InstagramSection.pullNow`.
- **Seção "Prospecção"**: tabela de leads (default: só `qualified` novos), colunas nome/cargo/área/empresa/porte/motivo/link, botão **"Gerar mensagem"** (abre modal com o texto, botão copiar) e **checkbox "Prospectado"** (grava `lead_outreach.status`). Filtro pra ver antigos/desqualificados quando quiser.
- `repository.js`: adicionar leitura das novas views/tabelas em `loadContentMetrics` (com fallback vazio no modo offline).

---

## 4. Decisões fechadas + em aberto

**Fechado (2026-07-04):**
- **Fonte = híbrido**: Apify pro scrape em massa (comentários, profile, company) — barato e sem risco da conta real; **Unipile só pro envio de DM na Fase 4** (conta logada).
- **v1 = só por post**: um botão "Prospectar" por linha. Botão "geral" fica pra Fase 4.

**Ainda a estudar:**
1. **Actor de comentários do LinkedIn** — qual retorna profile_url + (idealmente) headline de cada comentarista? Isso define se dá pra fazer o pré-filtro barato por cargo. → **estudo do payload** antes de fechar.
2. **Custo por post** — pay-per-result da Apify: dedupe contra o banco **antes** de enriquecer + pré-filtro por cargo são as duas alavancas. Confirmar teto aceitável por post.
3. **Critérios como config** — deixar cargo/área/porte (200+ vs 2k+) em uma tabela/`settings` editável, já que Victor quer ajustar ("se vier pouca gente, baixa; se vier muito lixo, aperta").

## 5. O que ainda preciso de você (Victor)

- O **texto/ângulo da mensagem** do WhatsApp que você já usa (pro `generate-lead-message`).

## 6. Fatiamento sugerido (entregas incrementais)

- **Fase 1 — Extração + banco + números na tabela**: migration + `prospect-post` (só comentários/dedup) + colunas e botão na tabela de posts. Já entrega o "quantos leads/oportunidades por post".
- **Fase 2 — Enriquecimento + qualificação**: `enrich-leads` (profile+company, pré-filtro, agente) + coluna "novos qualificados".
- **Fase 3 — Lista + mensagem**: seção "Prospecção", `generate-lead-message`, checkbox prospectado.
- **Fase 4 (futuro)**: botão "geral", múltiplos ângulos, envio via Unipile, automação de WhatsApp.
