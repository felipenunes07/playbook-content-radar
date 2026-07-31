import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { errorMessage } from '../_shared/content.ts';
import { adminClient, corsHeaders, json } from '../_shared/server.ts';

// Webhook do Cal.com: recebe as reuniões agendadas via lead magnet e grava em
// lead_magnet_bookings. Configurado no Cal (Settings → Webhooks, ou direto no
// evento) apontando pra esta function, com os triggers BOOKING_CREATED,
// BOOKING_RESCHEDULED e BOOKING_CANCELLED e um secret.
//
// Autenticação: o Cal assina o corpo cru com HMAC-SHA256 e manda o hex no header
// x-cal-signature-256. Validamos contra CAL_WEBHOOK_SECRET. Enquanto o secret não
// estiver setado (primeiro teste), aceitamos e logamos um aviso.
//
// O `lead_magnet` chega de forma garantida pelo campo oculto (Booking Question com
// identifier `lead-magnet`) preenchido pela URL. As UTMs vêm de bônus quando o Cal
// as expõe em metadata, mas não dependemos delas pra atribuição.

// Confere a assinatura HMAC-SHA256 do corpo cru. Retorna true se válida (ou se não
// há secret configurado ainda — modo primeiro-teste).
async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('CAL_WEBHOOK_SECRET');
  if (!secret) {
    console.warn('CAL_WEBHOOK_SECRET não configurado — aceitando webhook sem validar assinatura');
    return true;
  }
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // Comparação em tempo constante pra não vazar timing.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// Lê um campo pelo identifier em qualquer um dos lugares onde o Cal costuma colocar
// as respostas do formulário, mais o metadata (onde caem as UTMs). Defensivo de
// propósito: o payload do Cal muda de forma entre versões.
function getField(booking: Record<string, any>, identifier: string): string | null {
  const responseValue = booking.responses?.[identifier]?.value ?? booking.responses?.[identifier];
  const userField = booking.userFieldsResponses?.[identifier]?.value ?? booking.userFieldsResponses?.[identifier];
  const bookingField = booking.bookingFieldsResponses?.[identifier];
  const metaValue = booking.metadata?.[identifier];
  const value = responseValue ?? userField ?? bookingField ?? metaValue ?? null;
  if (value == null || value === '') return null;
  return typeof value === 'string' ? value : String(value);
}

function toTimestamp(value: any): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return new Date(value).toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não suportado' }, 405);

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-cal-signature-256');
    if (!(await verifySignature(rawBody, signature))) {
      return json({ error: 'Assinatura inválida' }, 401);
    }

    const body = JSON.parse(rawBody || '{}');
    const trigger = body.triggerEvent ?? null;
    const booking = body.payload ?? body;

    const bookingUid = booking.uid ?? booking.bookingUid ?? null;
    if (!bookingUid) {
      // Sem uid não dá pra deduplicar; guardamos o payload no log e devolvemos 200
      // pra não fazer o Cal ficar reenviando (ex.: ping de teste sem reserva).
      console.warn('Webhook Cal sem booking uid — ignorado:', trigger);
      return json({ ok: true, ignored: 'sem booking uid', trigger });
    }

    // As UTMs, quando presentes, vêm no metadata (chaves utm_*). O lead_magnet vem
    // do campo oculto `lead-magnet`.
    const row = {
      booking_uid: String(bookingUid),
      booking_id: booking.bookingId != null ? String(booking.bookingId) : (booking.id != null ? String(booking.id) : null),
      event_type_id: booking.eventTypeId != null ? String(booking.eventTypeId) : null,
      event_name: booking.eventTitle ?? booking.title ?? booking.type ?? null,
      trigger_event: trigger,
      lead_name: booking.attendees?.[0]?.name ?? getField(booking, 'name'),
      lead_email: booking.attendees?.[0]?.email ?? getField(booking, 'email'),
      lead_magnet: getField(booking, 'lead-magnet') ?? getField(booking, 'lead_magnet') ?? getField(booking, 'leadMagnet'),
      booking_origin: getField(booking, 'booking-origin') ?? getField(booking, 'booking_origin') ?? getField(booking, 'bookingOrigin'),
      lead_owner: getField(booking, 'lead-owner') ?? getField(booking, 'lead_owner') ?? getField(booking, 'leadOwner'),
      cta_position: getField(booking, 'cta-position') ?? getField(booking, 'cta_position') ?? getField(booking, 'ctaPosition'),
      utm_source: getField(booking, 'utm_source') ?? getField(booking, 'utmSource') ?? getField(booking, 'utm-source'),
      utm_medium: getField(booking, 'utm_medium') ?? getField(booking, 'utmMedium') ?? getField(booking, 'utm-medium'),
      utm_campaign: getField(booking, 'utm_campaign') ?? getField(booking, 'utmCampaign') ?? getField(booking, 'utm-campaign'),
      utm_content: getField(booking, 'utm_content') ?? getField(booking, 'utmContent') ?? getField(booking, 'utm-content'),
      utm_term: getField(booking, 'utm_term') ?? getField(booking, 'utmTerm') ?? getField(booking, 'utm-term'),
      start_time: toTimestamp(booking.startTime),
      end_time: toTimestamp(booking.endTime),
      status: booking.status ?? null,
      raw_payload: body,
      updated_at: new Date().toISOString(),
    };

    const client = adminClient();
    // Upsert por booking_uid: reagendamento/cancelamento atualizam a mesma linha.
    const { error } = await client.from('lead_magnet_bookings')
      .upsert(row, { onConflict: 'booking_uid' });
    if (error) throw error;

    return json({ ok: true, booking_uid: row.booking_uid, lead_magnet: row.lead_magnet, trigger });
  } catch (error) {
    console.error('Falha no webhook cal-bookings:', errorMessage(error));
    return json({ error: errorMessage(error) }, 500);
  }
});
