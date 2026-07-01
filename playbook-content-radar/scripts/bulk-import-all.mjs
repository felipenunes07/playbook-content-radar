import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ACCOUNTS = {
  'Victor Baggio_linkedin': 'a37d5fa8-6b1b-4b4d-a2d8-6bd0226f05f9',
  'Fernando Tedesco_linkedin': '2732c614-3098-444d-a77f-41458809a55b',
  'Victor Baggio_youtube': '3d8f4b94-37b9-4f21-a515-561da16a2b6c',
  'Fernando Tedesco_youtube': '87b78c81-9628-43ba-8f13-46006af46e93'
};

async function run() {
  console.log('Starting bulk import...');

  // 1. Load historical JSONs
  const linkedinHistory = JSON.parse(await readFile('./src/contentMetrics/data/linkedin-history.json', 'utf8'));
  const youtubeHistory = JSON.parse(await readFile('./src/contentMetrics/data/youtube-history.json', 'utf8'));

  const linkedinRecords = linkedinHistory.records || [];
  const youtubeRecords = youtubeHistory.records || [];

  console.log(`Loaded ${linkedinRecords.length} LinkedIn posts and ${youtubeRecords.length} YouTube videos.`);

  // 2. Import LinkedIn posts
  console.log('Importing LinkedIn posts...');
  for (const item of linkedinRecords) {
    const owner = item.owner_name || 'Victor Baggio';
    const accountId = ACCOUNTS[`${owner}_linkedin`] || ACCOUNTS['Victor Baggio_linkedin'];
    
    let format = item.format === 'post' ? 'text' : item.format;
    const allowedFormats = ['text', 'image', 'carousel', 'video', 'repost', 'article', 'unknown'];
    if (!allowedFormats.includes(format)) {
      format = 'unknown';
    }

    // Insert post
    const { data: post, error: postErr } = await supabase.from('content_posts').upsert({
      account_id: accountId,
      external_post_id: item.external_post_id,
      published_at: item.published_at,
      format: format,
      hook: item.hook,
      content: item.content,
      cta_keyword: item.cta_keyword || 'Sem CTA',
      theme: item.theme,
      funnel_stage: item.funnel_stage,
      commercial_intent: item.commercial_intent
    }, { onConflict: 'external_post_id' }).select('id').single();

    if (postErr) {
      console.error(`Error inserting post ${item.external_post_id}:`, postErr.message);
      continue;
    }

    // Insert daily metrics
    const metricDate = item.metric_date || new Date().toISOString().slice(0, 10);
    const { error: metricErr } = await supabase.from('content_post_daily_metrics').upsert({
      post_id: post.id,
      metric_date: metricDate,
      likes: Number(item.likes || 0),
      comments: Number(item.comments || 0),
      shares: Number(item.shares || 0),
      views: Number(item.views || 0),
      source: 'historical_json'
    }, { onConflict: 'post_id,metric_date,source' });

    if (metricErr) {
      console.error(`Error inserting metrics for post ${item.external_post_id}:`, metricErr.message);
    }
  }

  // 3. Import YouTube videos
  console.log('Importing YouTube videos...');
  for (const item of youtubeRecords) {
    const owner = item.owner_name || 'Victor Baggio';
    const accountId = ACCOUNTS[`${owner}_youtube`] || ACCOUNTS['Victor Baggio_youtube'];

    // Insert YouTube video
    const { data: video, error: videoErr } = await supabase.from('youtube_videos').upsert({
      account_id: accountId,
      video_id: item.video_id,
      video_url: item.video_url || `https://www.youtube.com/watch?v=${item.video_id}`,
      title: item.title,
      description: item.description,
      published_at: item.published_at,
      thumbnail_url: item.thumbnail_url,
      duration: item.duration || '00:00:00',
      theme: item.theme || 'Não classificado'
    }, { onConflict: 'video_id' }).select('id').single();

    if (videoErr) {
      console.error(`Error inserting video ${item.video_id}:`, videoErr.message);
      continue;
    }

    // Insert daily metrics
    const metricDate = item.metric_date || new Date().toISOString().slice(0, 10);
    const { error: metricErr } = await supabase.from('youtube_video_daily_metrics').upsert({
      video_id: video.id,
      metric_date: metricDate,
      views: Number(item.views || 0),
      likes: Number(item.likes || 0),
      comments: Number(item.comments || 0),
      source: 'historical_json'
    }, { onConflict: 'video_id,metric_date,source' });

    if (metricErr) {
      console.error(`Error inserting metrics for video ${item.video_id}:`, metricErr.message);
    }
  }

  // 4. Account audience growth is not present in the historical exports.
  // Real follower/subscriber history must come from daily collector snapshots.
  console.log('Skipping account_daily_metrics growth import: historical exports do not contain real follower/subscriber history. Run collect-youtube/collect-linkedin for real snapshots.');

  console.log('Import completed successfully!');
}

run();
