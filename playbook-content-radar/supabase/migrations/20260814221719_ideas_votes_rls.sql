-- RLS em public.ideas e public.votes — eram as duas últimas tabelas do schema
-- public sem RLS (advisor "rls_disabled", nível CRITICAL). APLICADA e validada.
--
-- LEIA ANTES DE MEXER: isto é PARIDADE COM O ADVISOR, NÃO É SEGURANÇA.
--
-- O app não usa Supabase Auth em lugar nenhum (nenhum supabase.auth.*, signIn ou
-- getUser em src/): o "login" é escolher um nome na tela e todo acesso sai pela
-- anon key embutida no bundle do front — ou seja, pública. Sem usuário
-- autenticado, `auth.uid()` é nulo e qualquer política baseada em identidade
-- bloquearia o app inteiro. As políticas abaixo liberam para `anon` exatamente as
-- operações que src/main.jsx e src/teamWorkspace/TeamWorkspace.jsx já fazem, o que
-- deixa a exposição real IGUAL à de antes — só troca "RLS desligado" por "RLS
-- ligado e escancarado". O ganho é sair do advisor, não proteger dado.
--
-- A correção de verdade é autenticar o time (magic link para os 4-5 nomes) e só
-- então escrever política por identidade. Enquanto isso não existir, o risco é o
-- mesmo destas outras duas tabelas, que seguem graváveis por anon:
--   - public.content_goals ("anon full access content_goals", ALL, true/true)
--   - public.idea_development_workspaces (SELECT/INSERT/UPDATE para anon)
-- As demais tabelas do dashboard são SELECT-only para anon — nelas a escrita passa
-- por Edge Function com x-collector-secret, que é a proteção real.
--
-- NÃO confundir com public.notion_content_items e public.content_production_items:
-- essas têm RLS ligado e NENHUMA política de propósito, porque só a Edge Function
-- notion-development-board as acessa, via service role (que ignora RLS). O advisor
-- as reporta como INFO; adicionar política ali seria ABRIR o que está fechado.

alter table public.ideas enable row level security;
alter table public.votes enable row level security;

-- ideas: select/insert/update/delete + upsert (TeamWorkspace.jsx:942).
drop policy if exists "anon full access ideas" on public.ideas;
create policy "anon full access ideas" on public.ideas
  for all to anon, authenticated
  using (true)
  with check (true);

-- votes: select/insert/delete (o app troca voto apagando e reinserindo,
-- main.jsx:996-1001). `for all` cobre também o UPDATE do upsert.
drop policy if exists "anon full access votes" on public.votes;
create policy "anon full access votes" on public.votes
  for all to anon, authenticated
  using (true)
  with check (true);

-- Validação executada em 14/08/2026 com a anon key via PostgREST (não com service
-- role, que ignoraria RLS e não provaria nada):
--   SELECT ideas .............. 200
--   SELECT votes .............. 200
--   INSERT ideas .............. 201
--   INSERT votes .............. 201
--   UPSERT ideas (UPDATE) ..... 200, 1 linha, título alterado, created_at preservado
--   DELETE votes .............. 200
--   DELETE ideas .............. 200
-- Contagens restauradas ao baseline (72 ideias / 40 votos), sem linha de teste.
--
-- NB: pg_net é ASSÍNCRONO — disparar vários net.http_* no mesmo statement NÃO
-- garante ordem de execução. Validar sequência (insert → update → delete) exige
-- uma requisição por statement, conferindo a resposta antes da próxima.
