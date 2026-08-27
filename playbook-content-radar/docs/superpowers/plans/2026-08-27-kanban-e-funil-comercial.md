# Plano — Kanban de acompanhamento + aba Funil

> Origem: pedido do Felipe (27/08/2026), revisado no mesmo dia com as decisões dele.
> Objetivo: hoje a prospecção **termina** no checkbox "Prospectado" da aba Leads ICP.
> Depois dali não existe registro nenhum de follow-up — ninguém sabe quem foi tocado
> uma vez e nunca mais. Duas abas novas fecham o buraco: um **Kanban** que recebe o
> lead no momento em que ele é selecionado para a operação comercial, e um **Funil**
> que mede volume, conversão e tempo entre etapas.

---

## 1. A correção que reorganiza o plano

**Marcar "Prospectado" não significa que o 1º contato foi feito.** Significa que o
lead foi **selecionado para entrar na operação comercial**. Ele nasce no Kanban
*aguardando* o primeiro contato.

Isso tem três consequências que atravessam o resto do documento:

1. A primeira coluna é **A prospectar**, não "1º contato". O card entra nela vazio de
   toques.
2. O funil ganha uma etapa que não existia na versão anterior: **Prospectados**
   (selecionados) e **Contatados** (1º toque saiu) são números **diferentes**. A
   distância entre os dois é exatamente o vazamento que ninguém enxerga hoje —
   gente escolhida a dedo que nunca recebeu mensagem.
3. Marcar "Prospectado" **não** cria touchpoint. Touchpoint só nasce de contato real.

---

## 2. O que existe hoje (e por que não basta)

| Peça | Onde | O que guarda |
|---|---|---|
| Fila do SDR | aba **Leads ICP** (`mode="leads"`) | leads aprovados no ICP, com mensagem gerada |
| Checkbox "Prospectado" | `ContentMetricsWorkspace.jsx:2765` → `setOutreachStatus` | grava em `lead_outreach` |
| Estado da prospecção | tabela `lead_outreach` | **uma linha por lead**: `status`, `prospected_at`, `generated_message` |
| Veredito por ICP | `lead_qualifications` | tem `decided_at` — serve de marco "aprovado no ICP" |

`lead_outreach` é um **estado**, não um histórico. Responde "foi prospectado?" e nada
mais: não sabe quantos toques houve, quando foi o último, se voltou resposta, nem
quem tocou. E o checkbox é toggle — desmarcar zera o `prospected_at`, o único dado de
data que existe hoje.

Frequência de contato é uma **série de eventos**; conversão entre etapas é uma
**série de marcos datados**. Nenhum dos dois cabe numa coluna `status`.

---

## 3. Modelo de dados

Três tabelas + uma de configuração. A separação é a decisão central:

- **`lead_touchpoints`** — cada contato real, um registro. Daqui sai a frequência.
- **`lead_stage_events`** — cada movimentação de etapa, com data/hora. Daqui sai a
  conversão e o tempo entre etapas.
- **`lead_pipeline`** — o estado atual do card (onde está agora, de quem é, quando é
  o próximo toque). É um cache navegável dos dois anteriores.
- **`pipeline_settings`** — a cadência, configurável. Nada de 3 toques hardcoded.

```sql
-- ── Estado atual do card. 1 linha por lead. ──────────────────────────────────
create table public.lead_pipeline (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  stage text not null default 'a_prospectar' check (stage in (
    'a_prospectar', 'em_cadencia', 'respondeu', 'reuniao',
    'proposta', 'cliente', 'perdido'
  )),
  icp_id uuid references public.icp_profiles(id) on delete set null, -- ICP de origem
  owner text,                 -- responsável (Victor / Fernando / …). Filtro do board.
  campaign text,              -- ver §8: ainda não é derivável, nasce editável
  next_action_at date,        -- quando é o próximo toque (auto pela cadência, editável)
  lost_reason text,           -- preenchido ao cair em 'perdido'
  archived_at timestamptz,    -- saiu da operação ativa SEM apagar histórico (§6)
  archive_reason text,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lead_pipeline_board_idx on public.lead_pipeline (stage, next_action_at)
  where archived_at is null;
create index lead_pipeline_owner_idx on public.lead_pipeline (owner) where archived_at is null;

-- ── Cada contato real, um registro. Nunca é apagado. ─────────────────────────
create table public.lead_touchpoints (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),  -- 'in' = a pessoa respondeu
  channel text not null default 'linkedin'
    check (channel in ('linkedin', 'whatsapp', 'email', 'call')),
  touch_number integer,       -- 1, 2, 3… entre os 'out'. Null nos 'in'.
  touched_at timestamptz not null default now(),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index lead_touchpoints_lead_idx on public.lead_touchpoints (lead_id, touched_at desc);

-- ── Auditoria de etapa: é isto que o Funil lê pra calcular conversão. ────────
create table public.lead_stage_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_stage text,            -- null na entrada no board
  to_stage text not null,
  occurred_at timestamptz not null default now(),
  actor text,                 -- quem moveu
  note text
);
create index lead_stage_events_lead_idx on public.lead_stage_events (lead_id, occurred_at);
create index lead_stage_events_stage_idx on public.lead_stage_events (to_stage, occurred_at);

-- ── Cadência configurável (linha única, padrão do prospect_settings). ────────
create table public.pipeline_settings (
  id boolean primary key default true check (id),
  cadence jsonb not null default '{
    "steps": [
      { "n": 1, "intervalo_dias": 0,  "label": "1º contato" },
      { "n": 2, "intervalo_dias": 5,  "label": "2º contato" },
      { "n": 3, "intervalo_dias": 9,  "label": "3º contato" }
    ],
    "sem_resposta_atencao_dias": 3,
    "sem_resposta_alerta_dias": 7,
    "sugerir_descarte_apos_dias": 21
  }'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.pipeline_settings (id) values (true) on conflict (id) do nothing;
```

