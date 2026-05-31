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
        JSON.stringify({ error: 'URL inválida.', success: false }),
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

    // Helper to get meta tag content
    const getMetaContent = (property: string): string => {
      const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r1 = new RegExp('property="' + escaped + '"\\s+content="([^"]*)"', 'i');
      const m1 = html.match(r1);
      if (m1) return m1[1];
      const r2 = new RegExp('content="([^"]*)"\\s+property="' + escaped + '"', 'i');
      const m2 = html.match(r2);
      if (m2) return m2[1];
      const r3 = new RegExp('name="' + escaped + '"\\s+content="([^"]*)"', 'i');
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
    let authorAvatar = '';
    let articleBody = '';
    let parsedLikes = 0;
    let parsedComments = 0;

    // Robust JSON-LD parsing
    const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        
        // 1. Author name
        if (jsonData.author?.name) {
          authorName = jsonData.author.name;
        }
        
        // 2. Author avatar picture
        if (jsonData.author?.image?.url) {
          authorAvatar = jsonData.author.image.url;
        } else if (typeof jsonData.author?.image === 'string') {
          authorAvatar = jsonData.author.image;
        }
        
        // 3. Full article/post body
        if (jsonData.articleBody) {
          articleBody = jsonData.articleBody;
        }
        
        // 4. Comment count
        if (typeof jsonData.commentCount === 'number') {
          parsedComments = jsonData.commentCount;
        }
        
        // 5. Interactions (likes / comments)
        if (Array.isArray(jsonData.interactionStatistic)) {
          for (const stat of jsonData.interactionStatistic) {
            if (stat.interactionType?.includes('LikeAction') && typeof stat.userInteractionCount === 'number') {
              parsedLikes = stat.userInteractionCount;
            }
            if (stat.interactionType?.includes('CommentAction') && typeof stat.userInteractionCount === 'number' && !parsedComments) {
              parsedComments = stat.userInteractionCount;
            }
          }
        } else if (jsonData.interactionStatistic) {
          const stat = jsonData.interactionStatistic;
          if (stat.interactionType?.includes('LikeAction') && typeof stat.userInteractionCount === 'number') {
            parsedLikes = stat.userInteractionCount;
          }
        }
      } catch { /* ignore and parse next JSON-LD */ }
    }

    // Fallbacks
    const bestTitle = ogTitle || pageTitle;
    if (!authorName && bestTitle) {
      const authorMatch = bestTitle.match(/^(.+?)(?:\s+on\s+LinkedIn|\s+no\s+LinkedIn|\s+posted\s+on|\s+\|\s+LinkedIn)/i);
      if (authorMatch) authorName = authorMatch[1].trim();
    }

    const bestDescription = articleBody || ogDescription;

    // Filter out generic linkedin icons/logos from ogImage
    let postImage = ogImage;
    if (ogImage && (ogImage.includes('static.licdn.com') || ogImage.includes('favicon') || ogImage.includes('default'))) {
      postImage = '';
    }

    // Metrics simulation fallbacks if they are 0 or undefined
    const mockLikes = parsedLikes || Math.floor(Math.random() * 220) + 60;
    const mockComments = parsedComments || Math.floor(mockLikes * 0.08) + 2;
    const mockReposts = Math.floor(mockLikes * 0.05) + 1;

    // Smart author headline inference based on category/content keywords with regex word boundaries
    let authorHeadline = '';
    const lowerContent = (bestDescription + ' ' + bestTitle).toLowerCase();
    
    const matchesKeyword = (words: string[]): boolean => {
      return words.some(w => {
        const regex = new RegExp(`(?:^|\\s|[.,!?;()\\-])` + w + `(?:$|\\s|[.,!?;()\\-])`, 'i');
        return regex.test(lowerContent);
      });
    };

    if (matchesKeyword(['vaga', 'vagas', 'hiring', 'recruiter', 'recrutamento', 'seleção', 'selecao', 'contratando', 'oportunidade', 'oportunidades'])) {
      authorHeadline = 'Líder de Talent Acquisition & Tech Recruiter';
    } else if (matchesKeyword(['ia', 'ai', 'gpt', 'llm', 'chatgpt', 'openai', 'inteligência artificial', 'artificial intelligence', 'machine learning'])) {
      authorHeadline = 'Especialista em Inteligência Artificial & Computação Cognitiva';
    } else if (matchesKeyword(['agente', 'agentes', 'agent', 'agents'])) {
      authorHeadline = 'Arquiteto de Agentes de IA & Engenharia de Prompts';
    } else if (matchesKeyword(['venda', 'vendas', 'sales', 'sdr', 'comercial', 'salesops', 'outbound', 'inbound', 'pipeline'])) {
      authorHeadline = 'Head de GTM & Operações de Vendas (SalesOps)';
    } else if (matchesKeyword(['automação', 'automacao', 'automation', 'zapier', 'make', 'n8n', 'integromat'])) {
      authorHeadline = 'Engenheiro de Integrações & Automação de Processos';
    } else {
      authorHeadline = 'Profissional de Tecnologia & Negócios no LinkedIn';
    }

    const result = {
      success: !!bestDescription,
      author: authorName || 'Autor LinkedIn',
      authorHeadline: authorHeadline,
      authorAvatar: authorAvatar,
      title: bestTitle || 'Post do LinkedIn',
      description: bestDescription,
      image: postImage,
      mockLikes,
      mockCommentsCount: mockComments,
      mockRepostsCount: mockReposts,
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
