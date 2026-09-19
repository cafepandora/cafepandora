import { getSupabase, Env } from '../../_lib/supabase.js';

// Revisa las cosechas de Honey/Natural que están fermentando en caneca y, a
// las que les falten UMBRAL_HORAS o menos para terminar (y todavía no se les
// avisó), les manda un WhatsApp por CallMeBot y las marca como alertadas
// para no repetir el aviso.
//
// Esto NO lo llama la app — lo llama un cron externo gratis (cron-job.org)
// cada 15-30 minutos pegándole a esta URL con la clave puesta. Ver LEEME.md
// / CLAUDE.md para la guía de configuración paso a paso.
//
// Requiere 3 variables de entorno en Cloudflare Pages (Settings → Environment
// variables), las mismas para Production y Preview:
//   CALLMEBOT_PHONE   → tu número con indicativo, sin +, ej. 573001234567
//   CALLMEBOT_APIKEY  → la que te da CallMeBot cuando lo activas (ver LEEME.md)
//   CRON_SECRET       → cualquier palabra larga que tú inventes, para que
//                        nadie más pueda llamar esta URL y gastarte mensajes
const UMBRAL_HORAS = 2;

const SELECT = 'id, fecha, proceso, fermentacionInicio:fermentacion_inicio, fermentacionHoras:fermentacion_horas';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const clave = new URL(request.url).searchParams.get('clave');
  if (!env.CRON_SECRET || clave !== env.CRON_SECRET) {
    return new Response('No autorizado', { status: 401 });
  }
  if (!env.CALLMEBOT_PHONE || !env.CALLMEBOT_APIKEY) {
    return new Response('Faltan CALLMEBOT_PHONE / CALLMEBOT_APIKEY en las variables de entorno', { status: 500 });
  }

  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from('cosechas')
    .select(SELECT)
    .in('proceso', ['Honey', 'Natural'])
    .is('kilos_pergamino_real', null)
    .eq('fermentacion_alertado', false)
    .not('fermentacion_inicio', 'is', null)
    .not('fermentacion_horas', 'is', null);
  if (error) return new Response(error.message, { status: 500 });

  const ahora = Date.now();
  const umbralMs = UMBRAL_HORAS * 3600000;
  const avisadas: number[] = [];

  for (const c of data || []) {
    const fin = Number(c.fermentacionInicio) + Number(c.fermentacionHoras) * 3600000;
    if (fin - ahora > umbralMs) continue; // todavía falta más de UMBRAL_HORAS, no toca avisar aún

    const horasFaltantes = Math.max(0, (fin - ahora) / 3600000);
    const texto = fin <= ahora
      ? `☕ Café Pandora: la fermentación de ${c.proceso} (cosecha del ${new Date(c.fecha).toLocaleDateString('es-CO')}) ya se cumplió. ¡Revisa la caneca!`
      : `☕ Café Pandora: la fermentación de ${c.proceso} (cosecha del ${new Date(c.fecha).toLocaleDateString('es-CO')}) termina en ${horasFaltantes.toFixed(1)}h. Prepárate para sacarla de la caneca.`;

    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(env.CALLMEBOT_PHONE)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(env.CALLMEBOT_APIKEY)}`;
    try {
      await fetch(url);
      await supabase.from('cosechas').update({ fermentacion_alertado: true }).eq('id', c.id);
      avisadas.push(c.id);
    } catch {
      // Si CallMeBot falla, la dejamos sin marcar para que la próxima
      // corrida del cron lo vuelva a intentar.
    }
  }

  return Response.json({ revisadas: (data || []).length, avisadas });
};
