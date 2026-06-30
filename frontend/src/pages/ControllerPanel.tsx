import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import { Booking } from '../types'
import { format } from 'date-fns'

function slotsToLabel(slots: number): string {
  const hours = Math.floor(slots / 2)
  const mins = (slots % 2) * 30
  if (hours > 0 && mins > 0) return `${hours}h ${mins}min`
  if (hours > 0) return `${hours}h`
  return `${mins}min`
}

type ActionFn = (id: number, action: 'approve' | 'deny', notes: string) => Promise<void>

function BookingRow({ booking, onAction }: { booking: Booking; onAction: ActionFn }) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const act = async (action: 'approve' | 'deny') => {
    setLoading(true)
    await onAction(booking.id, action, notes)
    setLoading(false)
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="p-4 bg-white">
        <div className="flex flex-wrap gap-4 items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{booking.facility_name}</span>
              <span className="text-gray-400">·</span>
              <span className="text-sm text-gray-600">{format(new Date(booking.date), 'd MMM yyyy')}</span>
              <span className="text-sm font-mono text-gray-600">{booking.start_time} – {booking.end_time}</span>
              <span className="text-sm text-gray-500">({slotsToLabel(booking.duration_slots)})</span>
            </div>
            <div className="mt-1 text-sm text-gray-600">
              <span className="font-medium">{booking.booker_name}</span>
              {(booking.organisation || booking.booker_organisation) && (
                <span className="text-gray-400"> · {booking.organisation || booking.booker_organisation}</span>
              )}
            </div>
            {booking.notes && <p className="mt-1 text-sm text-gray-500 italic">"{booking.notes}"</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to={`/bookings/${booking.id}`} className="btn-secondary btn-sm">Details</Link>
            <button onClick={() => setExpanded(!expanded)} className="btn-secondary btn-sm">
              {expanded ? 'Hide' : 'Review'}
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-200 bg-amber-50 p-4">
          <div className="mb-3">
            <label className="label">Notes for booker (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input" rows={2}
              placeholder="Reason for approval/denial, conditions, etc." />
          </div>
          <div className="flex gap-3">
            <button onClick={() => act('approve')} disabled={loading} className="btn-success flex-1">
              {loading ? '...' : 'Approve'}
            </button>
            <button onClick={() => act('deny')} disabled={loading} className="btn-danger flex-1">
              {loading ? '...' : 'Deny'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BatchGroup({ bookings, onAction, onBulkAction }: {
  bookings: Booking[]
  onAction: ActionFn
  onBulkAction: (ids: number[], action: 'approve' | 'deny', notes: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(true)
  const [bulkNotes, setBulkNotes] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)

  const handleBulk = async (action: 'approve' | 'deny') => {
    setBulkLoading(true)
    await onBulkAction(bookings.map(b => b.id), action, bulkNotes)
    setBulkLoading(false)
  }

  const first = bookings[0]
  const last = bookings[bookings.length - 1]

  return (
    <div className="border-2 border-primary-200 rounded-xl overflow-hidden bg-primary-50/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-primary-50/50"
      >
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{first.facility_name}</span>
            <span className="bg-primary-100 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {bookings.length} weekly bookings
            </span>
          </div>
          <div className="text-sm text-gray-600 mt-0.5">
            {format(new Date(first.date), 'd MMM')} – {format(new Date(last.date), 'd MMM yyyy')}
            {' · '}{first.start_time} – {first.end_time}
          </div>
          <div className="text-sm text-gray-600">
            <span className="font-medium">{first.booker_name}</span>
            {(first.organisation || first.booker_organisation) && (
              <span className="text-gray-400"> · {first.organisation || first.booker_organisation}</span>
            )}
          </div>
        </div>
        <svg className={`h-5 w-5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <>
          <div className="border-t border-primary-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Bulk action — notes for booker (optional)</p>
            <textarea value={bulkNotes} onChange={e => setBulkNotes(e.target.value)} className="input mb-2" rows={2}
              placeholder="Applied to all bookings in this batch..." />
            <div className="flex gap-3">
              <button onClick={() => handleBulk('approve')} disabled={bulkLoading} className="btn-success flex-1">
                {bulkLoading ? '...' : `Approve All ${bookings.length}`}
              </button>
              <button onClick={() => handleBulk('deny')} disabled={bulkLoading} className="btn-danger flex-1">
                {bulkLoading ? '...' : `Deny All ${bookings.length}`}
              </button>
            </div>
          </div>
          <div className="border-t border-primary-200 divide-y divide-gray-100 bg-white">
            {bookings.map(b => (
              <BookingRow key={b.id} booking={b} onAction={onAction} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function ControllerPanel() {
  const [pending, setPending] = useState<Booking[]>([])
  const [approvedToday, setApprovedToday] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState('')

  const today = format(new Date(), 'yyyy-MM-dd')

  const load = async () => {
    setLoading(true)
    try {
      const [pendingRes, todayRes] = await Promise.all([
        client.get('/bookings?status=pending'),
        client.get(`/bookings?date=${today}&status=approved`),
      ])
      setPending(pendingRes.data)
      setApprovedToday(todayRes.data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAction = async (id: number, action: 'approve' | 'deny', notes: string) => {
    setActionError('')
    try {
      await client.put(`/bookings/${id}/${action}`, { controller_notes: notes || undefined })
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg || `Failed to ${action} booking.`)
    }
  }

  const handleBulkAction = async (ids: number[], action: 'approve' | 'deny', notes: string) => {
    setActionError('')
    for (const id of ids) {
      try {
        await client.put(`/bookings/${id}/${action}`, { controller_notes: notes || undefined })
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        setActionError(prev => prev ? `${prev}; ${msg}` : (msg || `Failed to ${action} booking ${id}.`))
      }
    }
    await load()
  }

  const { batches, singles } = pending.reduce<{ batches: Record<string, Booking[]>; singles: Booking[] }>(
    (acc, b) => {
      if (b.batch_id) {
        if (!acc.batches[b.batch_id]) acc.batches[b.batch_id] = []
        acc.batches[b.batch_id].push(b)
      } else {
        acc.singles.push(b)
      }
      return acc
    },
    { batches: {}, singles: [] }
  )

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Controller Panel</h1>
        <span className="badge-pending text-sm px-3 py-1">{pending.length} pending</span>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {actionError}
        </div>
      )}

      <section>
        <h2 className="mb-3">Pending Review</h2>
        {pending.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">No pending bookings — all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.values(batches).map(group => (
              <BatchGroup
                key={group[0].batch_id!}
                bookings={group.sort((a, b) => a.date.localeCompare(b.date))}
                onAction={handleAction}
                onBulkAction={handleBulkAction}
              />
            ))}
            {singles.map(b => (
              <BookingRow key={b.id} booking={b} onAction={handleAction} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3">Approved Today — {format(new Date(), 'd MMM yyyy')}</h2>
        {approvedToday.length === 0 ? (
          <p className="text-gray-500 text-sm">No approved bookings for today.</p>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Time</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Facility</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Booker</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {approvedToday
                  .sort((a, b) => a.start_time.localeCompare(b.start_time))
                  .map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{b.start_time} – {b.end_time}</td>
                      <td className="px-4 py-3 font-medium">{b.facility_name}</td>
                      <td className="px-4 py-3">
                        {b.booker_name}
                        {(b.organisation || b.booker_organisation) && (
                          <span className="text-gray-400 text-xs block">{b.organisation || b.booker_organisation}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{slotsToLabel(b.duration_slots)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
