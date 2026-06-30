import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import client from '../api/client'
import { Facility } from '../types'
import { useAuth } from '../contexts/AuthContext'

function slotsToLabel(slots: number): string {
  const hours = Math.floor(slots / 2)
  const mins = (slots % 2) * 30
  if (hours > 0 && mins > 0) return `${hours} hr ${mins} min`
  if (hours > 0) return `${hours} hr`
  return `${mins} min`
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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
  const [repeatEnabled, setRepeatEnabled] = useState(false)
  const [repeatWeeks, setRepeatWeeks] = useState(3)
  const [loading, setLoading] = useState(false)

  const timeSlots = generateTimeSlots()

  useEffect(() => {
    client.get('/facilities').then(r => setFacilities(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (user?.organisation && !organisation) setOrganisation(user.organisation)
  }, [user])

  // Check availability when key fields change
  useEffect(() => {
    if (!facilityId || !date || !startTime || !durationSlots) {
      setConflictWarning('')
      return
    }

    const checkAvailability = async () => {
      try {
        const params = new URLSearchParams({ date, facility_id: facilityId })
        const res = await client.get(`/bookings?${params.toString()}`)
        const bookings = res.data

        const startMin = timeToMin(startTime)
        const endMin = startMin + durationSlots * 30

        const conflict = bookings.find((b: { status: string; start_time: string; duration_slots: number }) => {
          if (b.status !== 'approved') return false
          const bStart = timeToMin(b.start_time)
          const bEnd = bStart + b.duration_slots * 30
          return startMin < bEnd && endMin > bStart
        })

        if (conflict) {
          setConflictWarning('Warning: This time slot has an existing approved booking for this facility.')
        } else {
          setConflictWarning('')
        }
      } catch {
        setConflictWarning('')
      }
    }

    const timeout = setTimeout(checkAvailability, 400)
    return () => clearTimeout(timeout)
  }, [facilityId, date, startTime, durationSlots])

  const timeToMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsConflictError(false)
    setLoading(true)

    const totalBookings = repeatEnabled ? repeatWeeks + 1 : 1
    const batchId = repeatEnabled ? crypto.randomUUID() : undefined
    const payload = {
      facility_id: parseInt(facilityId),
      start_time: startTime,
      duration_slots: durationSlots,
      organisation: organisation.trim() || undefined,
      notes: notes.trim() || undefined,
      batch_id: batchId,
    }

    try {
      if (totalBookings === 1) {
        const res = await client.post('/bookings', { ...payload, date })
        navigate(`/bookings/${res.data.id}`)
        return
      }

      const results: { date: string; ok: boolean; error?: string }[] = []
      for (let i = 0; i < totalBookings; i++) {
        const bookingDate = addDaysToDate(date, i * 7)
        try {
          await client.post('/bookings', { ...payload, date: bookingDate })
          results.push({ date: bookingDate, ok: true })
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          results.push({ date: bookingDate, ok: false, error: msg })
        }
      }

      const failed = results.filter(r => !r.ok)
      if (failed.length === 0) {
        navigate('/bookings')
      } else {
        const failDates = failed.map(r => formatDateShort(r.date)).join(', ')
        const hasConflict = failed.some(r => r.error?.toLowerCase().includes('conflict'))
        setError(`${results.filter(r => r.ok).length} of ${totalBookings} bookings created. Failed: ${failDates}`)
        setIsConflictError(hasConflict)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      const message = msg || 'Failed to create booking. Please try again.'
      setError(message)
      setIsConflictError(message.toLowerCase().includes('conflict'))
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

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
                <button
                  type="button"
                  onClick={() => navigate('/', { state: { initialDate: date, initialView: 'day' } })}
                  className="mt-2 underline hover:no-underline font-medium"
                >
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
              <button
                type="button"
                onClick={() => navigate('/', { state: { initialDate: date, initialView: 'day' } })}
                className="mt-2 underline hover:no-underline font-medium"
              >
                View {date} in calendar →
              </button>
            </div>
          )}

          <div>
            <label className="label">Facility *</label>
            <select
              value={facilityId}
              onChange={e => setFacilityId(e.target.value)}
              className="input"
              required
            >
              <option value="">Select a facility...</option>
              {facilities.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.capacity ? ` (cap. ${f.capacity})` : ''}
                  {f.is_whole_hall ? ' — Whole Hall' : ''}
                  {' '}[{f.type}]
                </option>
              ))}
            </select>
            {facilityId && (
              <p className="text-xs text-gray-500 mt-1">
                {facilities.find(f => f.id === parseInt(facilityId))?.description}
              </p>
            )}
          </div>

          <div>
            <label className="label">Date *</label>
            <input
              type="date"
              value={date}
              min={today}
              onChange={e => setDate(e.target.value)}
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Time *</label>
              <select
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="input"
                required
              >
                {timeSlots.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Duration *</label>
              <select
                value={durationSlots}
                onChange={e => setDurationSlots(parseInt(e.target.value))}
                className="input"
                required
              >
                {Array.from({ length: 16 }, (_, i) => i + 1).map(s => (
                  <option key={s} value={s}>{slotsToLabel(s)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* End time preview */}
          {date && startTime && durationSlots && (
            <div className="text-sm text-gray-600 bg-gray-50 rounded-md px-3 py-2">
              Booking: {date} from {startTime} to {(() => {
                const [h, m] = startTime.split(':').map(Number)
                const endMin = h * 60 + m + durationSlots * 30
                const eh = Math.floor(endMin / 60)
                const em = endMin % 60
                return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
              })()}
            </div>
          )}

          <div>
            <label className="label">Organisation</label>
            <input
              type="text"
              value={organisation}
              onChange={e => setOrganisation(e.target.value)}
              className="input"
              placeholder="Organisation this booking is for"
            />
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input"
              rows={3}
              placeholder="Any additional information or requirements..."
            />
          </div>

          <div className="border border-gray-200 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={repeatEnabled}
                onChange={e => setRepeatEnabled(e.target.checked)}
                className="rounded border-gray-300 text-primary-600"
              />
              <span className="text-sm font-medium text-gray-700">Repeat weekly</span>
            </label>
            {repeatEnabled && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-sm text-gray-600">for</span>
                <select
                  value={repeatWeeks}
                  onChange={e => setRepeatWeeks(parseInt(e.target.value))}
                  className="input py-1 w-auto"
                >
                  {Array.from({ length: 11 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n} more {n === 1 ? 'week' : 'weeks'}</option>
                  ))}
                </select>
                {date && (
                  <span className="text-xs text-gray-500">
                    ({repeatWeeks + 1} bookings, ending {formatDateShort(addDaysToDate(date, repeatWeeks * 7))})
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading
                ? 'Submitting...'
                : repeatEnabled
                ? `Submit ${repeatWeeks + 1} Requests`
                : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
