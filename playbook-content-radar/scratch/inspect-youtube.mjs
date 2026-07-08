import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Querying posts published on July 2nd, 2026...');
  // We load LinkedIn
  const { data: lData } = await supabase.from('v_latest_linkedin_post_metrics')
    .select('id, platform, views, hook, published_at')
    .gte('published_at', '2026-07-02T00:00:00Z')
    .lte('published_at', '2026-07-02T23:59:59Z');
  
  // We load YouTube
  const { data: yData } = await supabase.from('v_latest_youtube_video_metrics')
    .select('id, views, title, published_at')
    .gte('published_at', '2026-07-02T00:00:00Z')
    .lte('published_at', '2026-07-02T23:59:59Z');

  // We load Instagram
  const { data: iData } = await supabase.from('v_latest_instagram_post_metrics')
    .select('id, views, hook, published_at')
    .gte('published_at', '2026-07-02T00:00:00Z')
    .lte('published_at', '2026-07-02T23:59:59Z');

  console.log('LinkedIn posts on 02/07:', lData);
  console.log('YouTube videos on 02/07:', yData);
  console.log('Instagram posts on 02/07:', iData);
}

run();
