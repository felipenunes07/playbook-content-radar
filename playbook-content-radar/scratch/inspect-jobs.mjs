import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Querying prospecting_jobs...');
  const { data, error } = await supabase
    .from('collection_runs')
    .select('*')
    .eq('source', 'prospect_enrich')
    .gt('items_processed', 0)
    .order('started_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error querying prospecting_jobs:', error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
