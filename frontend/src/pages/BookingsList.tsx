import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Booking, Facility } from '../types'
import { format } from 'date-fns'

function slotsToLabel(slots: number): string {
  const hours = Math.floor(slots / 2)
  const mins = (slots % 2) * 30
  if (hours > 0 && mins > 0) return `${hours}h ${mins}min`
  if (hours > 0) return `${hours}h`
  return `${mins}min`
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'approved' ? 'badge-approved' :
    status === 'denied' ? 'badge-denied' :
    status === 'cancellation_pending' ? 'badge-cancellation-pending' :
    status === 'cancelled' ? 'badge-cancelled' :
    'badge-pending'
  const label =
    status === 'cancellation_pending' ? 'Cancel Pending' :
    status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={cls}>{label}</span>
}

export default function BookingsList() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelConfirm, setCancelConfirm] = useState<number | null>(null)
  const [cancelRequestId, setCancelRequestId] = useState<number | null>(null)

  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFacility, setFilterFacility] = useState('')

  const loadBookings = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterDate) params.set('date', filterDate)
      if (filterStatus) params.set('status', filterStatus)
      if (filterFacility) params.set('facility_id', filterFacility)

      const res = await client.get(`/bookings?${params.toString()}`)
      setBookings(res.data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    client.get('/facilities').then(r => setFacilities(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    loadBookings()
  }, [filterDate, filterStatus, filterFacility])

  const handleCancel = async (id: number) => {
    try {
      await client.delete(`/bookings/${id}`)
      setCancelConfirm(null)
      await loadBookings()
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to cancel booking')
    }
  }

  const handleCancelRequest = async (id: number) => {
    try {
      await client.put(`/bookings/${id}/request-cancellation`, {})
      setCancelRequestId(null)
      await loadBookings()
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to request cancellation')
    }
  }

  const clearFilters = () => {
    setFilterDate('')
    setFilterStatus('')
    setFilterFacility('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>
          All Bookings
        </h1>
        <Link to="/bookings/new" className="btn-primary">
          + New Booking
        </Link>
      </div>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="input w-40"
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input w-36">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <div>
            <label className="label">Facility</label>
            <select value={filterFacility} onChange={e => setFilterFacility(e.target.value)} className="input w-44">
              <option value="">All facilities</option>
              {facilities.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          {(filterDate || filterStatus || filterFacility) && (
            <button onClick={clearFilters} className="btn-secondary">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Bookings table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No bookings found.</p>
          <Link to="/bookings/new" className="btn-primary mt-4 inline-block">
            Make a Booking
          </Link>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Date & Time</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Facility</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Duration</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Booker</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{format(new Date(b.date), 'd MMM yyyy')}</div>
                      <div className="text-gray-500 font-mono text-xs">{b.start_time} – {b.end_time}</div>
                    </td>
                    <td className="px-4 py-3 font-medium">{b.facility_name}</td>
                    <td className="px-4 py-3 text-gray-500">{slotsToLabel(b.duration_slots)}</td>
                    <td className="px-4 py-3">
                      <div>{b.booker_name}</div>
                      {b.booker_organisation && (
                        <div className="text-xs text-gray-500">{b.booker_organisation}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/bookings/${b.id}`} className="btn-secondary btn-sm">View</Link>
                        {b.status === 'pending' && b.booker_id === user?.id && (
                          cancelConfirm === b.id ? (
                            <>
                              <button onClick={() => handleCancel(b.id)} className="btn-danger btn-sm">Confirm</button>
                              <button onClick={() => setCancelConfirm(null)} className="btn-secondary btn-sm">Keep</button>
                            </>
                          ) : (
                            <button onClick={() => setCancelConfirm(b.id)} className="btn-danger btn-sm">Cancel</button>
                          )
                        )}
                        {b.status === 'approved' && b.booker_id === user?.id && (
                          cancelRequestId === b.id ? (
                            <>
                              <button onClick={() => handleCancelRequest(b.id)} className="btn-danger btn-sm">Confirm</button>
                              <button onClick={() => setCancelRequestId(null)} className="btn-secondary btn-sm">Keep</button>
                            </>
                          ) : (
                            <button onClick={() => setCancelRequestId(b.id)} className="btn-secondary btn-sm">Request Cancel</button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100">
            {bookings.map(b => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="block p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{b.facility_name}</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(b.date), 'd MMM yyyy')} · {b.start_time} · {slotsToLabel(b.duration_slots)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{b.booker_name}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
