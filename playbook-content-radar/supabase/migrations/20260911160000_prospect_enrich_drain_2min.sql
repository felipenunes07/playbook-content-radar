-- Acelera o cron de análise de leads: de 10 em 10 minutos para 2 em 2. Cada rodada
-- (lote de 10 pela Bright Data + IA) leva 60-130s; se um tick chegar com a anterior
-- ainda rodando, a trava de concorrência do enrich-leads devolve "busy" e nada
-- acontece — então a cadência alta não sobrepõe execuções, só reduz o tempo ocioso.
-- Motivo: em 11/09/2026 havia 673 leads em "Aguardando análise"; a 10/10 min o
-- backlog levaria ~11h, a 2/2 min leva ~2h — tudo na nuvem, sem tela aberta.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'prospect-enrich-drain'),
  schedule := '*/2 * * * *'
);
