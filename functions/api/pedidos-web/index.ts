import { getSupabase, Env } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

// Avisa a Juan por WhatsApp (mismo CallMeBot que ya usa la alerta de
// fermentación, reutilizando las mismas 2 variables de entorno) apenas
// entra un pedido nuevo desde la página pública — así no hace falta estar
// pendiente de la bandeja para enterarse. Si CallMeBot falla o las
// variables no están puestas, el pedido igual se guarda normal; esto es
// solo una notificación, nunca debe bloquear ni tumbar el pedido real.
function avisarPedidoNuevo(env: Env, nombreCliente: string, valorTotal: number, itemsResumen: string) {
  if (!env.CALLMEBOT_PHONE || !env.CALLMEBOT_APIKEY) return;
  const texto = `☕ Café Pandora: nuevo pedido web de ${nombreCliente} por $${Math.round(valorTotal).toLocaleString('es-CO')}.\n${itemsResumen}`;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(env.CALLMEBOT_PHONE)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(env.CALLMEBOT_APIKEY)}`;
  return fetch(url).catch(() => {});
}

const SELECT = 'id, nombreCliente:nombre_cliente, telefono, items, valorTotal:valor_total, notas, estado, ts';

// GET lo usa la app interna para ver la bandeja de pedidos entrantes.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context.request, context.env);
  if (authError) return authError;

  const supabase = getSupabase(context.env);
  const { data, error } = await supabase.from('pedidos_web').select(SELECT);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
};

// POST es público (sin clave) — lo llama la página de pedidos del cliente.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const body: any = await context.request.json();

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return new Response('El pedido está vacío', { status: 400 });
  const nombreCliente = String(body.nombreCliente || '').trim();
  if (!nombreCliente) return new Response('Falta el nombre del cliente', { status: 400 });

  const valorTotal = items.reduce((s: number, it: any) => s + (Number(it.valor) || 0), 0);

  const { data, error } = await supabase.from('pedidos_web').insert({
    nombre_cliente: nombreCliente,
    telefono: body.telefono || null,
    items,
    valor_total: valorTotal,
    notas: body.notas || null,
    estado: 'nuevo',
    ts: Date.now(),
  }).select(SELECT).single();

  if (error) return new Response(error.message, { status: 500 });

  const itemsResumen = items.map((it: any) =>
    `${it.cantidad} ${it.presentacion || ''} de ${it.lote || it.servicio || ''}`.trim()
  ).join(' · ');
  context.waitUntil(Promise.resolve(avisarPedidoNuevo(context.env, nombreCliente, valorTotal, itemsResumen)));

  return Response.json(data, { status: 201 });
};
