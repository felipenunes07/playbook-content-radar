with raw (
  notion_page_url, title, platforms, status, publish_date, campaigns, performance,
  content_url, assigned_to_felipe, notion_created_time
) as (
  values
  ('https://app.notion.com/397f8d62b79a80fb9356e9a025317bc7', 'SDR AI-NATIVE', array['LinkedIn']::text[], 'In progress', null::date, array['Lead Magnet']::text[], null::text, null::text, true, '2026-07-08 20:20:09Z'::timestamptz),
  ('https://app.notion.com/391f8d62b79a8026aa81e7c452063056', 'Claude Flable', array['LinkedIn']::text[], 'Not started', null::date, array['Lead Magnet']::text[], null::text, null::text, false, '2026-07-02 15:03:29Z'::timestamptz),
  ('https://app.notion.com/38ef8d62b79a80f2940ec717d57b3937', 'Como criar um perfil no linkeidn para vender projetos enterprise', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-06-29 11:30:59Z'::timestamptz),
  ('https://app.notion.com/38ef8d62b79a804ab1e6d17e9706efb0', 'Como criar uma marca pessoal para vender projetos de IA e Automação', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-06-29 09:51:38Z'::timestamptz),
  ('https://app.notion.com/38df8d62b79a808aa3f9cd6112836813', 'Como empreender com IA - O caminho', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-06-28 20:29:58Z'::timestamptz),
  ('https://app.notion.com/382f8d62b79a80718893e75e2c5ca09e', 'Claude Subagents - Como usar em vendas', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-06-17 14:32:43Z'::timestamptz),
  ('https://app.notion.com/381f8d62b79a8062b29ffd98ab6a7aa4', '[COPY] Ben AI - Cowork for Sales (1)', array['YouTube']::text[], 'Ready to publish', '2026-06-23'::date, array['Educational']::text[], null::text, 'https://youtu.be/EqJoui72QrU?si=GCIluccWDzZ_6hSB', false, '2026-06-16 22:12:36Z'::timestamptz),
  ('https://app.notion.com/37cf8d62b79a803388c1efc04c69017e', 'Video Pós Agendamento', array['LinkedIn']::text[], 'In progress', null::date, array[]::text[], null::text, null::text, true, '2026-06-11 15:19:35Z'::timestamptz),
  ('https://app.notion.com/37cf8d62b79a8014916cc5e5a3343f28', 'Vídeo pós-agendamento', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-06-11 15:17:07Z'::timestamptz),
  ('https://app.notion.com/36ef8d62b79a8012b7d0fa530db9a90d', '18 Months of Building Autonomous AI Agents in 42 Minutes', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-05-28 19:53:24Z'::timestamptz),
  ('https://app.notion.com/36ef8d62b79a80a28d9adb5f32661990', 'Linkedin: 5 automações que as empresas realemnte pagam', array['LinkedIn']::text[], 'Programado', '2026-05-28'::date, array['Educational']::text[], null::text, null::text, false, '2026-05-28 04:47:38Z'::timestamptz),
  ('https://app.notion.com/36df8d62b79a805d804ad310f96e9043', 'API Kipflow: Finalmente uma API brasileira BOA pra enriquecer dados', array['LinkedIn']::text[], 'In progress', null::date, array['Lead Magnet']::text[], null::text, null::text, true, '2026-05-27 09:38:12Z'::timestamptz),
  ('https://app.notion.com/36bf8d62b79a8045886acfedb12a2b9c', 'The Claude Signal Hunter', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-05-25 12:54:42Z'::timestamptz),
  ('https://app.notion.com/368f8d62b79a804e99f5cab7b16052ea', 'COPY - Linkedin - Como fazer o claude escrever como humano e não como AI', array['LinkedIn']::text[], 'Not started', null::date, array['Lead Magnet']::text[], null::text, null::text, false, '2026-05-22 16:00:36Z'::timestamptz),
  ('https://app.notion.com/365f8d62b79a804b9c40c3b4b8b7f3e9', 'Os níveis de prospecção (baseado no texto do Ricardo )', array['LinkedIn']::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-05-19 20:55:46Z'::timestamptz),
  ('https://app.notion.com/363f8d62b79a801fa010ca0fe3b31130', 'Ainda devo aprender n8n em 2026', array['YouTube']::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-05-17 04:40:35Z'::timestamptz),
  ('https://app.notion.com/35ff8d62b79a809593c4f792f3b7fcfb', '[COPY] Como eu gero leads infinitos para cold-email usando Claude code', array[]::text[], 'Not started', null::date, array[]::text[], null::text, 'https://www.youtube.com/watch?v=Vo9VUnzYqpw&t=119s', false, '2026-05-13 04:30:47Z'::timestamptz),
  ('https://app.notion.com/35ff8d62b79a800fbe6eda9e8e79b87e', 'Top 3 casos de uso de IA em vendas', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-05-13 02:11:34Z'::timestamptz),
  ('https://app.notion.com/358f8d62b79a8024973ccafe54af058b', 'Do 0 aos 100k - minha jornada com agência de IA', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-05-06 17:42:34Z'::timestamptz),
  ('https://app.notion.com/342f8d62b79a809287fdc717211c6b56', 'Como eu uso Claude Cowork para automatizar 99% da minha vida', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-04-14 02:14:05Z'::timestamptz),
  ('https://app.notion.com/342f8d62b79a80d4bc93cbf38d95f4d5', '4 formas de fazer scrape de leads no instagram', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-04-14 02:02:50Z'::timestamptz),
  ('https://app.notion.com/322f8d62b79a80bbb039e2a3c9ffcf51', 'API Kipflow: Finalmente uma API brasileira BOA pra enriquecer dados', array['YouTube']::text[], 'In progress', null::date, array[]::text[], null::text, null::text, true, '2026-03-13 10:54:52Z'::timestamptz),
  ('https://app.notion.com/320f8d62b79a805fb91acfec54270d06', 'Projects vs. Skills', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-03-11 10:28:26Z'::timestamptz),
  ('https://app.notion.com/2f9f8d62b79a80d2b43bfd9d2d1c1c50', 'Agentic Workflows Antigravity', array['YouTube']::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-01-31 02:50:50Z'::timestamptz),
  ('https://app.notion.com/2f7f8d62b79a8050a351dc85e396c7c0', 'Primeiro Agentic Workflow', array['YouTube']::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-01-29 19:53:20Z'::timestamptz),
  ('https://app.notion.com/2ebf8d62b79a80cb83d3fe8ade964e25', 'Remake da Automação do Insta', array['LinkedIn']::text[], 'Not started', null::date, array['Lead Magnet']::text[], null::text, null::text, false, '2026-01-17 03:52:59Z'::timestamptz),
  ('https://app.notion.com/2ebf8d62b79a801bbc1ec9d5723f6d21', 'Voice AI para Inbound', array['LinkedIn']::text[], 'Not started', null::date, array['Lead Magnet']::text[], null::text, null::text, false, '2026-01-17 02:25:28Z'::timestamptz),
  ('https://app.notion.com/2e7f8d62b79a80f9a17ee9409f4ee178', 'Pós form Voice Caller', array['YouTube']::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-01-13 04:54:23Z'::timestamptz),
  ('https://app.notion.com/2e1f8d62b79a803bb0d9d3a49ae660a9', 'Cagando na cabeça do Thiago Reis', array['LinkedIn']::text[], 'Cancelled', '2026-01-08'::date, array['Opinion']::text[], null::text, null::text, false, '2026-01-07 18:51:38Z'::timestamptz),
  ('https://app.notion.com/2e1f8d62b79a80e1b648c0f871a3e6a7', 'Print da conversa com Rafael', array[]::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-01-07 18:07:49Z'::timestamptz),
  ('https://app.notion.com/2dcf8d62b79a805cbe7fe2a74d995795', 'Agente Copiloto WhatsApp para eventos presenciais', array['LinkedIn','YouTube']::text[], 'Not started', null::date, array['Lead Magnet']::text[], null::text, null::text, false, '2026-01-02 02:00:34Z'::timestamptz),
  ('https://app.notion.com/2dcf8d62b79a80a5a109f14103a31d1b', 'Você nem imagina, mas tem centenas de leads nas suas conexões', array['LinkedIn','YouTube']::text[], 'Not started', null::date, array['Lead Magnet']::text[], null::text, null::text, false, '2026-01-02 01:44:45Z'::timestamptz),
  ('https://app.notion.com/2dcf8d62b79a80879ad9dfde9df0ba77', 'Rankeando as melhores automações/projetos que já fizemos', array['YouTube']::text[], 'Not started', null::date, array[]::text[], null::text, null::text, false, '2026-01-02 01:32:49Z'::timestamptz)
)
insert into public.notion_content_items (
  notion_page_url, owner_name, title, platforms, status, publish_date, campaigns,
  performance, content_url, assigned_to_felipe, notion_created_time, last_synced_at
)
select
  notion_page_url, 'Victor Baggio', title, platforms, status, publish_date, campaigns,
  performance, content_url, assigned_to_felipe, notion_created_time, now()
from raw
on conflict (notion_page_url) do update set
  title = excluded.title,
  platforms = excluded.platforms,
  status = excluded.status,
  publish_date = excluded.publish_date,
  campaigns = excluded.campaigns,
  performance = excluded.performance,
  content_url = excluded.content_url,
  assigned_to_felipe = excluded.assigned_to_felipe,
  notion_created_time = excluded.notion_created_time,
  last_synced_at = now();