**`intervalo_dias` conta a partir do toque anterior**, não da entrada. Se o 1º
contato atrasa três dias, o 2º não dispara junto — a cadência anda com a realidade.
Os passos do default dão **3 toques em ~14 dias**, com sugestão de descarte aos 21,
como você pediu. Trocar isso é editar uma linha de JSON, sem deploy.

> Quando a cadência precisar variar por público, o caminho é uma coluna `cadence`
> jsonb **nullable** em `icp_profiles` que sobrescreve esta. Nenhuma tabela muda.

RLS no padrão das outras: leitura pra `anon`/`authenticated`, escrita só via service
role (edge function).

**Por que não reaproveitar `lead_outreach`:** ela tem `unique (lead_id)` e um `check`
fechado de status. Enfiar as etapas lá dentro criaria duas fontes de verdade sobre
onde o lead está — a aba Leads ICP escrevendo uma e o Kanban a outra. Ela continua
sendo o que sempre foi: o registro de que a mensagem foi gerada e de que o lead foi
selecionado.

---

## 4. Kanban

### Entrada
No `setOutreachStatus(lead, 'prospected')` (edge function `lead-outreach`, ação
`set_status`), passam a acontecer três coisas:

1. `lead_outreach.status = 'prospected'` (como hoje);
2. upsert em `lead_pipeline` com `stage = 'a_prospectar'`, `icp_id` do filtro ativo,
   `next_action_at = hoje`;
3. `lead_stage_events` com `to_stage = 'a_prospectar'`.

**Nenhum touchpoint é criado.** O card nasce devendo o primeiro contato.

### Colunas
```
A prospectar → Em cadência → Respondeu → Reunião agendada → Proposta/Negociação → Cliente
                                                                        └── Perdido/Descartado
```

O **número do contato não vira coluna** — vive no card, como você pediu. Registrar um
toque num card de "A prospectar" o move sozinho para "Em cadência"; dali ele só sai
por decisão humana (ou automaticamente para "Respondeu" quando entra um touchpoint
`in`).

### O card
```
┌─────────────────────────────────────────────┐
│ Ana Souza                        [Victor]   │
│ Head de Growth · Acme (450)                 │
│ ICP comercial 200+ · post "36 Skills"       │
│─────────────────────────────────────────────│
│ ●●○  2º contato feito · 2 toques            │
│ Último: 21/08 (há 6 dias)                   │
│ Próximo: 26/08  ⚠ atrasado 1 dia            │
│ 🔴 Sem resposta há 6 dias                    │
└─────────────────────────────────────────────┘
```
Tudo que você listou está no card e sai da view, sem cálculo no front:
nº do contato atual, total de toques, último contato, próximo contato, dias sem
resposta, responsável, ICP e post de origem.

### Os estados calculados são **dois eixos**, não uma lista
Isso importa porque medem coisas diferentes e um não substitui o outro:

| Eixo | O que mede | Valores |
|---|---|---|
| **Silêncio** (culpa do lead) | dias desde o último toque `out` sem resposta | `Aguardando resposta` (< 3d) · `Sem resposta +3 dias` · `Sem resposta +7 dias` |
| **Follow-up** (culpa nossa) | `next_action_at` vs. hoje | `Em dia` · `Vence hoje` · `Follow-up atrasado` |

Os limiares de 3 e 7 dias saem de `pipeline_settings.cadence`, não de constantes.

### A fila operacional: "Precisa de contato hoje"
É o chip principal da aba, e é o eixo **follow-up** — não o de silêncio:

