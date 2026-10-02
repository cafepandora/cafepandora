// Cloudflare Pages redirige /archivo.html -> /archivo (308), y Google Search
// Console puede rechazar el archivo de verificación si no responde 200
// directo. Esta función lo sirve sin redirección. NO borrar.
export const onRequestGet: PagesFunction = async () =>
  new Response('google-site-verification: google00ede4f9a03974af.html', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
