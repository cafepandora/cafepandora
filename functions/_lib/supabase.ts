import { createClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Usadas solo por functions/api/cron/fermentacion.ts para la alerta de
  // WhatsApp — ver ese archivo para cómo se consiguen.
  CALLMEBOT_PHONE?: string;
  CALLMEBOT_APIKEY?: string;
  CRON_SECRET?: string;
}

// La service role key SOLO vive aquí, en el servidor (variable de entorno de
// Cloudflare). El navegador nunca la ve — siempre habla con /api/..., nunca
// directo con Supabase. Esa es la seguridad real del sistema.
export function getSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