```
stage in ('a_prospectar','em_cadencia')
  and archived_at is null
  and not respondeu
  and (next_action_at <= current_date or next_action_at is null)
```

Card em "A prospectar" entra nessa fila desde o primeiro dia (`next_action_at = hoje`,
zero toques). É a resposta a "quem eu preciso tocar agora", que era o pedido central.

Arrastar card usa dnd-kit no padrão já existente em `TeamWorkspace.jsx` e
`NotionDevelopmentBoard.jsx`.

### Peso
O board lê só `v_lead_pipeline`, uma linha por lead **selecionado** — centenas, não
os 2.200+ de `leads`. Não repete o problema de paginação da aba Leads ICP.

---

## 5. As views

```sql
-- Cards do board: tudo pré-calculado.
create or replace view public.v_lead_pipeline with (security_invoker = true) as
select
  p.*,
  l.full_name, l.company_name, l.job_title, l.score, l.first_seen_post_id,
  t.toques, t.ultimo_toque, t.respondeu, t.primeira_resposta_em,
  case when t.respondeu then null
       else (current_date - t.ultimo_toque::date) end          as dias_sem_resposta,
  case when p.next_action_at is null then 0
       else (current_date - p.next_action_at) end              as dias_followup_atrasado
from public.lead_pipeline p
join public.leads l on l.id = p.lead_id
left join lateral (
  select
    count(*) filter (where direction = 'out')                  as toques,
    max(touched_at) filter (where direction = 'out')           as ultimo_toque,
    bool_or(direction = 'in')                                  as respondeu,
    min(touched_at) filter (where direction = 'in')            as primeira_resposta_em
  from public.lead_touchpoints t2 where t2.lead_id = p.lead_id
) t on true;

-- Funil: 1 linha por lead, os 8 marcos datados em colunas.
create or replace view public.v_lead_funnel with (security_invoker = true) as
select
  l.id as lead_id, l.first_seen_post_id,
  p.icp_id, p.owner, p.campaign, p.stage, p.archived_at,
  l.created_at            as entrou_em,
  q.aprovado_em,
  p.entered_at            as prospectado_em,
  t.contatado_em,
  t.respondeu_em,
  s.reuniao_em, s.proposta_em, s.cliente_em, s.perdido_em
from public.leads l
left join public.lead_pipeline p on p.lead_id = l.id
left join lateral (
  select min(decided_at) as aprovado_em from public.lead_qualifications q2
  where q2.lead_id = l.id and q2.status in ('qualified', 'review')
) q on true
left join lateral (
  select min(touched_at) filter (where direction = 'out') as contatado_em,
         min(touched_at) filter (where direction = 'in')  as respondeu_em
  from public.lead_touchpoints t2 where t2.lead_id = l.id
) t on true
left join lateral (
  select min(occurred_at) filter (where to_stage = 'reuniao')  as reuniao_em,
         min(occurred_at) filter (where to_stage = 'proposta') as proposta_em,
         min(occurred_at) filter (where to_stage = 'cliente')  as cliente_em,
         min(occurred_at) filter (where to_stage = 'perdido')  as perdido_em
  from public.lead_stage_events e where e.lead_id = l.id
) s on true;
```

Dois detalhes deliberados:

- **`min(occurred_at)`, não o evento mais recente.** Card que volta de "Reunião" pra
  "Em cadência" e avança de novo não perde o marco — conversão mede "chegou alguma
  vez", que é o que a taxa quer dizer.
- **`status in ('qualified','review')`** espelha o comportamento que a tela já tem
  hoje (a migration de múltiplos ICPs registra que `review` foi extinto em 05/07 e
  conta como aprovado). Se o funil contasse diferente da lista, os dois números
  brigariam na reunião.

---

## 6. Arquivar nunca apaga

Desmarcar "Prospectado" **preserva todo o histórico**:

- `lead_pipeline.archived_at = now()` + `archive_reason` → o card sai do board;
- `lead_touchpoints` e `lead_stage_events` ficam **intactos**;
- um `lead_stage_event` registra o próprio arquivamento;
- remarcar limpa `archived_at`, **mantém o `entered_at` original** e registra novo
  evento.

**"Perdido" ≠ "Arquivado"**, e a diferença é contábil:

| | Significado | No funil |
|---|---|---|
| **Perdido/Descartado** | foi trabalhado e não fechou | conta como **perda** — é denominador de conversão |
| **Arquivado** | saiu da operação (seleção errada, duplicata) | **não conta** em lugar nenhum |

Misturar os dois inflaria artificialmente a taxa de conversão.

---

## 7. Aba Funil

Volume **e** conversão, nas oito etapas:

