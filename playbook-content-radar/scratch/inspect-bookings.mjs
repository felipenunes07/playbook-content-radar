import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xcihctupmfawtawbzwvm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase
    .from('lead_magnet_bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching lead_magnet_bookings:', error);
    return;
  }

  console.log(`Found ${data.length} bookings:`);
  for (const row of data) {
    console.log('--- BOOKING ROW ---');
    console.log({
      id: row.id,
      booking_uid: row.booking_uid,
      lead_name: row.lead_name,
      lead_email: row.lead_email,
      lead_magnet: row.lead_magnet,
      booking_origin: row.booking_origin,
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      utm_content: row.utm_content,
      utm_term: row.utm_term,
      created_at: row.created_at,
    });
    console.log('RAW PAYLOAD:', JSON.stringify(row.raw_payload, null, 2));
  }
}

main();
