import { getSupabase, Env } from './supabase.js';

async function validarSesion(request: Request, env: Env): Promise<{ error: Response | null; email: string | null }> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: new Response('No autorizado — inicia sesión', { status: 401 }), email: null };

  const supabase = getSupabase(env);
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { error: new Response('No autorizado — inicia sesión', { status: 401 }), email: null };
    return { error: null, email: data.user.email || null };
  } catch {
    // supabase-js puede TIRAR (no solo devolver `error`) en casos raros de
    // desfase de reloj entre Supabase Auth y el Worker (ej. "JWT issued at
    // future") — sin este catch, eso tumbaba la función entera con un 500
    // crudo, bloqueando TODA la sincronización (sincronizar() corta en el
    // primer endpoint que falla) por un problema de sesión, no de datos.
    // Tratarlo igual que cualquier otro token inválido — 401, para que
    // sincronizar() muestre "Tu sesión expiró" en vez de un error opaco.
    return { error: new Response('No autorizado — inicia sesión', { status: 401 }), email: null };
  }
}

// Revisa que la petición traiga un login válido de Supabase Auth (el token
// que manda el navegador en el header Authorization). Si no hay sesión
// válida, corta la petición aquí mismo — así ya no basta con conocer la URL
// de la función para leer o cambiar datos, hace falta haber iniciado sesión.
export async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  return (await validarSesion(request, env)).error;
}

// Igual que requireAuth(), pero además devuelve el correo real de quien
// tiene la sesión abierta — para los endpoints que guardan `creado_por`
// (ver migracion_atribucion_usuarios.sql). A diferencia de "usuario"/
// "pagadoPor" (texto que el navegador manda tal cual, la persona lo puede
// escribir mal o dejar el de otro guardado en localStorage), este correo
// sale de validar el token contra Supabase Auth — no se le puede mentir
// desde el navegador.
export async function requireAuthConUsuario(request: Request, env: Env): Promise<{ error: Response | null; email: string | null }> {
  return validarSesion(request, env);
}
