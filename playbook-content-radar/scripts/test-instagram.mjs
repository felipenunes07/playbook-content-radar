import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Querying latest collection_runs from the database...');
  const { data: runs, error } = await supabase
    .from('collection_runs')
    .select('*');
  
  if (error) {
    console.error('Error:', error);
  } else {
    // sort by started_at desc
    const sorted = runs.sort((a, b) => b.started_at.localeCompare(a.started_at));
    sorted.slice(0, 10).forEach(r => {
      console.log(`Run ID: ${r.id} | Platform: ${r.platform} | Status: ${r.status} | Items: ${r.items_processed} | Error: ${r.error_message} | StartedAt: ${r.started_at}`);
    });
  }
}

run();
