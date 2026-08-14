-- Memória das rejeições humanas na fila de REVIEW.
--
-- Sem isto, rejeitar um candidato não tem efeito duradouro: a sincronização seguinte
-- recalcula o match do zero, encontra o mesmo candidato e devolve o lead para REVIEW.
-- O revisor ficaria rejeitando a mesma sugestão para sempre.
--
-- Guardamos os submission_id rejeitados na própria linha do lead (e não em tabela
-- nova) porque a decisão pertence ao par lead↔submission e lead_phone_matches já é
-- unique(lead_id) — é o mesmo grão. O matcher lê esta coluna para excluir os
-- rejeitados dos candidatos antes de decidir.
--
-- A lista é acumulativa e sobrevive à sincronização: o upsert do matcher preserva o
-- valor existente (ver tallySync.ts), então uma rejeição nunca é perdida por um
-- reprocessamento.

alter table public.lead_phone_matches
  add column if not exists rejected_submission_ids jsonb not null default '[]'::jsonb;

comment on column public.lead_phone_matches.rejected_submission_ids is
  'submission_id que um humano rejeitou para este lead. O matcher exclui estes candidatos. Acumulativo; preservado entre sincronizações.';

-- Quem tomou a decisão (perfil selecionado no Hub — não é identidade autenticada) e
-- quando. reviewed_by/reviewed_at já existiam; falta só registrar a decisão em si,
-- para distinguir "confirmado por humano" de "rejeitado por humano".
alter table public.lead_phone_matches
  add column if not exists review_decision text
    check (review_decision is null or review_decision in ('confirmed', 'rejected'));

comment on column public.lead_phone_matches.review_decision is
  'Decisão humana na fila de REVIEW: confirmed (virou MATCHED/MATCHED_NO_PHONE) ou rejected.';
