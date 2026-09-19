import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

// Unifica variantes de un mismo cliente (ej. "juan perez" y "Juan Pérez")
// en un solo nombre correcto, actualizando TODAS sus ventas — así no queda
// duplicado en la tabla de clientes ni en el historial.
// Solo toca ventas: las órdenes de maquila tienen su propio directorio
// independiente y no se ven afectadas por esto.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const valoresViejos: string[] = Array.isArray(body.valoresViejos) ? body.valoresViejos.filter(Boolean) : [];
  const nombreNuevo = String(body.nombreNuevo || '').trim();
  if (!nombreNuevo) return new Response('Falta el nombre nuevo', { status: 400 });
  if (!valoresViejos.length) return new Response('Nada que unificar', { status: 400 });

  const { error: errVentas } = await supabase.from('ventas').update({ cliente: nombreNuevo }).in('cliente', valoresViejos);
  if (errVentas) return new Response(errVentas.message, { status: 500 });

  // Deja un solo registro en el directorio, con el nombre correcto.
  await supabase.from('clientes').delete().in('nombre', valoresViejos);
  await supabase.from('clientes').upsert(
    { nombre: nombreNuevo, tipo_cliente: 'Cliente normal', ts: Date.now() },
    { onConflict: 'nombre' }
  );

  return Response.json({ ok: true, nombreNuevo, actualizados: valoresViejos.length });
};
