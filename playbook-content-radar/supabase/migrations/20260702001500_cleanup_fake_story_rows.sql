-- Remove registros falsos de story criados por um bug antigo da coleta:
-- o actor de posts era chamado como fallback de stories e os reels coletados
-- eram salvos duplicados com prefixo story_. Limita aos 3 ids conhecidos.
delete from public.instagram_post_daily_metrics
where post_id in (
  select id from public.instagram_posts
  where external_post_id in (
    'story_victor.baggio.ai_uc1jcc3s0hn',
    'story_3931350957743596647',
    'story_3931972574281769534'
  )
);

delete from public.instagram_posts
where external_post_id in (
  'story_victor.baggio.ai_uc1jcc3s0hn',
  'story_3931350957743596647',
  'story_3931972574281769534'
);
