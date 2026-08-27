-- Índice para a consulta "última sincronização do Tally" da tela de Leads ICP.
--
-- repository.js roda `select imported_at from tally_submissions order by imported_at
-- desc limit 1` toda vez que a tela carrega. Sem índice isso é seq scan + sort sobre
-- 19.381 linhas: medido em 27/08/2026, 0,9s a 3,3s em repouso — e durante a
-- sincronização do Tally, com a tabela sob escrita, estourou com "canceling statement
-- due to statement timeout".
--
-- O estrago é desproporcional ao tamanho da consulta: fetchContentMetrics falha
-- inteiro quando UMA consulta falha, então a tela de Leads inteira caía no snapshot
-- local mostrando dado velho. Ou seja, sincronizar o Tally derrubava a tela que
-- existe para mostrar o resultado da sincronização.
create index if not exists tally_submissions_imported_at_idx
  on public.tally_submissions (imported_at desc);

-- Verificação:
-- explain analyze select imported_at from public.tally_submissions
--   order by imported_at desc limit 1;
