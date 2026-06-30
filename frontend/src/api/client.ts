import supabase from '../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = { data: any }

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function flattenBooking(b: Record<string, unknown>) {
  const facility = b.facility as Record<string, unknown> | null
  const booker = b.booker as Record<string, unknown> | null
  const controller = b.controller as Record<string, unknown> | null
  const startMin = timeToMinutes(b.start_time as string)
  const endMin = startMin + (b.duration_slots as number) * 30
  return {
    ...b,
    facility_name: facility?.name ?? '',
    booker_name: booker?.name ?? '',
    booker_email: booker?.email ?? '',
    booker_organisation: booker?.organisation,
    organisation: b.organisation ?? booker?.organisation ?? null,
    batch_id: b.batch_id ?? null,
    controller_name: controller?.name,
    end_time: minutesToTime(endMin),
    facility: undefined,
    booker: undefined,
    controller: undefined,
  }
}

function flattenNotification(n: Record<string, unknown>) {
  const booking = n.booking as Record<string, unknown> | null
  const facility = booking?.facility as Record<string, unknown> | null
  return {
    ...n,
    booking_date: booking?.date,
    booking_start_time: booking?.start_time,
    facility_name: facility?.name,
    booking: undefined,
  }
}

const BOOKING_SELECT = `*, facility:facilities!facility_id(name, color), booker:users!fk_bookings_booker(name, email, organisation), controller:users!fk_bookings_controller(name)`
const NOTIFICATION_SELECT = `*, booking:bookings(date, start_time, facility:facilities!facility_id(name))`

function dbErr(error: { message: string }) {
  throw { response: { data: { error: error.message } } }
}

async function invokeFunction(name: string, body: unknown, method = 'POST'): Promise<R> {
  const { data, error } = await supabase.functions.invoke(name, { body, method } as Parameters<typeof supabase.functions.invoke>[1])
  if (error) {
    let message = error.message || 'Request failed'
    try {
      if ('context' in error && error.context instanceof Response) {
        const b = await (error.context as Response).json()
        message = b?.error || message
      }
    } catch { /* noop */ }
    throw { response: { data: { error: message } } }
  }
  return { data }
}

async function handleGet(url: string): Promise<R> {
  const [path, qs] = url.split('?')
  const params = new URLSearchParams(qs || '')

  if (path === '/bookings') {
    let q = supabase.from('bookings').select(BOOKING_SELECT)
    if (params.get('date')) q = q.eq('date', params.get('date')!)
    if (params.get('status')) q = q.eq('status', params.get('status')!)
    if (params.get('facility_id')) q = q.eq('facility_id', parseInt(params.get('facility_id')!))
    q = q.order('date', { ascending: false }).order('start_time', { ascending: false })
    const { data, error } = await q
    if (error) dbErr(error)
    return { data: (data || []).map(b => flattenBooking(b as Record<string, unknown>)) }
  }

  if (path === '/facilities') {
    const { data, error } = await supabase.from('facilities').select('*').eq('active', true).order('name')
    if (error) dbErr(error)
    return { data: data || [] }
  }

  if (path === '/facilities/all') {
    const { data, error } = await supabase.from('facilities').select('*').order('name')
    if (error) dbErr(error)
    return { data: data || [] }
  }

  if (path === '/users') {
    const { data, error } = await supabase.from('users').select('*').order('name')
    if (error) dbErr(error)
    return { data: data || [] }
  }

  if (path === '/notifications') {
    const { data, error } = await supabase
      .from('notifications').select(NOTIFICATION_SELECT)
      .order('read', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) dbErr(error)
    return { data: (data || []).map(n => flattenNotification(n as Record<string, unknown>)) }
  }

  if (path === '/notifications/count') {
    const { count, error } = await supabase
      .from('notifications').select('*', { count: 'exact', head: true }).eq('read', false)
    if (error) dbErr(error)
    return { data: { count: count || 0 } }
  }

  throw { response: { data: { error: `Unknown GET: ${url}` } } }
}

async function handlePost(url: string, body?: unknown): Promise<R> {
  if (url === '/bookings') return invokeFunction('create-booking', body)
  if (url === '/users') return invokeFunction('admin-user', body, 'POST')

  if (url === '/facilities') {
    const { data, error } = await supabase.from('facilities').insert(body as object).select().single()
    if (error) dbErr(error)
    return { data }
  }

  throw { response: { data: { error: `Unknown POST: ${url}` } } }
}

async function handlePut(url: string, body?: unknown): Promise<R> {
  const approveMatch = url.match(/^\/bookings\/(\d+)\/approve$/)
  if (approveMatch) return invokeFunction('approve-booking', { booking_id: parseInt(approveMatch[1]), ...(body as object) })

  const denyMatch = url.match(/^\/bookings\/(\d+)\/deny$/)
  if (denyMatch) return invokeFunction('deny-booking', { booking_id: parseInt(denyMatch[1]), ...(body as object) })

  const cancelRequestMatch = url.match(/^\/bookings\/(\d+)\/request-cancellation$/)
  if (cancelRequestMatch) return invokeFunction('request-cancellation', { booking_id: parseInt(cancelRequestMatch[1]), ...(body as object) })

  const userMatch = url.match(/^\/users\/(.+)$/)
  if (userMatch) return invokeFunction('admin-user', { id: userMatch[1], ...(body as object) }, 'PUT')

  if (url === '/notifications/read-all') {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('read', false)
    if (error) dbErr(error)
    return { data: { message: 'All notifications marked as read' } }
  }

  const notifMatch = url.match(/^\/notifications\/(\d+)\/read$/)
  if (notifMatch) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', parseInt(notifMatch[1]))
    if (error) dbErr(error)
    return { data: { message: 'Notification marked as read' } }
  }

  const facilityMatch = url.match(/^\/facilities\/(\d+)$/)
  if (facilityMatch) {
    const { data, error } = await supabase.from('facilities').update(body as object).eq('id', parseInt(facilityMatch[1])).select().single()
    if (error) dbErr(error)
    return { data }
  }

  throw { response: { data: { error: `Unknown PUT: ${url}` } } }
}

async function handlePatch(url: string, body?: unknown): Promise<R> {
  const match = url.match(/^\/bookings\/(\d+)$/)
  if (match) return invokeFunction('reschedule-booking', { booking_id: parseInt(match[1]), ...(body as object) })
  throw { response: { data: { error: `Unknown PATCH: ${url}` } } }
}

async function handleDelete(url: string): Promise<R> {
  const bookingMatch = url.match(/^\/bookings\/(\d+)$/)
  if (bookingMatch) {
    const { error } = await supabase.from('bookings').delete().eq('id', parseInt(bookingMatch[1]))
    if (error) dbErr(error)
    return { data: { message: 'Booking cancelled' } }
  }

  const userMatch = url.match(/^\/users\/(.+)$/)
  if (userMatch) return invokeFunction('admin-user', { id: userMatch[1] }, 'DELETE')

  const facilityMatch = url.match(/^\/facilities\/(\d+)$/)
  if (facilityMatch) {
    const { error } = await supabase.from('facilities').delete().eq('id', parseInt(facilityMatch[1]))
    if (error) dbErr(error)
    return { data: { message: 'Facility deleted' } }
  }

  throw { response: { data: { error: `Unknown DELETE: ${url}` } } }
}

const client = {
  get: handleGet,
  post: handlePost,
  put: handlePut,
  patch: handlePatch,
  delete: handleDelete,
}

export default client