```
Entraram → ICP aprovado → Prospectados → Contatados → Responderam → Reunião → Proposta → Cliente
```

| Etapa | Coluna da view | Automático? |
|---|---|---|
| Entraram | `entrou_em` (`leads.created_at`) | ✅ |
| ICP aprovado | `aprovado_em` (`lead_qualifications.decided_at`) | ✅ |
| Prospectados | `prospectado_em` (entrada no board) | ✅ |
| **Contatados** | `contatado_em` (1º touchpoint `out`) | ✅ |
| Responderam | `respondeu_em` (touchpoint `in`) | ⚠️ depende do board |
| Reunião | `reuniao_em` | ⚠️ manual |
| Proposta | `proposta_em` | ⚠️ manual |
| Cliente | `cliente_em` | ⚠️ manual |

Cada etapa mostra três números: **volume**, **conversão da etapa anterior** e **tempo
mediano** entre elas (as duas últimas saem da subtração dos marcos). O número
acionável nunca é "80 prospectados" — é "80 prospectados, 71 contatados (89%), 6
responderam (8,5%), mediana de 4 dias entre selecionar e tocar".

**O que é honesto dizer:** o funil é automático **até "Contatados"**. De
"Responderam" pra baixo ele vale o quanto o Kanban for alimentado, e não há como
derivar isso sozinho: `leads` **não tem e-mail** (só telefone, quando o matcher da
Base Tally acha), enquanto `lead_magnet_bookings` (Cal.com) tem e-mail e nome.
Cruzar por nome geraria falso positivo em "virou cliente" — o pior número pra estar
errado, porque é o que vai pra reunião de resultado.

### Cortes
Os cinco já estão como colunas na `v_lead_funnel`, então o front filtra sem query nova:

| Corte | Fonte | Pronto? |
|---|---|---|
| Período | qualquer marco | ✅ |
| Post / origem | `leads.first_seen_post_id` | ✅ |
| ICP | `lead_pipeline.icp_id` | ✅ |
| Responsável | `lead_pipeline.owner` | ✅ |
| Campanha | `lead_pipeline.campaign` | ⚠️ ver §8 |

O corte **por post** é o mais valioso: fecha o ciclo conteúdo → receita e responde
"qual post trouxe cliente", não só "qual post trouxe like".

> ⚠️ **Nome:** `content_posts.funnel_stage` já existe e significa etapa de
> **conteúdo** (`awareness`, `lead_magnet`, `conversion`…). No código a aba nova usa
> `pipeline` / `commercial funnel` pra não colidir.

---

## 8. Único ponto que ainda não fecha: campanha

Existe `content_production_items.campaign` (texto livre, lado da **produção**) e
`notion_content_items.campaigns` (array). Nenhum dos dois tem FK para
`content_posts` — a ligação com o post publicado é, na melhor das hipóteses, o
`content_url`. Então **hoje não dá pra derivar a campanha de um lead** sem inventar
um match por URL.

A coluna `campaign` nasce em `lead_pipeline` como texto editável (preenchível na mão
ou em lote), e o corte funciona desde o dia 1 pra quem preencher. Fechar isso de
verdade é um plano à parte, com duas saídas possíveis: ligar
`content_production_items` ao post publicado, ou marcar a campanha na execução do
"Prospectar". **Precisa da sua decisão** — não vou escolher por você.

---

## 9. Ordem de implementação

1. **Migration** — as quatro tabelas, as duas views, RLS no padrão das outras.
2. **`lead-outreach`** — `set_status` cria pipeline + stage event (sem touchpoint);
   ações novas `move_stage`, `log_touch`, `set_next_action`, `archive`, `set_owner`.
   Escritas pequenas, longe da parede de 150s das edge functions.
3. **`repository.js`** — `mode: 'pipeline'` lendo `v_lead_pipeline` + `pipeline_settings`.
4. **Aba Kanban** — `src/pipeline/PipelineBoard.jsx`, dnd-kit no padrão do
   `TeamWorkspace.jsx`. Nav em `main.jsx` logo depois de "Leads ICP".
5. **Aba Funil** — lê `v_lead_funnel`; recharts já é dependência.

Passos 1–4 entregam sozinhos o que dói hoje (follow-up esquecido). O passo 5 fica
mais rico depois de algumas semanas de uso — antes disso as etapas de baixo estarão
zeradas de qualquer jeito, mas as quatro de cima já valem no dia 1.

### Backfill
Os leads já marcados como `prospected` hoje entram no board em **"A prospectar"** com
`entered_at = lead_outreach.prospected_at`, sem touchpoints inventados. Não temos
como saber se foram realmente contatados — e chutar isso envenenaria a primeira
medição de conversão logo na etapa que mais importa.
