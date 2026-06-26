-- ============================================================================
-- Content Radar — Revisão de Segurança (RLS) do Supabase
-- ----------------------------------------------------------------------------
-- COMO USAR: abra o painel do Supabase do projeto (xcihctupmfawtawbzwvm) ->
-- menu "SQL Editor" -> "New query" -> cole este arquivo -> "Run".
--
-- CONTEXTO DO RISCO
-- O app usa a "anon key" (chave pública) embutida no código do navegador. Isso é
-- normal e esperado. O problema é: se as tabelas NÃO tiverem RLS (Row Level
-- Security) com políticas, qualquer pessoa que pegue essa chave (ela é visível
-- no código do site) consegue LER, GRAVAR e APAGAR tudo em `ideas` e `votes`.
--
-- IMPORTANTE: o app hoje precisa de CRUD completo como anônimo (inclusive DELETE,
-- porque salvar um voto faz "apaga e insere"). Por isso, só ligar RLS com regras
-- permissivas (Parte 1) deixa o app funcionando, mas NÃO impede um mal-intencionado
-- de apagar dados — para proteção real é preciso login (Parte 3).
-- ============================================================================


-- ============================================================================
-- PARTE 1 — Ligar RLS mantendo o app funcionando (baseline, aplicar já)
-- Silencia o alerta "RLS disabled" e cria um ponto de controle para apertar depois.
-- ============================================================================
alter table public.ideas enable row level security;
alter table public.votes enable row level security;

-- ideas: acesso total para a role anônima (comportamento atual do app)
drop policy if exists "anon full access ideas" on public.ideas;
create policy "anon full access ideas" on public.ideas
  for all to anon using (true) with check (true);

-- votes: acesso total para a role anônima (comportamento atual do app)
drop policy if exists "anon full access votes" on public.votes;
create policy "anon full access votes" on public.votes
  for all to anon using (true) with check (true);


-- ============================================================================
-- PARTE 2 — Integridade dos dados (recomendado, baixo risco)
-- Evita votos duplicados do mesmo curador e o mesmo post cadastrado 2x.
-- Rode os SELECTs de checagem ANTES, caso já existam duplicados no banco.
-- ============================================================================

-- 2a) Um voto por curador por ideia (complementa o controle do app).
--     Cheque duplicados antes:
--     select idea_id, voter_name, count(*) from public.votes
--     group by 1,2 having count(*) > 1;
create unique index if not exists votes_unique_idea_voter
  on public.votes (idea_id, voter_name);

-- 2b) Impede cadastrar o mesmo link 2x (complementa a checagem no app).
--     Cheque duplicados antes:
--     select linkedin_url, count(*) from public.ideas
--     where linkedin_url is not null group by 1 having count(*) > 1;
create unique index if not exists ideas_unique_linkedin_url
  on public.ideas (linkedin_url)
  where linkedin_url is not null;


-- ============================================================================
-- PARTE 3 — PROTEÇÃO REAL (recomendado): exigir login
-- ----------------------------------------------------------------------------
-- Para impedir que estranhos leiam/apaguem os dados, o caminho certo é exigir
-- usuário autenticado. Passos:
--   1. Supabase -> Authentication -> ative um método (e-mail/senha é suficiente
--      para uso interno) e crie logins para Felipe, Victor e Fernando.
--   2. No app, adicionar a tela de login (supabase.auth.signInWithPassword).
--      (Posso implementar isso no app se você quiser.)
--   3. Trocar as políticas da Parte 1 por estas, que liberam só para logados:
--
--   drop policy if exists "anon full access ideas" on public.ideas;
--   drop policy if exists "anon full access votes" on public.votes;
--
--   create policy "auth read ideas"   on public.ideas for select to authenticated using (true);
--   create policy "auth write ideas"  on public.ideas for insert to authenticated with check (true);
--   create policy "auth update ideas"  on public.ideas for update to authenticated using (true);
--   create policy "auth delete ideas"  on public.ideas for delete to authenticated using (true);
--
--   create policy "auth read votes"   on public.votes for select to authenticated using (true);
--   create policy "auth write votes"  on public.votes for insert to authenticated with check (true);
--   create policy "auth update votes"  on public.votes for update to authenticated using (true);
--   create policy "auth delete votes"  on public.votes for delete to authenticated using (true);
--
-- Depois disso, a chave pública sozinha não grava nem apaga nada sem login.
-- ============================================================================
