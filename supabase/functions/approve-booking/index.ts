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
  if (!['pending', 'cancellation_pending'].includes(booking.status)) {
    return json({ error: 'Only pending or cancellation-pending bookings can be actioned' }, 400)
  }

  const isCancellationApproval = booking.status === 'cancellation_pending'
  const startMin = timeToMinutes(booking.start_time)
  const endMin = startMin + booking.duration_slots * 30

  if (!isCancellationApproval) {
    // Conflict check only needed when approving a new booking
    const { data: existing } = await supabase
      .from('bookings')
      .select('*, facility:facilities!facility_id(is_whole_hall, type)')
      .eq('date', booking.date)
      .eq('status', 'approved')

    const { data: facility } = await supabase.from('facilities').select('*').eq('id', booking.facility_id).single()

    const hasConflict = (existing || []).some((b: Record<string, unknown>) => {
      if (b.id === booking_id) return false
      const bFacility = b.facility as { is_whole_hall: boolean; type: string } | null
      const existStart = timeToMinutes(b.start_time as string)
      const existEnd = existStart + (b.duration_slots as number) * 30
      if (startMin >= existEnd || endMin <= existStart) return false
      if (b.facility_id === booking.facility_id) return true
      if (facility?.is_whole_hall && bFacility?.type === 'room') return true
      if (bFacility?.is_whole_hall && facility?.type === 'room') return true
      return false
    })
    if (hasConflict) return json({ error: 'Cannot approve: conflicts with another approved booking' }, 409)
  }

  const newStatus = isCancellationApproval ? 'cancelled' : 'approved'
  await supabase.from('bookings').update({
    status: newStatus, controller_id: user.id, controller_notes: controller_notes || null
  }).eq('id', booking_id)

  // Notify booker
  const { data: booker } = await supabase.from('users').select('*').eq('id', booking.booker_id).single()
  const { data: fac } = await supabase.from('facilities').select('name').eq('id', booking.facility_id).single()
  const facilityName = fac?.name || ''

  let msg: string
  let emailSubject: string
  if (isCancellationApproval) {
    msg = controller_notes
      ? `Your cancellation request for ${facilityName} on ${booking.date} has been approved: ${controller_notes}`
      : `Your cancellation request for ${facilityName} on ${booking.date} has been approved`
    emailSubject = `Cancellation Approved: ${facilityName} on ${booking.date}`
  } else {
    msg = controller_notes
      ? `Your booking for ${facilityName} on ${booking.date} at ${booking.start_time} has been approved: ${controller_notes}`
      : `Your booking for ${facilityName} on ${booking.date} at ${booking.start_time} has been approved`
    emailSubject = `Booking Approved: ${facilityName} on ${booking.date}`
  }

  if (booker) {
    await supabase.from('notifications').insert({
      user_id: booker.id, booking_id, message: msg, type: 'booking_approved'
    })
    if (booker.contact_preference === 'email' || booker.contact_preference === 'both') {
      await sendEmail(booker.email, emailSubject,
        bookingStatusHtml(newStatus, facilityName, booking.date, booking.start_time, booking.duration_slots, controller_notes))
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
