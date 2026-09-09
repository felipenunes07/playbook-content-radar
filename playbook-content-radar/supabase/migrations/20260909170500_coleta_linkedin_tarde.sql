-- Segunda coleta diária do LinkedIn, às 14:00 BRT (17:00 UTC).
--
-- O cron da manhã (`content-dashboard-linkedin-daily`) roda 09:30 UTC / 06:30 BRT,
-- e o `content-dashboard-catchup` das 14:00 UTC só dispara quando NÃO houve coleta
-- bem-sucedida nas últimas 12h — como a da manhã quase sempre passa, ele é pulado.
-- Resultado: post publicado ao meio-dia só entrava no hub na manhã seguinte
-- (aconteceu em 09/09/2026 com o post de Skill do Segundo Cérebro).
--
-- Custo: mais um run de Apify por dia, no mesmo orçamento que o enriquecimento de
-- prospecção (`prospect-enrich-drain`, a cada 10 min) consome. Se a coleta voltar a
-- morrer por crédito, este é um candidato a desligar antes de mexer no resto.

select cron.schedule('content-dashboard-linkedin-tarde', '0 17 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/collect-linkedin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-collector-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collector_shared_secret')
    ),
    body := jsonb_build_object('scheduled', true, 'source', 'supabase_cron_tarde')
  );
$job$);
