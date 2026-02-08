export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Only process our proxied routes
  if (path.startsWith('/storytelling') || 
      path.startsWith('/tg-format') || 
      path.startsWith('/calculator')) {
    
    let destination;
    let basePath;
    
    if (path.startsWith('/storytelling')) {
      basePath = '/storytelling';
      const targetPath = path.replace('/storytelling', '') || '/';
      destination = `https://story-builder-fawn.vercel.app${targetPath}`;
    } else if (path.startsWith('/tg-format')) {
      basePath = '/tg-format';
      const targetPath = path.replace('/tg-format', '') || '/';
      destination = `https://tg-format.vercel.app${targetPath}`;
    } else if (path.startsWith('/calculator')) {
      basePath = '/calculator';
      const targetPath = path.replace('/calculator', '') || '/';
      destination = `https://launch-calculator.vercel.app${targetPath}`;
    }
    
    if (destination) {
      try {
        const response = await fetch(destination, {
          headers: {
            ...Object.fromEntries(request.headers),
            'host': new URL(destination).host,
          },
          method: request.method,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.clone().arrayBuffer() : undefined,
        });
        
        // Process HTML responses to rewrite asset paths
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          let html = await response.text();
          
          // Rewrite absolute asset paths to include the base path
          // Match href="/, src="/, action="/, etc.
          html = html.replace(/(href|src|action)=["'](\/[^"']+)["']/g, (match, attr, assetPath) => {
            // Skip if already full URL or already has base path
            if (assetPath.startsWith('http') || assetPath.startsWith(basePath)) {
              return match;
            }
            // Rewrite absolute paths
            return `${attr}="${basePath}${assetPath}"`;
          });
          
          // Rewrite CSS url() references
          html = html.replace(/url\(["']?(\/[^"')]+)["']?\)/g, (match, assetPath) => {
            if (assetPath.startsWith('http') || assetPath.startsWith(basePath)) {
              return match;
            }
            return `url("${basePath}${assetPath}")`;
          });
          
          // Rewrite JSON in script tags that might contain asset paths
          html = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match, scriptContent) => {
            // Rewrite absolute paths in JSON-like structures
            const rewritten = scriptContent.replace(/"(\/[^"]*\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico|json))"/gi, (m, assetPath) => {
              if (assetPath.startsWith('http') || assetPath.startsWith(basePath)) {
                return m;
              }
              return `"${basePath}${assetPath}"`;
            });
            return match.replace(scriptContent, rewritten);
          });
          
          return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers: {
              ...Object.fromEntries(response.headers),
              'content-type': 'text/html; charset=utf-8',
            },
          });
        }
        
        // For non-HTML (assets), return as-is
        return response;
      } catch (error) {
        console.error('Middleware error:', error);
        return new Response('Error proxying request', { status: 500 });
      }
    }
  }
  
  // For non-proxied routes, let Vercel handle it normally
  return;
}
