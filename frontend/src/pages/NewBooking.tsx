import { useState, useEffect, FormEvent, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import client from '../api/client'
import { Facility } from '../types'
import { useAuth } from '../contexts/AuthContext'

type RepeatType = 'none' | 'weekly' | 'fortnightly' | 'monthly-date' | 'monthly-weekday' | 'custom'
type RepeatEndType = 'count' | 'until'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINAL_NAMES = ['1st', '2nd', '3rd', '4th', '5th']

function slotsToLabel(slots: number): string {
  const hours = Math.floor(slots / 2)
  const mins = (slots % 2) * 30
  if (hours > 0 && mins > 0) return `${hours} hr ${mins} min`
  if (hours > 0) return `${hours} hr`
  return `${mins} min`
}

function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = 7; h < 24; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 23) slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  slots.push('23:30')
  return slots
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatDateFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getWeekdayOrdinal(date: Date) {
  return { weekday: date.getDay(), ordinal: Math.floor((date.getDate() - 1) / 7) }
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): Date | null {
  const d = new Date(year, month, 1)
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() + ordinal * 7)
  return d.getMonth() === month ? d : null
}

function generateRepeatDates(
  baseDate: string,
  type: RepeatType,
  endType: RepeatEndType,
  occurrences: number, // total including base
  until: string,
  customDates: string[],
): string[] {
  if (type === 'none') return [baseDate]
  if (type === 'custom') return Array.from(new Set([baseDate, ...customDates])).sort()

  const start = new Date(baseDate + 'T00:00:00')
  const { weekday, ordinal } = getWeekdayOrdinal(start)
  const limitDate = endType === 'until' && until ? new Date(until + 'T00:00:00') : null
  const maxAdded = endType === 'count' ? occurrences - 1 : 104

  const dates: string[] = [baseDate]
  let current = new Date(start)
  let added = 0

  while (added < maxAdded) {
    let next: Date | null

    if (type === 'weekly') {
      next = new Date(current)
      next.setDate(next.getDate() + 7)
    } else if (type === 'fortnightly') {
      next = new Date(current)
      next.setDate(next.getDate() + 14)
    } else if (type === 'monthly-date') {
      const targetDay = start.getDate()
      next = new Date(current)
      next.setDate(1)
      next.setMonth(next.getMonth() + 1)
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
      next.setDate(Math.min(targetDay, lastDay))
    } else {
      const nm = new Date(current)
      nm.setMonth(nm.getMonth() + 1)
      next = nthWeekdayOfMonth(nm.getFullYear(), nm.getMonth(), weekday, ordinal)
      if (!next) { current = nm; continue }
    }

    if (limitDate && next > limitDate) break
    dates.push(toDateStr(next))
    current = next
    added++
  }

  return dates
}

