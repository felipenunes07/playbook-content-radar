import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Helper to decode XML/HTML entities
const decodeHtmlEntities = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
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
    let authorHeadline = '';
    let articleBody = '';
    let parsedLikes = 0;
    let parsedComments = 0;

    // Robust JSON-LD parsing
    const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        
        // 1. Author/Creator name
        if (jsonData.author?.name) {
          authorName = jsonData.author.name;
        } else if (jsonData.creator?.name) {
          authorName = jsonData.creator.name;
        }
        
        // 2. Author avatar picture from JSON-LD
        if (jsonData.author?.image?.url) {
          authorAvatar = jsonData.author.image.url;
        } else if (typeof jsonData.author?.image === 'string') {
          authorAvatar = jsonData.author.image;
        } else if (jsonData.creator?.image?.url) {
          authorAvatar = jsonData.creator.image.url;
        } else if (typeof jsonData.creator?.image === 'string') {
          authorAvatar = jsonData.creator.image;
        }

        // 2b. Author headline/description
        if (jsonData.author?.description) {
          authorHeadline = jsonData.author.description;
        } else if (jsonData.creator?.description) {
          authorHeadline = jsonData.creator.description;
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

    // Fallbacks for Author Name
    const bestTitle = ogTitle || pageTitle;
    if (!authorName && bestTitle) {
      const authorMatch = bestTitle.match(/^(.+?)(?:\s+on\s+LinkedIn|\s+no\s+LinkedIn|\s+posted\s+on|\s+\|\s+LinkedIn)/i);
      if (authorMatch) authorName = authorMatch[1].trim();
    }

    // Search HTML for real profile photo if not found in JSON-LD or if it is generic/empty
    if (authorName) {
      const escapedAuthor = authorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Look for src/data-delayed-url in <img> tags with alt containing the author's name
      const imgRegex1 = new RegExp(`<img\\s+[^>]*(?:data-delayed-url|data-ghost-url|src)="([^"]+)"[^>]*alt="(?:View profile for\\s+)?` + escapedAuthor + `"`, 'i');
      const imgRegex2 = new RegExp(`<img\\s+[^>]*alt="(?:View profile for\\s+)?` + escapedAuthor + `"[^>]*(?:data-delayed-url|data-ghost-url|src)="([^"]+)"`, 'i');
      
      const match1 = html.match(imgRegex1);
      const match2 = html.match(imgRegex2);
      const matchedUrl = match1?.[1] || match2?.[1];
      
      if (matchedUrl && !matchedUrl.includes('static.licdn.com') && !matchedUrl.includes('ghost')) {
        authorAvatar = matchedUrl;
      }
    }

    // Extra fallback: try to extract post text from HTML elements
    // LinkedIn sometimes embeds the full text in specific HTML patterns
    if (!articleBody) {
      // Try data-ad-preview-text attribute
      const adPreviewMatch = html.match(/data-ad-preview-text="([^"]+)"/i);
      if (adPreviewMatch && adPreviewMatch[1].length > 100) {
        articleBody = decodeHtmlEntities(adPreviewMatch[1]);
      }
    }
    if (!articleBody) {
      // Try to find text inside feed-shared-text or similar containers
      const feedTextMatch = html.match(/class="feed-shared-(?:update-v2__description|text).*?"[^>]*>([\s\S]*?)<\/(?:div|span)>/i);
      if (feedTextMatch && feedTextMatch[1]) {
        const cleaned = feedTextMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned.length > 100) {
          articleBody = decodeHtmlEntities(cleaned);
        }
      }
    }
    if (!articleBody) {
      // Try break-words class spans (common in LinkedIn post rendering)
      const breakWordsMatch = html.match(/class="break-words[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i);
      if (breakWordsMatch && breakWordsMatch[1]) {
        const cleaned = breakWordsMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned.length > 100) {
          articleBody = decodeHtmlEntities(cleaned);
        }
      }
    }

    // Track where the text came from for debugging
    let textSource = 'none';
    if (articleBody && articleBody === (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i) ? 'jsonld' : '')) {
      textSource = 'jsonld';
    }
    if (articleBody) {
      textSource = articleBody.length > 280 ? 'full' : 'truncated';
    }

    const bestDescription = articleBody || ogDescription;

    // Filter out generic linkedin icons/logos from ogImage
    let postImage = ogImage;
    if (ogImage && (ogImage.includes('static.licdn.com') || ogImage.includes('favicon') || ogImage.includes('default'))) {
      postImage = '';
    }

    // Filter out generic profile avatars from authorAvatar
    if (authorAvatar && (authorAvatar.includes('static.licdn.com') || authorAvatar.includes('ghost') || authorAvatar.includes('default'))) {
      authorAvatar = '';
    }

    // Use real metrics only — don't generate fake ones
    const mockLikes = parsedLikes;
    const mockComments = parsedComments;
    const mockReposts = 0;

    // Use the real headline from JSON-LD if available, otherwise leave empty
    // Don't fabricate headlines based on keywords

    // Decode HTML entities to guarantee standard characters and clean URLs
    const decodedAuthor = decodeHtmlEntities(authorName || 'Autor LinkedIn');
    const decodedTitle = decodeHtmlEntities(bestTitle || 'Post do LinkedIn');
    const decodedDescription = decodeHtmlEntities(bestDescription);
    const decodedAvatar = decodeHtmlEntities(authorAvatar);
    const decodedImage = decodeHtmlEntities(postImage);

    const result = {
      success: !!(bestDescription || bestTitle || authorName),
      author: decodedAuthor,
      authorHeadline: authorHeadline,
      authorAvatar: decodedAvatar,
      title: decodedTitle,
      description: decodedDescription,
      image: decodedImage,
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
