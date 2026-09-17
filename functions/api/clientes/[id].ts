import { getSupabase, Env } from '../../_lib/supabase.js';

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const supabase = getSupabase(context.env);
  const id = context.params.id as string;
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
