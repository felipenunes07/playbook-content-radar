import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching a lead to test...');
  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('id, full_name, enrichment_status, qualification_status')
    .eq('enrichment_status', 'enriched')
    .limit(1);

  if (leadError) {
    console.error('Error fetching lead:', leadError);
    return;
  }
  if (!leads || !leads.length) {
    console.error('No enriched leads found to test with.');
    return;
  }

  const lead = leads[0];
  console.log(`Selected lead: ${lead.full_name} (${lead.id}). Current status: ${lead.enrichment_status} / ${lead.qualification_status}`);

  console.log('Resetting lead status to pending...');
  const { error: resetError } = await supabase
    .from('leads')
    .update({ enrichment_status: 'pending' })
    .eq('id', lead.id);

  if (resetError) {
    console.error('Error resetting lead:', resetError);
    return;
  }

  console.log('Calling enrich-leads Edge Function...');
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/enrich-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ manual: true, limit: 1, leadIds: [lead.id] })
    });

    const res = await response.json();
    console.log('Response from enrich-leads:', JSON.stringify(res, null, 2));

    // Verify if it is now enriched
    const { data: updatedLeads } = await supabase
      .from('leads')
      .select('id, full_name, enrichment_status, qualification_status, qualification_reason')
      .eq('id', lead.id);
    console.log('Updated lead state in DB:', JSON.stringify(updatedLeads, null, 2));

  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
