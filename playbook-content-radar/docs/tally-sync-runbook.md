# Ingestão Tally → Leads ICP: como ligar

Passo a passo para aplicar a migration, configurar os secrets, subir a function e
rodar a primeira sincronização manual. O cron fica para depois da manual dar certo.

## 0. Antes de tudo: o campo de telefone nos formulários

Só existe telefone para achar se o formulário coletar telefone. Estado medido em
14/08/2026:

| Formulário | Submissions | Campo telefone |
|---|---|---|
| 36 Skills de SDR para Claude (`VLaVrE`) | 289 | sim, respondido a partir de 14/08 13:22 |
| 18 MCPs (`jaqkJJ`) | 170 | campo existe, nenhuma resposta ainda |
| O Setup inicial do OS (`7RO9QA`) | 123 | campo existe, nenhuma resposta ainda |
| Claude para Pequenos Negócios (`lb1gzV`) | 111 | campo existe |
| **KipFlow (`EkEkX4`)** | 151 | **não existe — adicionar** |
| **Claude Flabe 5 (`kdpqLe`)** | 70 | **não existe — adicionar** |
| Google Maps Scraper (`mBr6pY`) | 2.735 | não existe |

KipFlow e Fable são os que mais importam: os posts com CTA `FLOW` e `FABLE` geraram
104 dos 230 leads aprovados. Sem telefone neles, esses leads não têm como ser
recuperados.

## 1. Aplicar a migration — FEITO em 14/08/2026

Aplicada em produção (`xcihctupmfawtawbzwvm`) como `tally_base_and_lead_phones`.
Verificado: 3 tabelas criadas, RLS ativa nas 3, `v_lead_phones` devolvendo 230 linhas
(= leads qualified) e 23 vínculos post→formulário semeados. As instruções abaixo ficam
como referência de re-aplicação.

`supabase/migrations/20260814180000_tally_base_and_lead_phones.sql`

Cria `tally_submissions`, `post_lead_magnets`, `lead_phone_matches`, a view
`v_lead_phones`, as RLS e semeia o vínculo post→formulário a partir de
`content_posts.cta_keyword`.

```bash
supabase db push
```

Se preferir pelo painel: SQL Editor → cole o arquivo → Run.

Conferir o seed depois de aplicar (esperado: uma linha por post com CTA mapeado):

```sql
select lead_magnet_code, count(*) from public.post_lead_magnets group by 1 order by 2 desc;
```

## 2. Secrets da Edge Function

Supabase → Project → Edge Functions → Secrets:

| Secret | Para quê |
|---|---|
| `TALLY_API_KEY` | token da API do Tally (Tally → Settings → API) |
| `COLLECTOR_SHARED_SECRET` | já existe, usado pelas outras collectors; protege a invocação |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm injetados no runtime.

## 3. Subir a function

```bash
supabase functions deploy tally-sync
```

## 4. Sincronização manual

Comece pelos formulários que interessam, em `dryRun` — ingere as submissions mas não
grava nada em `lead_phone_matches`, então dá para ver o resultado do matching antes de
persistir telefone:

```bash
curl -s -X POST "https://xcihctupmfawtawbzwvm.supabase.co/functions/v1/tally-sync" -H "Content-Type: application/json" -H "x-collector-secret: $COLLECTOR_SHARED_SECRET" -d '{"formIds":["VLaVrE","7RO9QA","EkEkX4","kdpqLe","jaqkJJ","lb1gzV"],"dryRun":true}'
```

Conferido o resultado, rode de novo sem `dryRun` para gravar:

```bash
curl -s -X POST "https://xcihctupmfawtawbzwvm.supabase.co/functions/v1/tally-sync" -H "Content-Type: application/json" -H "x-collector-secret: $COLLECTOR_SHARED_SECRET" -d '{"formIds":["VLaVrE","7RO9QA","EkEkX4","kdpqLe","jaqkJJ","lb1gzV"]}'
```

Para trazer a base histórica inteira (59 formulários, ~19 mil submissions), omita
`formIds`. A API do Tally aceita 100 req/min e o cliente pagina de 500 em 500 com
pausa de 250ms, então cabe folgado.

### O que a resposta traz

```json
{
  "ingestao": {
    "formularios_lidos": 6, "submissions_recebidas": 0, "novas_inseridas": 0,
    "atualizadas": 0, "com_telefone": 0, "lixo_marcado": 0, "por_formulario": []
  },
  "matching": {
    "leads_qualified": 230, "pulados_com_telefone_confirmado": 0,
    "leads_reprocessados": 230, "submissions_candidatas": 0,
    "MATCHED": 0, "MATCHED_NO_PHONE": 0, "REVIEW": 0, "NOT_FOUND": 0,
    "telefones_seguros": 0, "gravado": true
  },
  "amostra": []
}
```

Na `amostra`, `phone` só aparece em `MATCHED`. Item em `REVIEW` mostra candidatos e
evidências, nunca o número.

## 5. Sincronização incremental e cron

`since` usa o `startDate` da API, então o cron não precisa rebaixar o histórico:

```json
{"since":"2026-08-01"}
```

Quando a manual estiver estável, agendar segue o padrão do
`20260701045354_content_collection_cron.sql` (pg_cron + pg_net chamando a function com
o header do secret).

## Reprocessamento

Cada rodada só processa lead `qualified` que **ainda não tem `MATCHED` com telefone`**.
Quem já tem é pulado. Então:

- quem estava `NOT_FOUND` ou `MATCHED_NO_PHONE` é tentado de novo a cada CSV/sync novo;
- quem foi `REVIEW` é tentado de novo (e continua sem telefone até revisão humana);
- quem tem telefone confirmado nunca é retrabalhado.

É o que permite alguém sem telefone num formulário antigo ser encontrado depois de
preencher um lead magnet novo que já coleta telefone.

## Caminho por CSV

Continua valendo e não depende de token, para carga pontual:

```bash
npx tsx scripts/match-lead-phones.ts "C:/Users/Felipe/Downloads"
```

Lê os CSVs exportados do Tally, roda o matcher e imprime o resultado sem gravar nada.
CSV e API produzem o mesmo `TallySubmission` — há um teste que compara os dois campo a
campo — então o matcher não sabe de qual fonte veio.
