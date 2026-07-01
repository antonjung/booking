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

type RowAction = 'approve' | 'deny' | 'skip'

// ── Bulk review modal ─────────────────────────────────────────────────────────

function BulkReviewModal({ bookings, onClose, onSubmit }: {
  bookings: Booking[]
  onClose: () => void
  onSubmit: (actions: { id: number; action: 'approve' | 'deny'; notes: string }[]) => Promise<void>
}) {
  const [rowActions, setRowActions] = useState<Record<number, RowAction>>(
    () => Object.fromEntries(bookings.map(b => [b.id, 'approve' as RowAction]))
  )
  const [notes, setNotes] = useState('')
  const [rowNotes, setRowNotes] = useState<Record<number, string>>({})
  const [rowNoteOpen, setRowNoteOpen] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(false)

  const setAll = (a: RowAction) => setRowActions(Object.fromEntries(bookings.map(b => [b.id, a])))
  const toggle = (id: number, a: RowAction) => setRowActions(prev => ({ ...prev, [id]: a }))
  const toggleRowNote = (id: number) => setRowNoteOpen(prev => ({ ...prev, [id]: !prev[id] }))
  const setRowNote = (id: number, val: string) => setRowNotes(prev => ({ ...prev, [id]: val }))

  const approveCount = Object.values(rowActions).filter(a => a === 'approve').length
  const denyCount = Object.values(rowActions).filter(a => a === 'deny').length
  const skipCount = Object.values(rowActions).filter(a => a === 'skip').length

  const handleSubmit = async () => {
    setLoading(true)
    const actions = Object.entries(rowActions)
      .filter(([, a]) => a !== 'skip')
      .map(([id, a]) => ({
        id: parseInt(id),
        action: a as 'approve' | 'deny',
        notes: rowNotes[parseInt(id)]?.trim() || notes,
      }))
    await onSubmit(actions)
    setLoading(false)
  }

  const first = bookings[0]
  const last = bookings[bookings.length - 1]

  const actionBtn = (id: number, a: RowAction, label: string, active: string, idle: string) => (
    <button
      type="button"
      onClick={() => toggle(id, a)}
      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${rowActions[id] === a ? active : idle}`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Review Batch Booking</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {first.facility_name} · {format(new Date(first.date), 'd MMM')} – {format(new Date(last.date), 'd MMM yyyy')}
              · {first.start_time}–{first.end_time}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">
              <span className="font-medium">{first.booker_name}</span>
              {(first.organisation || first.booker_organisation) && (
                <span className="text-gray-400"> · {first.organisation || first.booker_organisation}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0 mt-0.5">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick-set buttons */}
        <div className="px-5 py-2.5 border-b bg-gray-50 flex items-center gap-2 text-sm">
          <span className="text-gray-500 text-xs">Set all:</span>
          <button onClick={() => setAll('approve')}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">
            Approve all
          </button>
          <button onClick={() => setAll('deny')}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-medium">
            Deny all
          </button>
          <button onClick={() => setAll('skip')}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded font-medium">
            Skip all
          </button>
        </div>

        {/* Date rows */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {bookings.map((b, i) => (
            <div key={b.id} className={`px-5 py-3 ${rowActions[b.id] === 'skip' ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-xs w-5 text-right flex-shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900">{format(new Date(b.date), 'EEEE d MMM yyyy')}</div>
                  <div className="text-xs text-gray-400">{b.start_time}–{b.end_time} · {slotsToLabel(b.duration_slots)}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {actionBtn(b.id, 'approve', 'Approve', 'bg-green-600 text-white', 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                  {actionBtn(b.id, 'deny', 'Deny', 'bg-red-600 text-white', 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                  {actionBtn(b.id, 'skip', 'Skip', 'bg-gray-400 text-white', 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                  <button type="button" onClick={() => toggleRowNote(b.id)}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${rowNotes[b.id] ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {rowNotes[b.id] ? 'Note ✓' : '+ Note'}
                  </button>
                </div>
              </div>
              {rowNoteOpen[b.id] && (
                <div className="mt-2 ml-8">
                  <textarea value={rowNotes[b.id] || ''} onChange={e => setRowNote(b.id, e.target.value)}
                    className="input text-sm" rows={2}
                    placeholder="Note for this date only — overrides the shared note below" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t space-y-3">
          <div>
            <label className="label">Note for booker (optional — will be applied to every booking above, unless a date has its own note set)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="input" rows={2} placeholder="Reason, conditions, or confirmation details…" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              {approveCount > 0 && <span className="text-green-700 font-medium">{approveCount} approve</span>}
              {approveCount > 0 && denyCount > 0 && <span className="text-gray-400"> · </span>}
              {denyCount > 0 && <span className="text-red-700 font-medium">{denyCount} deny</span>}
              {skipCount > 0 && (approveCount + denyCount > 0) && <span className="text-gray-400"> · </span>}
              {skipCount > 0 && <span className="text-gray-400">{skipCount} skip</span>}
              {approveCount === 0 && denyCount === 0 && <span className="text-gray-400">All skipped — nothing to apply</span>}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={handleSubmit} disabled={loading || (approveCount + denyCount === 0)}
                className="btn-primary">
                {loading ? 'Applying…' : `Apply (${approveCount + denyCount})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Batch group card ──────────────────────────────────────────────────────────

function BatchGroup({ bookings, onOpenModal }: {
  bookings: Booking[]
  onOpenModal: (bookings: Booking[]) => void
}) {
  const first = bookings[0]
  const last = bookings[bookings.length - 1]

  return (
    <div className="border-2 border-primary-200 rounded-xl bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap gap-3 items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{first.facility_name}</span>
              <span className="bg-primary-100 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {bookings.length} dates
              </span>
            </div>
            <div className="text-sm text-gray-600 mt-0.5">
              {format(new Date(first.date), 'd MMM')} – {format(new Date(last.date), 'd MMM yyyy')}
              {' · '}{first.start_time}–{first.end_time} · {slotsToLabel(first.duration_slots)}
            </div>
            <div className="text-sm text-gray-600 mt-0.5">
              <span className="font-medium">{first.booker_name}</span>
              {(first.organisation || first.booker_organisation) && (
                <span className="text-gray-400"> · {first.organisation || first.booker_organisation}</span>
              )}
            </div>
            {first.notes && <p className="mt-1 text-sm text-gray-500 italic">"{first.notes}"</p>}
          </div>
          <button onClick={() => onOpenModal(bookings)} className="btn-primary btn-sm flex-shrink-0">
            Review {bookings.length} dates →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Single booking row ────────────────────────────────────────────────────────

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
              <span className="text-sm font-mono text-gray-600">{booking.start_time}–{booking.end_time}</span>
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
              {loading ? '…' : 'Approve'}
            </button>
            <button onClick={() => act('deny')} disabled={loading} className="btn-danger flex-1">
              {loading ? '…' : 'Deny'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Cancellation request row ──────────────────────────────────────────────────

function CancellationRow({ booking, onAction }: { booking: Booking; onAction: ActionFn }) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const act = async (action: 'approve' | 'deny') => {
    setLoading(true)
    await onAction(booking.id, action, notes)
    setLoading(false)
  }

  return (
    <div className="border border-orange-200 rounded-lg overflow-hidden bg-orange-50/30">
      <div className="p-4">
        <div className="flex flex-wrap gap-4 items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge-cancellation-pending">Cancel Pending</span>
              <span className="font-semibold text-gray-900">{booking.facility_name}</span>
              <span className="text-gray-400">·</span>
              <span className="text-sm text-gray-600">{format(new Date(booking.date), 'd MMM yyyy')}</span>
              <span className="text-sm font-mono text-gray-600">{booking.start_time}–{booking.end_time}</span>
            </div>
            <div className="mt-1 text-sm text-gray-600">
              <span className="font-medium">{booking.booker_name}</span>
              {(booking.organisation || booking.booker_organisation) && (
                <span className="text-gray-400"> · {booking.organisation || booking.booker_organisation}</span>
              )}
            </div>
            {booking.controller_notes && (
              <p className="mt-1 text-sm text-gray-500 italic">Reason: "{booking.controller_notes}"</p>
            )}
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
        <div className="border-t border-orange-200 bg-orange-50 p-4">
          <div className="mb-3">
            <label className="label">Notes for booker (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input" rows={2}
              placeholder="Reason for your decision…" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => act('approve')} disabled={loading} className="btn-danger flex-1">
              {loading ? '…' : 'Approve Cancellation'}
            </button>
            <button onClick={() => act('deny')} disabled={loading} className="btn-success flex-1">
              {loading ? '…' : 'Keep Booking'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ControllerPanel() {
  const [pending, setPending] = useState<Booking[]>([])
  const [cancelRequests, setCancelRequests] = useState<Booking[]>([])
  const [approvedToday, setApprovedToday] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState('')
  const [reviewBatch, setReviewBatch] = useState<Booking[] | null>(null)

  const today = format(new Date(), 'yyyy-MM-dd')

  const load = async () => {
    setLoading(true)
    try {
      const [pendingRes, cancelRes, todayRes] = await Promise.all([
        client.get('/bookings?status=pending'),
        client.get('/bookings?status=cancellation_pending'),
        client.get(`/bookings?date=${today}&status=approved`),
      ])
      setPending(pendingRes.data)
      setCancelRequests(cancelRes.data)
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

  const handleBulkMixed = async (
    actions: { id: number; action: 'approve' | 'deny'; notes: string }[]
  ) => {
    setActionError('')
    const errors: string[] = []
    for (const { id, action, notes } of actions) {
      try {
        await client.put(`/bookings/${id}/${action}`, { controller_notes: notes || undefined })
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        errors.push(msg || `Failed to ${action} booking ${id}.`)
      }
    }
    if (errors.length) setActionError(errors.join(' · '))
    setReviewBatch(null)
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
    <>
      {reviewBatch && (
        <BulkReviewModal
          bookings={reviewBatch}
          onClose={() => setReviewBatch(null)}
          onSubmit={handleBulkMixed}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1>Controller Panel</h1>
          <div className="flex items-center gap-2">
            {pending.length > 0 && <span className="badge-pending text-sm px-3 py-1">{pending.length} pending</span>}
            {cancelRequests.length > 0 && <span className="badge-cancellation-pending text-sm px-3 py-1">{cancelRequests.length} cancel</span>}
          </div>
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
                  onOpenModal={setReviewBatch}
                />
              ))}
              {singles.map(b => (
                <BookingRow key={b.id} booking={b} onAction={handleAction} />
              ))}
            </div>
          )}
        </section>

        {cancelRequests.length > 0 && (
          <section>
            <h2 className="mb-3">Cancellation Requests</h2>
            <div className="space-y-3">
              {cancelRequests.map(b => (
                <CancellationRow key={b.id} booking={b} onAction={handleAction} />
              ))}
            </div>
          </section>
        )}

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
                        <td className="px-4 py-3 font-mono">{b.start_time}–{b.end_time}</td>
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
    </>
  )
}
