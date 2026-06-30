import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

  const { booking_id, date, start_time } = await req.json()

  if (!date || !start_time) return json({ error: 'date and start_time are required' }, 400)
  if (!/^\d{2}:\d{2}$/.test(start_time)) return json({ error: 'start_time must be in HH:MM format' }, 400)

  const { data: booking } = await supabase.from('bookings').select('*').eq('id', booking_id).single()
  if (!booking) return json({ error: 'Booking not found' }, 404)
  if (booking.status !== 'pending') return json({ error: 'Only pending bookings can be rescheduled' }, 400)

  const role = user.app_metadata?.role || 'booker'
  if (role === 'booker' && booking.booker_id !== user.id)
    return json({ error: 'Not authorised to reschedule this booking' }, 403)

  // Conflict detection
  const { data: existing } = await supabase
    .from('bookings')
    .select('*, facility:facilities!facility_id(is_whole_hall, type)')
    .eq('date', date)
    .eq('status', 'approved')

  const { data: facility } = await supabase.from('facilities').select('*').eq('id', booking.facility_id).single()
  const startMin = timeToMinutes(start_time)
  const endMin = startMin + booking.duration_slots * 30

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
  if (hasConflict) return json({ error: 'This time slot conflicts with an existing approved booking' }, 409)

  await supabase.from('bookings').update({ date, start_time }).eq('id', booking_id)

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