export default function NewBooking() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [facilityId, setFacilityId] = useState('')
  const [date, setDate] = useState(searchParams.get('date') ?? '')
  const [startTime, setStartTime] = useState('09:00')
  const [durationSlots, setDurationSlots] = useState(2)
  const [organisation, setOrganisation] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [isConflictError, setIsConflictError] = useState(false)
  const [conflictWarning, setConflictWarning] = useState('')
  const [loading, setLoading] = useState(false)

  // Repeat
  const [repeatType, setRepeatType] = useState<RepeatType>('none')
  const [repeatEndType, setRepeatEndType] = useState<RepeatEndType>('count')
  const [repeatCount, setRepeatCount] = useState(6) // total occurrences including base
  const [repeatUntil, setRepeatUntil] = useState('')
  const [customDates, setCustomDates] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)

  const timeSlots = generateTimeSlots()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    client.get('/facilities').then(r => setFacilities(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (user?.organisation && !organisation) setOrganisation(user.organisation)
  }, [user])

  useEffect(() => {
    if (!facilityId || !date || !startTime || !durationSlots) { setConflictWarning(''); return }
    const check = async () => {
      try {
        const res = await client.get(`/bookings?date=${date}&facility_id=${facilityId}`)
        const sMin = timeToMin(startTime), eMin = sMin + durationSlots * 30
        const clash = res.data.find((b: { status: string; start_time: string; duration_slots: number }) => {
          if (b.status !== 'approved') return false
          const bs = timeToMin(b.start_time), be = bs + b.duration_slots * 30
          return sMin < be && eMin > bs
        })
        setConflictWarning(clash ? 'Warning: This time slot has an existing approved booking for this facility.' : '')
      } catch { setConflictWarning('') }
    }
    const t = setTimeout(check, 400)
    return () => clearTimeout(t)
  }, [facilityId, date, startTime, durationSlots])

  const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

  const allDates = useMemo(() =>
    date ? generateRepeatDates(date, repeatType, repeatEndType, repeatCount, repeatUntil, customDates) : [],
    [date, repeatType, repeatEndType, repeatCount, repeatUntil, customDates]
  )

  const endTime = useMemo(() => {
    const [h, m] = startTime.split(':').map(Number)
    const e = h * 60 + m + durationSlots * 30
    return `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`
  }, [startTime, durationSlots])

  const weekdayOrdinalLabel = useMemo(() => {
    if (!date) return ''
    const d = new Date(date + 'T00:00:00')
    const { weekday, ordinal } = getWeekdayOrdinal(d)
    return `${ORDINAL_NAMES[ordinal]} ${WEEKDAY_NAMES[weekday]}`
  }, [date])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsConflictError(false)
    setLoading(true)

    const batchId = allDates.length > 1 ? crypto.randomUUID() : undefined
    const payload = {
      facility_id: parseInt(facilityId),
      start_time: startTime,
      duration_slots: durationSlots,
      organisation: organisation.trim() || undefined,
      notes: notes.trim() || undefined,
      batch_id: batchId,
    }

    try {
      if (allDates.length === 1) {
        const res = await client.post('/bookings', { ...payload, date })
        navigate(`/bookings/${res.data.id}`)
        return
      }

      const results: { date: string; ok: boolean; error?: string }[] = []
      for (const d of allDates) {
        try {
          await client.post('/bookings', { ...payload, date: d })
          results.push({ date: d, ok: true })
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          results.push({ date: d, ok: false, error: msg })
        }
      }

      const failed = results.filter(r => !r.ok)
      if (failed.length === 0) {
        navigate('/bookings')
      } else {
        const hasConflict = failed.some(r => r.error?.toLowerCase().includes('conflict'))
        setError(`${results.filter(r => r.ok).length} of ${allDates.length} bookings created. Failed: ${failed.map(r => formatDateShort(r.date)).join(', ')}`)
        setIsConflictError(hasConflict)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      const message = msg || 'Failed to create booking.'
      setError(message)
      setIsConflictError(message.toLowerCase().includes('conflict'))
    } finally {
      setLoading(false)
    }
  }

  const isRepeating = repeatType !== 'none'

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1>New Booking Request</h1>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              <div>{error}</div>
              {isConflictError && date && (
                <button type="button" onClick={() => navigate('/', { state: { initialDate: date, initialView: 'day' } })}
                  className="mt-2 underline hover:no-underline font-medium">
                  View {date} in calendar →
                </button>
              )}
            </div>
          )}

          {conflictWarning && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-md text-sm">
              <div className="flex items-start gap-2">
                <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {conflictWarning}
              </div>
              <button type="button" onClick={() => navigate('/', { state: { initialDate: date, initialView: 'day' } })}
                className="mt-2 underline hover:no-underline font-medium">
                View {date} in calendar →
              </button>
            </div>
          )}

          <div>
            <label className="label">Facility *</label>
            <select value={facilityId} onChange={e => setFacilityId(e.target.value)} className="input" required>
              <option value="">Select a facility...</option>
              {facilities.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}{f.capacity ? ` (cap. ${f.capacity})` : ''}{f.is_whole_hall ? ' — Whole Hall' : ''} [{f.type}]
                </option>
              ))}
            </select>
            {facilityId && (
              <p className="text-xs text-gray-500 mt-1">{facilities.find(f => f.id === parseInt(facilityId))?.description}</p>
            )}
          </div>

          <div>
            <label className="label">Start Date *</label>
            <input type="date" value={date} min={today}
              onChange={e => { setDate(e.target.value); setCustomDates([]) }}
              className="input" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Time *</label>
              <select value={startTime} onChange={e => setStartTime(e.target.value)} className="input" required>
                {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Duration *</label>
              <select value={durationSlots} onChange={e => setDurationSlots(parseInt(e.target.value))} className="input" required>
                {Array.from({ length: 16 }, (_, i) => i + 1).map(s => (
                  <option key={s} value={s}>{slotsToLabel(s)}</option>
                ))}
              </select>
            </div>
          </div>

          {date && (
            <div className="text-sm text-gray-600 bg-gray-50 rounded-md px-3 py-2">
              {isRepeating
                ? `${allDates.length} booking${allDates.length !== 1 ? 's' : ''} · ${startTime}–${endTime} each`
                : `${date} · ${startTime}–${endTime}`}
            </div>
          )}

          <div>
            <label className="label">Organisation</label>
            <input type="text" value={organisation} onChange={e => setOrganisation(e.target.value)}
              className="input" placeholder="Organisation this booking is for" />
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="input" rows={3} placeholder="Any additional information or requirements..." />
          </div>

          {/* ── Repeat ── */}
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            <div className="p-3 flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 w-16 shrink-0">Repeat</label>
              <select value={repeatType}
                onChange={e => { setRepeatType(e.target.value as RepeatType); setCustomDates([]) }}
                className="input py-1.5 text-sm flex-1">
                <option value="none">No repeat</option>
                <option value="weekly">Every week</option>
                <option value="fortnightly">Every 2 weeks</option>
                <option value="monthly-date">Monthly — same date{date ? ` (${new Date(date + 'T00:00:00').getDate()}th)` : ''}</option>
                <option value="monthly-weekday">Monthly — same weekday{date ? ` (${weekdayOrdinalLabel})` : ''}</option>
                <option value="custom">Custom dates</option>
              </select>
            </div>

            {repeatType !== 'none' && repeatType !== 'custom' && (
              <div className="p-3 flex items-center gap-2 flex-wrap">
                <select value={repeatEndType} onChange={e => setRepeatEndType(e.target.value as RepeatEndType)}
                  className="input py-1.5 text-sm w-auto">
                  <option value="count">Total occurrences</option>
                  <option value="until">Until date</option>
                </select>
                {repeatEndType === 'count' ? (
                  <select value={repeatCount} onChange={e => setRepeatCount(parseInt(e.target.value))}
                    className="input py-1.5 text-sm w-auto">
                    {Array.from({ length: 51 }, (_, i) => i + 2).map(n => (
                      <option key={n} value={n}>{n} sessions</option>
                    ))}
                  </select>
                ) : (
                  <input type="date" value={repeatUntil} min={date || today}
                    onChange={e => setRepeatUntil(e.target.value)}
                    className="input py-1.5 text-sm w-auto" />
                )}
              </div>
            )}

            {repeatType === 'custom' && date && (
              <div className="p-3 space-y-2">
                <p className="text-xs text-gray-500">Pick additional dates — the start date is always included.</p>
                <input type="date" min={today} className="input py-1.5 text-sm"
                  onChange={e => {
                    const d = e.target.value
                    if (d && d !== date && !customDates.includes(d))
                      setCustomDates(prev => [...prev, d].sort())
                    e.target.value = ''
                  }} />
                {customDates.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {customDates.map(d => (
                      <span key={d} className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 text-xs px-2 py-0.5 rounded-full">
                        {formatDateShort(d)}
                        <button type="button" onClick={() => setCustomDates(p => p.filter(x => x !== d))}
                          className="hover:text-primary-900">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isRepeating && allDates.length > 0 && (
              <div className="p-3">
                <button type="button" onClick={() => setShowPreview(!showPreview)}
                  className="text-xs text-primary-600 hover:text-primary-800 font-medium">
                  {showPreview ? '▲ Hide' : '▼ Show'} all {allDates.length} dates
                </button>
                {showPreview && (
                  <div className="mt-2 max-h-44 overflow-y-auto space-y-0.5 pr-1">
                    {allDates.map((d, i) => (
                      <div key={d} className="text-xs text-gray-600 flex gap-2 items-center">
                        <span className="text-gray-400 w-5 text-right">{i + 1}.</span>
                        <span>{formatDateFull(d)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Submitting…' : allDates.length > 1 ? `Submit ${allDates.length} Requests` : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
