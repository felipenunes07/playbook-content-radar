# Content Dashboard — Setup e Operação

## O que já funciona sem credenciais

O app inclui um snapshot normalizado dos arquivos:

- `fernando-posts.json`: 105 posts;
- `victor-posts.json`: 117 posts;
- total: 222 posts únicos;
- data-base da métrica histórica: `2026-05-12`.

Esse snapshot alimenta `/content-dashboard` mesmo antes do deploy do novo schema. Ele representa uma fotografia das métricas, não crescimento diário retroativo.

## 1. Verificação local

```powershell
npm install
npm run build:snapshot
npm run test:run
npm run build
```

Resultados esperados:

- snapshot: Fernando 105, Victor 117, total 222, duplicatas 0;
- todos os testes aprovados;
- build do Vite concluído.

## 2. Preparar o Supabase

O projeto usado hoje pelo frontend é `xcihctupmfawtawbzwvm`. Autentique a CLI e revise o vínculo antes de qualquer escrita remota:

```powershell
npx supabase login
npx supabase link --project-ref xcihctupmfawtawbzwvm
npx supabase db push --dry-run
```

O dry-run deve listar, nesta ordem:

1. `202607010001_content_metrics.sql`
2. `20260701045354_content_collection_cron.sql`

Depois da revisão:

```powershell
npx supabase db push
```

O primeiro migration cria tabelas, índices, RLS, políticas somente de leitura, seeds de contas e views `security_invoker`. O segundo cria os jobs do Cron.

## 3. Configurar secrets das Edge Functions

Copie `supabase/functions/.env.example` para um arquivo local fora do Git e preencha:

- `YOUTUBE_API_KEY`;
- `APIFY_TOKEN`;
- `APIFY_LINKEDIN_ACTOR_ID`;
- `APIFY_LINKEDIN_INPUT_JSON` conforme o contrato do Actor escolhido;
- `CLASSIFICATION_API_KEY`;
- `CLASSIFICATION_MODEL`;
- `COLLECTOR_SHARED_SECRET`, com um valor aleatório longo.

Os secrets padrão `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo runtime hospedado. Nunca copie o service role para o frontend.

Envie o arquivo local:

```powershell
npx supabase secrets set --env-file .env.content-dashboard
npx supabase secrets list
```

## 4. Publicar as funções

```powershell
npx supabase functions deploy collect-youtube collect-linkedin classify-content content-dashboard-api --use-api
```

Verifique o bundle antes do deploy quando o Deno estiver disponível:

```powershell
npx -y deno check collect-youtube/index.ts collect-linkedin/index.ts classify-content/index.ts content-dashboard-api/index.ts
```

Execute esse comando dentro de `supabase/functions`.

## 5. Configurar o Vault usado pelo Cron

No SQL Editor, substitua apenas os valores à esquerda e execute uma vez:

```sql
select vault.create_secret('https://xcihctupmfawtawbzwvm.supabase.co', 'project_url');
select vault.create_secret('SUA_PUBLISHABLE_KEY', 'publishable_key');
select vault.create_secret('O_MESMO_COLLECTOR_SHARED_SECRET', 'collector_shared_secret');
```

Os jobs usam:

- YouTube: `0 9 * * *` (09:00 UTC / 06:00 em São Paulo no offset UTC-03);
- LinkedIn: `30 9 * * *` (09:30 UTC / 06:30 em São Paulo no offset UTC-03).

Se o offset legal de São Paulo mudar, ajuste os horários UTC no migration do Cron.

Verificação:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname like 'content-dashboard-%';

select *
from cron.job_run_details
order by start_time desc
limit 20;
```

## 6. Importar o histórico

Primeiro valide sem gravar:

```powershell
npm run import:linkedin -- --file "C:\Users\Felipe\Dropbox\Obsidian\raw\linkedin\fernando-posts.json" --owner "Fernando Tedesco" --account-url "https://www.linkedin.com/in/fernando-tedesco/" --collected-at "2026-05-12" --dry-run

npm run import:linkedin -- --file "C:\Users\Felipe\Dropbox\Obsidian\raw\linkedin\victor-posts.json" --owner "Victor Baggio" --account-url "https://www.linkedin.com/in/victorzbaggio/" --collected-at "2026-05-12" --dry-run
```

Para o import real, defina as variáveis apenas na sessão do terminal e remova `--dry-run`:

```powershell
$env:SUPABASE_URL="https://xcihctupmfawtawbzwvm.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="COLE_LOCALMENTE"
```

O script usa upsert para entidades e `ignoreDuplicates` para o snapshot `historical_json`. Ele não substitui esse baseline por métricas do Apify.

Verificação no SQL Editor:

```sql
select count(*) as posts from content_posts; -- 222

select owner_name, count(*)
from v_latest_linkedin_post_metrics
group by owner_name
order by owner_name;

select external_post_id, count(*)
from content_posts
group by external_post_id
having count(*) > 1; -- 0 linhas

select post_id, metric_date, source, count(*)
from content_post_daily_metrics
group by post_id, metric_date, source
having count(*) > 1; -- 0 linhas
```

## 7. API interna

Base hospedada:

```text
https://xcihctupmfawtawbzwvm.supabase.co/functions/v1/content-dashboard-api
```

Rotas implementadas:

- `GET /overview`
- `GET /linkedin/posts`
- `GET /youtube/videos`
- `GET /accounts`
- `POST /accounts`
- `PATCH /accounts/:id`
- `POST /imports/linkedin-history`
- `POST /jobs/collect-youtube`
- `POST /jobs/collect-linkedin`
- `POST /classify/posts`
- `POST /classify/videos`

Todas as mutações exigem o header `x-collector-secret`. Os GETs usam dados já liberados para leitura pelo dashboard.

## 8. Diagnóstico

- **“Snapshot histórico local” no app:** schema ainda não existe, a view não está acessível ou o projeto está indisponível. O dashboard continua usando os 222 registros locais.
- **YouTube vazio:** confirme `YOUTUBE_API_KEY`, handles e `collection_runs`.
- **LinkedIn falhou:** confirme o input exigido pelo Actor e ajuste `APIFY_LINKEDIN_INPUT_JSON` usando `{{accountUrl}}`.
- **Cron 401:** os valores `collector_shared_secret` do Vault e `COLLECTOR_SHARED_SECRET` da função não coincidem.
- **Tabela inacessível:** verifique Data API grants além de RLS.
- **Classificação em erro:** veja `classification_error` e confirme que o modelo suporta JSON object.
