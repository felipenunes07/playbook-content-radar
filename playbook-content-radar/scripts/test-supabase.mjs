import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Testing connection to Supabase...');
  try {
    const { data, error } = await supabase.from('content_accounts').select('*');
    if (error) {
      console.error('Error querying content_accounts:', error);
    } else {
      console.log('Successfully queried content_accounts. Found:', data.length, 'records');
      console.log(data);
    }

    const { data: growth, error: growthError } = await supabase.from('account_daily_metrics').select('*');
    if (growthError) {
      console.error('Error querying account_daily_metrics:', growthError);
    } else {
      console.log('Successfully queried account_daily_metrics. Found:', growth?.length, 'records');
      console.log(growth);
    }
  } catch (err) {
    console.error('Caught error:', err);
  }
}

run();
