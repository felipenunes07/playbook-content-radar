import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || !url.includes('linkedin.com')) {
      return new Response(
        JSON.stringify({ error: 'URL invalida.', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });

    const html = await response.text();

    const getMetaContent = (property: string): string => {
      const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r1 = new RegExp('property="' + escaped + '"\\s+content="([^"]*)"');
      const m1 = html.match(r1);
      if (m1) return m1[1];
      const r2 = new RegExp('content="([^"]*)"\\s+property="' + escaped + '"');
      const m2 = html.match(r2);
      if (m2) return m2[1];
      const r3 = new RegExp('name="' + escaped + '"\\s+content="([^"]*)"');
      const m3 = html.match(r3);
      if (m3) return m3[1];
      return '';
    };

    const ogTitle = getMetaContent('og:title');
    const ogDescription = getMetaContent('og:description');
    const ogImage = getMetaContent('og:image');

    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1] : '';

    let authorName = '';
    let authorHeadline = '';
    let articleBody = '';

    const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        if (jsonData.author?.name) authorName = jsonData.author.name;
        if (jsonData.author?.description) authorHeadline = jsonData.author.description;
        if (jsonData.articleBody) articleBody = jsonData.articleBody;
      } catch { /* ignore */ }
    }

    const bestTitle = ogTitle || pageTitle;
    if (!authorName && bestTitle) {
      const authorMatch = bestTitle.match(/^(.+?)(?:\s+on\s+LinkedIn|\s+no\s+LinkedIn|\s+posted\s+on|\s+\|\s+LinkedIn)/i);
      if (authorMatch) authorName = authorMatch[1].trim();
    }

    const bestDescription = articleBody || ogDescription;

    const result = {
      success: !!(bestDescription || bestTitle),
      author: authorName,
      authorHeadline,
      title: bestTitle,
      description: bestDescription,
      image: ogImage,
      isAuthwall: html.includes('authwall') || html.includes('auth_wall'),
      htmlLength: html.length,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
