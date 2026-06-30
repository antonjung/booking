import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import client from '../api/client'
import { Booking } from '../types'
import { useAuth } from '../contexts/AuthContext'
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
  const label = status === 'cancellation_pending' ? 'Cancellation Pending' : status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={`${cls} text-sm px-3 py-1`}>{label}</span>
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [controllerNotes, setControllerNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    client.get(`/bookings?`)
      .then(() => {})
      .catch(() => {})

    // Fetch booking details via the bookings list filtered to find our ID
    client.get('/bookings').then(res => {
      const found = res.data.find((b: Booking) => b.id === parseInt(id!))
      if (found) {
        setBooking(found)
      } else {
        setError('Booking not found or you do not have access.')
      }
    }).catch(() => {
      setError('Failed to load booking.')
    }).finally(() => setLoading(false))
  }, [id])

  const handleApprove = async () => {
    setActionLoading(true)
    setActionError('')
    try {
      const res = await client.put(`/bookings/${id}/approve`, { controller_notes: controllerNotes || undefined })
      setBooking(res.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg || 'Failed to approve booking.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeny = async () => {
    setActionLoading(true)
    setActionError('')
    try {
      const res = await client.put(`/bookings/${id}/deny`, { controller_notes: controllerNotes || undefined })
      setBooking(res.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg || 'Failed to deny booking.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this booking request?')) return
    setActionLoading(true)
    try {
      await client.delete(`/bookings/${id}`)
      navigate('/bookings')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg || 'Failed to cancel booking.')
      setActionLoading(false)
    }
  }

  const handleRequestCancellation = async () => {
    if (!confirm('Request cancellation of this approved booking? A controller will need to approve it.')) return
    setActionLoading(true)
    setActionError('')
    try {
      await client.put(`/bookings/${id}/request-cancellation`, {})
      const res = await client.get('/bookings')
      const found = res.data.find((b: Booking) => b.id === parseInt(id!))
      if (found) setBooking(found)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg || 'Failed to request cancellation.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
      </div>
    )
  }

  if (error || !booking) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600">{error || 'Booking not found.'}</p>
        <Link to="/bookings" className="btn-secondary mt-4 inline-block">Back to Bookings</Link>
      </div>
    )
  }

  const isController = user?.role === 'controller' || user?.role === 'admin'
  const isOwner = booking.booker_id === user?.id

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1>Booking #{booking.id}</h1>
        <StatusBadge status={booking.status} />
      </div>

      {/* Booking Details */}
      <div className="card">
        <h2 className="mb-4">Booking Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="Facility" value={booking.facility_name} />
          <InfoField label="Date" value={format(new Date(booking.date), 'EEEE, d MMMM yyyy')} />
          <InfoField label="Start Time" value={booking.start_time} />
          <InfoField label="End Time" value={booking.end_time || '—'} />
          <InfoField label="Duration" value={slotsToLabel(booking.duration_slots)} />
          <InfoField label="Booked by" value={booking.booker_name} />
          {booking.booker_organisation && (
            <InfoField label="Organisation" value={booking.booker_organisation} />
          )}
          {booking.notes && <InfoField label="Notes" value={booking.notes} wide />}
        </dl>
      </div>

      {/* Booker contact info (controllers/admins only) */}
      {isController && (
        <div className="card">
          <h2 className="mb-4">Booker Contact</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoField label="Email" value={booking.booker_email} />
          </dl>
        </div>
      )}

      {/* Controller action / decision */}
      {booking.status === 'pending' && isController && (
        <div className="card border-amber-200 bg-amber-50">
          <h2 className="mb-4 text-amber-800">Review Booking</h2>
          {actionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">{actionError}</div>
          )}
          <div className="mb-4">
            <label className="label">Controller Notes (optional)</label>
            <textarea value={controllerNotes} onChange={e => setControllerNotes(e.target.value)}
              className="input" rows={2} placeholder="Add notes for the booker..." />
          </div>
          <div className="flex gap-3">
            <button onClick={handleApprove} disabled={actionLoading} className="btn-success flex-1">
              {actionLoading ? '…' : 'Approve'}
            </button>
            <button onClick={handleDeny} disabled={actionLoading} className="btn-danger flex-1">
              {actionLoading ? '…' : 'Deny'}
            </button>
          </div>
        </div>
      )}

      {/* Controller review of cancellation request */}
      {booking.status === 'cancellation_pending' && isController && (
        <div className="card border-orange-200 bg-orange-50">
          <h2 className="mb-1 text-orange-800">Cancellation Request</h2>
          <p className="text-sm text-orange-700 mb-4">The booker has requested to cancel this booking.</p>
          {actionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">{actionError}</div>
          )}
          <div className="mb-4">
            <label className="label">Notes for booker (optional)</label>
            <textarea value={controllerNotes} onChange={e => setControllerNotes(e.target.value)}
              className="input" rows={2} placeholder="Reason for your decision…" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleApprove} disabled={actionLoading} className="btn-danger flex-1">
              {actionLoading ? '…' : 'Approve Cancellation'}
            </button>
            <button onClick={handleDeny} disabled={actionLoading} className="btn-success flex-1">
              {actionLoading ? '…' : 'Keep Booking'}
            </button>
          </div>
        </div>
      )}

      {/* Decision info */}
      {['approved', 'denied', 'cancelled'].includes(booking.status) && booking.controller_name && (
        <div className={`card ${
          booking.status === 'approved' ? 'bg-green-50 border-green-200' :
          booking.status === 'cancelled' ? 'bg-gray-50 border-gray-200' :
          'bg-red-50 border-red-200'
        }`}>
          <h2 className={`mb-3 ${booking.status === 'approved' ? 'text-green-800' : booking.status === 'cancelled' ? 'text-gray-700' : 'text-red-800'}`}>
            {booking.status === 'approved' ? 'Booking Approved' :
             booking.status === 'cancelled' ? 'Booking Cancelled' : 'Booking Denied'}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoField label="Reviewed by" value={booking.controller_name} />
            {booking.controller_notes && <InfoField label="Notes" value={booking.controller_notes} wide />}
          </dl>
        </div>
      )}

      {/* Cancel button for booker (own pending booking) */}
      {isOwner && booking.status === 'pending' && (
        <div className="flex justify-end">
          <button onClick={handleCancel} disabled={actionLoading} className="btn-danger">
            {actionLoading ? 'Cancelling…' : 'Cancel Booking Request'}
          </button>
        </div>
      )}

      {/* Request cancellation for own approved booking */}
      {isOwner && booking.status === 'approved' && (
        <div className="flex justify-end">
          <button onClick={handleRequestCancellation} disabled={actionLoading} className="btn-secondary">
            {actionLoading ? 'Requesting…' : 'Request Cancellation'}
          </button>
        </div>
      )}

      {/* Timestamps */}
      <div className="text-xs text-gray-400 text-right">
        Submitted: {format(new Date(booking.created_at), 'd MMM yyyy HH:mm')}
        {booking.updated_at !== booking.created_at && (
          <> · Updated: {format(new Date(booking.updated_at), 'd MMM yyyy HH:mm')}</>
        )}
      </div>
    </div>
  )
}

function InfoField({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 mt-1">{value}</dd>
    </div>
  )
}
