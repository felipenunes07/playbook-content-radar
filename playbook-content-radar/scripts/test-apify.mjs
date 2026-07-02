const APIFY_TOKEN = '5bce5e77e0e1f459ab3508f48ea47526ef7eb3a550bcfc80d3fbceb5bf8c352c';

async function run() {
  console.log('Testing token against Apify API...');
  const response = await fetch(`https://api.apify.com/v2/users/me?token=${APIFY_TOKEN}`);
  const body = await response.json();
  if (response.ok) {
    console.log('Success! Connected to Apify user:', body.data?.username || body.data?.email);
  } else {
    console.error('Failed:', body.error?.message || response.statusText);
  }
}

run();
