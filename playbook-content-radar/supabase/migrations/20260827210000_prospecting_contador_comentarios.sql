-- Preenche, nas prospecções que já rodaram, quantos comentários o post tinha no dia
-- em que foi raspado (pedido do Felipe em 27/08/2026: reprospectar deve avisar quando
-- não há comentário novo, em vez de raspar à toa).
--
-- Como o aviso funciona: o prospect-post compara o contador de comentários do post
-- AGORA com o contador guardado na última prospecção. Se não subiu, não existe
-- comentário novo e nenhum actor é disparado — economia de 100%, não de "só os novos".
--
-- Comparar a métrica do LinkedIn com o que temos em lead_comments NÃO serve: a métrica
-- conta respostas (que não raspamos, scrapeReplies:false) e lead_comments conta
-- comentaristas deduplicados. Os números nunca batem, nem quando nada mudou. Por isso
-- a comparação é métrica-contra-métrica, em dois momentos.
--
-- Sem este backfill, o aviso só passaria a valer da PRÓXIMA prospecção de cada post em
-- diante — os jobs antigos não têm o número guardado. Com o histórico diário de
-- content_post_daily_metrics dá para reconstruir com precisão: basta pegar a medição
-- mais recente até a data em que o job rodou.
--
-- Idempotente: só toca job que ainda não tem o campo.

-- O LATERAL vive num SELECT dentro da CTE: em UPDATE ... FROM o Postgres não deixa a
-- subconsulta lateral enxergar a tabela alvo (42P10).
with medicao as (
  select j.id as job_id, m.comments, m.metric_date
  from public.prospecting_jobs j
  cross join lateral (
    select d.comments, d.metric_date
    from public.content_post_daily_metrics d
    where d.post_id = j.post_id
      and d.comments is not null
      -- A medição do próprio dia da raspagem é a melhor aproximação disponível: a
      -- coleta roda de manhã e a prospecção é manual, quase sempre depois.
      and d.metric_date <= coalesce(j.finished_at, j.started_at)::date
    order by d.metric_date desc
    limit 1
  ) m
  where j.status in ('success', 'partial')
    and j.raw->>'comentariosNoLinkedIn' is null
)
update public.prospecting_jobs j
set raw = coalesce(j.raw, '{}'::jsonb)
        || jsonb_build_object('comentariosNoLinkedIn', medicao.comments,
                              'comentariosDe', medicao.metric_date,
                              'comentariosBackfill', true)
from medicao
where medicao.job_id = j.id;

-- Verificação:
-- select j.post_id, j.started_at::date as prospectado_em,
--        j.raw->>'comentariosNoLinkedIn' as comentarios_na_epoca,
--        (select comments from public.content_post_daily_metrics d
--          where d.post_id = j.post_id order by d.metric_date desc limit 1) as comentarios_hoje
-- from public.prospecting_jobs j
-- where j.status in ('success','partial')
-- order by j.started_at desc limit 20;
