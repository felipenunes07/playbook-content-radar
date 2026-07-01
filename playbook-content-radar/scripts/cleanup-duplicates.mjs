import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Cleaning up misplaced YouTube posts in content_posts...');
  
  // 1. Get YouTube account IDs
  const { data: accounts, error: accErr } = await supabase
    .from('content_accounts')
    .select('id')
    .eq('platform', 'youtube');
    
  if (accErr) {
    console.error('Error fetching YouTube accounts:', accErr.message);
    return;
  }
  
  const ytIds = accounts.map(a => a.id);
  console.log('YouTube account IDs:', ytIds);
  
  if (ytIds.length > 0) {
    // 2. Delete posts from content_posts for these accounts
    const { error: delErr, count } = await supabase
      .from('content_posts')
      .delete({ count: 'exact' })
      .in('account_id', ytIds);
      
    if (delErr) {
      console.error('Error deleting misplaced posts:', delErr.message);
    } else {
      console.log(`Successfully deleted misplaced YouTube posts from content_posts.`);
    }
  }
}

run();
