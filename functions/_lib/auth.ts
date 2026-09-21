import { getSupabase, Env } from './supabase.js';

// Revisa que la petición traiga un login válido de Supabase Auth (el token
// que manda el navegador en el header Authorization). Si no hay sesión
// válida, corta la petición aquí mismo — así ya no basta con conocer la URL
// de la función para leer o cambiar datos, hace falta haber iniciado sesión.
export async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return new Response('No autorizado — inicia sesión', { status: 401 });

  const supabase = getSupabase(env);
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return new Response('No autorizado — inicia sesión', { status: 401 });
  } catch {
    // supabase-js puede TIRAR (no solo devolver `error`) en casos raros de
    // desfase de reloj entre Supabase Auth y el Worker (ej. "JWT issued at
    // future") — sin este catch, eso tumbaba la función entera con un 500
    // crudo, bloqueando TODA la sincronización (sincronizar() corta en el
    // primer endpoint que falla) por un problema de sesión, no de datos.
    // Tratarlo igual que cualquier otro token inválido — 401, para que
    // sincronizar() muestre "Tu sesión expiró" en vez de un error opaco.
    return new Response('No autorizado — inicia sesión', { status: 401 });
  }

  return null; // null = todo bien, sigue con la petición normal
}
