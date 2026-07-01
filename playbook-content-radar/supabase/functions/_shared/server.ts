import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { errorMessage } from './content.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-collector-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function requireCollectorSecret(request: Request) {
  const expected = Deno.env.get('COLLECTOR_SHARED_SECRET');
  if (!expected) throw new Error('COLLECTOR_SHARED_SECRET não configurado');
  if (request.headers.get('x-collector-secret') !== expected) throw new Error('Execução não autorizada');
}

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Credenciais administrativas do Supabase indisponíveis');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function startRun(client: any, source: string) {
  const { data, error } = await client.from('collection_runs').insert({ source, status: 'running' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function finishRun(client: any, runId: string, values: Record<string, unknown>) {
  const { error } = await client.from('collection_runs').update({ finished_at: new Date().toISOString(), ...values }).eq('id', runId);
  if (error) console.error('Não foi possível finalizar collection_run:', errorMessage(error));
}
