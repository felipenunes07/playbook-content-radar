import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Querying video_url for July 2026 videos...');
  const { data, error } = await supabase.from('youtube_videos')
    .select('video_id, title, video_url, published_at')
    .gte('published_at', '2026-07-01T00:00:00Z')
    .lte('published_at', '2026-07-31T23:59:59Z');
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('youtube_videos URLS:', data);
  }
}

run();
