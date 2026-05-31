async function test() {
  const url = 'https://xcihctupmfawtawbzwvm.supabase.co/rest/v1/ideas?id=eq.3ea01014-39a4-4def-997f-77b76b069fcd';
  const headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaWhjdHVwbWZhd3Rhd2J6d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTY1MTIsImV4cCI6MjA5NTgzMjUxMn0.GFVSHYY0S9nwfunxUyGGio5EQgsZE04nvFZAFz-L4Ow'
  };
  
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    console.log('Daniel Oliver idea details:', JSON.stringify(data[0], null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
