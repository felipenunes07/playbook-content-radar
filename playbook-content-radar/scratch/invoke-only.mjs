import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const leadId = 'f0d52009-ec4c-4cb4-8680-3340dba73747';

async function run() {
  console.log('Calling enrich-leads Edge Function...');
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/enrich-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ manual: true, limit: 1, leadIds: [leadId] })
    });

    const res = await response.json();
    console.log('Response from enrich-leads:', JSON.stringify(res, null, 2));

    // Verify if it is now enriched
    const { data: updatedLeads } = await supabase
      .from('leads')
      .select('id, full_name, enrichment_status, qualification_status, qualification_reason, score')
      .eq('id', leadId);
    console.log('Updated lead state in DB:', JSON.stringify(updatedLeads, null, 2));

  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
