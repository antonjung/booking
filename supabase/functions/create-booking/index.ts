import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendEmail, bookingRequestHtml } from '../_shared/email.ts'

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

  const { facility_id, date, start_time, duration_slots, notes, organisation, batch_id } = await req.json()

  if (!facility_id || !date || !start_time || !duration_slots)
    return json({ error: 'facility_id, date, start_time, and duration_slots are required' }, 400)
  if (!Number.isInteger(duration_slots) || duration_slots < 1 || duration_slots > 16)
    return json({ error: 'duration_slots must be between 1 and 16' }, 400)
  if (!/^\d{2}:\d{2}$/.test(start_time))
    return json({ error: 'start_time must be in HH:MM format' }, 400)

  const { data: facility } = await supabase
    .from('facilities').select('*').eq('id', facility_id).eq('active', true).single()
  if (!facility) return json({ error: 'Facility not found or inactive' }, 404)

  // Conflict detection
  const { data: existing } = await supabase
    .from('bookings')
    .select('*, facility:facilities!facility_id(is_whole_hall, type)')
    .eq('date', date)
    .eq('status', 'approved')

  const startMin = timeToMinutes(start_time)
  const endMin = startMin + duration_slots * 30

  const hasConflict = (existing || []).some((b: Record<string, unknown>) => {
    const bFacility = b.facility as { is_whole_hall: boolean; type: string } | null
    const existStart = timeToMinutes(b.start_time as string)
    const existEnd = existStart + (b.duration_slots as number) * 30
    if (startMin >= existEnd || endMin <= existStart) return false
    if (b.facility_id === facility_id) return true
    if (facility.is_whole_hall && bFacility?.type === 'room') return true
    if (bFacility?.is_whole_hall && facility.type === 'room') return true
    return false
  })
  if (hasConflict) return json({ error: 'This time slot conflicts with an existing approved booking' }, 409)

  const { data: booking, error: bookErr } = await supabase
    .from('bookings')
    .insert({ facility_id, booker_id: user.id, date, start_time, duration_slots, notes: notes || null, organisation: organisation || null, batch_id: batch_id || null, status: 'pending' })
    .select(`*, facility:facilities!facility_id(name, color), booker:users!fk_bookings_booker(name, email, organisation), controller:users!fk_bookings_controller(name)`)
    .single()

  if (bookErr) return json({ error: bookErr.message }, 500)

  // Notify controllers/admins
  const { data: controllers } = await supabase
    .from('users').select('id, email, contact_preference').in('role', ['controller', 'admin'])

  const bk = booking as Record<string, unknown>
  const bFacility = bk.facility as { name: string } | null
  const bBooker = bk.booker as { name: string } | null
  const bookerName = bBooker?.name || 'Unknown'
  const facilityName = bFacility?.name || ''
  const message = `New booking request from ${bookerName} for ${facilityName} on ${date} at ${start_time}`

  for (const ctrl of (controllers || [])) {
    await supabase.from('notifications').insert({
      user_id: ctrl.id, booking_id: (bk.id as number), message, type: 'booking_request'
    })
    if (ctrl.contact_preference === 'email' || ctrl.contact_preference === 'both') {
      await sendEmail(ctrl.email, `New Booking Request: ${facilityName} on ${date}`,
        bookingRequestHtml(bookerName, facilityName, date, start_time, duration_slots, notes))
    }
  }

  const bController = bk.controller as { name: string } | null
  return json({
    ...bk,
    facility_name: facilityName,
    booker_name: bookerName,
    booker_email: (bBooker as Record<string, unknown>)?.email,
    booker_organisation: (bBooker as Record<string, unknown>)?.organisation,
    controller_name: bController?.name,
    end_time: minutesToTime(endMin),
    facility: undefined,
    booker: undefined,
    controller: undefined,
  }, 201)
})
