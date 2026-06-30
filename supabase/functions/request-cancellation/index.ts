import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendEmail } from '../_shared/email.ts'

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

  const { booking_id, notes } = await req.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, facility:facilities!facility_id(name)')
    .eq('id', booking_id)
    .single()

  if (!booking) return json({ error: 'Booking not found' }, 404)
  if (booking.booker_id !== user.id) return json({ error: 'Not your booking' }, 403)
  if (booking.status !== 'approved') return json({ error: 'Only approved bookings can be cancelled' }, 400)

  await supabase
    .from('bookings')
    .update({ status: 'cancellation_pending', controller_notes: notes || null })
    .eq('id', booking_id)

  const facilityName = (booking.facility as { name: string } | null)?.name || ''

  // Notify all controllers/admins
  const { data: controllers } = await supabase
    .from('users')
    .select('*')
    .in('role', ['controller', 'admin'])

  const { data: booker } = await supabase.from('users').select('*').eq('id', user.id).single()
  const bookerName = booker?.name || 'A booker'
  const msg = `${bookerName} has requested cancellation of their booking for ${facilityName} on ${booking.date} at ${booking.start_time}`

  for (const controller of controllers || []) {
    await supabase.from('notifications').insert({
      user_id: controller.id,
      booking_id,
      message: msg,
      type: 'booking_request',
    })
    if (controller.contact_preference === 'email' || controller.contact_preference === 'both') {
      await sendEmail(
        controller.email,
        `Cancellation Request: ${facilityName} on ${booking.date}`,
        `<p>${msg}</p>${notes ? `<p>Reason: ${notes}</p>` : ''}`
      )
    }
  }

  return json({ message: 'Cancellation request submitted' })
})
