import { getSupabase, Env } from '../../_lib/supabase.js';

// Lee el precio interno de referencia (café pergamino seco, carga de 125 kg)
// que publica la Federación Nacional de Cafeteros en su página pública, y lo
// guarda en precio_cafe_fnc. La Federación NO tiene API/JSON — solo esta
// página HTML — así que esto es scraping de un formato que puede cambiar
// sin aviso; si un día deja de funcionar, revisar primero si cambió el
// marcado de "fnc-ticker-name"/"fnc-ticker-value" en la página fuente.
//
// Igual que la alerta de fermentación, esto NO lo llama la app — lo llama
// un cron externo gratis (cron-job.org), una vez al día en la tarde entre
// semana (la Federación publica de lunes a viernes en la tarde), pegándole
// a esta URL con la clave puesta:
//   https://cafepandora.pages.dev/api/cron/precio-fnc?clave=<CRON_SECRET>
// Reutiliza el MISMO CRON_SECRET que ya existe para la fermentación — no
// hace falta ninguna variable de entorno nueva.
const URL_FNC = 'https://federaciondecafeteros.org/wp/estadisticas-cafeteras/';

function extraerValor(html: string, nombre: string): string | null {
  const idx = html.indexOf(`fnc-ticker-name">${nombre}`);
  if (idx === -1) return null;
  const m = html.slice(idx).match(/fnc-ticker-value">([^<]+)</);
  return m ? m[1].trim() : null;
}
function extraerFecha(html: string, nombre: string): string | null {
  const idx = html.indexOf(`fnc-ticker-name">${nombre}`);
  if (idx === -1) return null;
  const m = html.slice(idx).match(/t-fecha">Fecha:\s*([\d-]+)</);
  return m ? m[1].trim() : null;
}
// Formato colombiano: el punto es separador de miles, la coma es de
// decimales — al revés que en inglés. "$2.030.000" -> 2030000, "280,50" -> 280.5
function numeroCO(s: string | null): number | null {
  if (!s) return null;
  const limpio = s.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const clave = new URL(request.url).searchParams.get('clave');
  if (!env.CRON_SECRET || clave !== env.CRON_SECRET) {
    return new Response('No autorizado', { status: 401 });
  }

  const resp = await fetch(URL_FNC, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CafePandoraBot/1.0)' } });
  if (!resp.ok) return new Response(`No se pudo leer la página de la Federación (${resp.status})`, { status: 502 });
  const html = await resp.text();

  const precioCarga = numeroCO(extraerValor(html, 'Precio interno de referencia:'));
  const fecha = extraerFecha(html, 'Precio interno de referencia:');
  if (precioCarga == null || !fecha) {
    return new Response('No se encontró el precio en la página — puede que la Federación haya cambiado el formato.', { status: 502 });
  }
  const bolsaNy = numeroCO(extraerValor(html, 'Bolsa de NY:'));
  const tasaCambio = numeroCO(extraerValor(html, 'Tasa de cambio:'));

  const supabase = getSupabase(env);
  const { error } = await supabase.from('precio_cafe_fnc').upsert({
    fecha, precio_carga: precioCarga, bolsa_ny: bolsaNy, tasa_cambio: tasaCambio, ts: Date.now(),
  }, { onConflict: 'fecha' });
  if (error) return new Response(error.message, { status: 500 });

  return Response.json({ fecha, precioCarga, bolsaNy, tasaCambio });
};
