import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendEmail, bookingStatusHtml } from '../_shared/email.ts'

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const role = user.app_metadata?.role || 'booker'
  if (!['controller', 'admin'].includes(role)) return json({ error: 'Forbidden' }, 403)

  const { booking_id, controller_notes } = await req.json()

  const { data: booking } = await supabase.from('bookings').select('*').eq('id', booking_id).single()
  if (!booking) return json({ error: 'Booking not found' }, 404)
  if (booking.status !== 'pending') return json({ error: 'Only pending bookings can be denied' }, 400)

  await supabase.from('bookings').update({
    status: 'denied', controller_id: user.id, controller_notes: controller_notes || null
  }).eq('id', booking_id)

  const { data: booker } = await supabase.from('users').select('*').eq('id', booking.booker_id).single()
  const { data: fac } = await supabase.from('facilities').select('name').eq('id', booking.facility_id).single()
  const facilityName = fac?.name || ''
  const msg = controller_notes
    ? `Your booking for ${facilityName} on ${booking.date} at ${booking.start_time} has been denied: ${controller_notes}`
    : `Your booking for ${facilityName} on ${booking.date} at ${booking.start_time} has been denied`

  if (booker) {
    await supabase.from('notifications').insert({
      user_id: booker.id, booking_id, message: msg, type: 'booking_denied'
    })
    if (booker.contact_preference === 'email' || booker.contact_preference === 'both') {
      await sendEmail(booker.email, `Booking Denied: ${facilityName} on ${booking.date}`,
        bookingStatusHtml('denied', facilityName, booking.date, booking.start_time, booking.duration_slots, controller_notes))
    }
  }

  const { data: updated } = await supabase
    .from('bookings')
    .select(`*, facility:facilities!facility_id(name, color), booker:users!fk_bookings_booker(name, email, organisation), controller:users!fk_bookings_controller(name)`)
    .eq('id', booking_id)
    .single()

  const bk = updated as Record<string, unknown>
  const bFacility = bk.facility as { name: string } | null
  const bBooker = bk.booker as { name: string; email: string; organisation?: string } | null
  const bController = bk.controller as { name: string } | null
  const startMin = timeToMinutes(booking.start_time)
  const endMin = startMin + booking.duration_slots * 30

  return json({
    ...bk,
    facility_name: bFacility?.name,
    booker_name: bBooker?.name,
    booker_email: bBooker?.email,
    booker_organisation: bBooker?.organisation,
    controller_name: bController?.name,
    end_time: minutesToTime(endMin),
    facility: undefined,
    booker: undefined,
    controller: undefined,
  })
})
