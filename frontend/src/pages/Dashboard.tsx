import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
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

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'approved' ? 'badge-approved' : status === 'denied' ? 'badge-denied' : 'badge-pending'
  return <span className={cls}>{status}</span>
}

export default function Dashboard() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [todayBookings, setTodayBookings] = useState<Booking[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [stats, setStats] = useState({ users: 0, facilities: 0, pending: 0 })
  const [loading, setLoading] = useState(true)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    async function load() {
      try {
        const [bookingsRes, todayRes] = await Promise.all([
          client.get('/bookings?status=pending'),
          client.get(`/bookings?date=${today}`),
        ])
        setBookings(bookingsRes.data)
        setPendingCount(bookingsRes.data.length)
        setTodayBookings(todayRes.data)

        if (user?.role === 'admin') {
          const [usersRes, facilitiesRes] = await Promise.all([
            client.get('/users'),
            client.get('/facilities/all'),
          ])
          setStats({
            users: usersRes.data.length,
            facilities: facilitiesRes.data.length,
            pending: bookingsRes.data.length,
          })
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, today])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary-700 to-primary-900 rounded-2xl p-6 text-white flex items-center gap-5">
        <div className="flex-shrink-0">
          <svg className="h-16 w-16 text-primary-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white text-2xl font-bold">Welcome, {user?.name}</h1>
          <p className="text-primary-200 text-sm mt-0.5">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        </div>
        <Link to="/bookings/new" className="flex-shrink-0 bg-white text-primary-800 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-primary-50 transition-colors">
          + New Booking
        </Link>
      </div>

      {/* Admin stats */}
      {user?.role === 'admin' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Users" value={stats.users} icon="👥" color="bg-purple-50 text-purple-700" />
          <StatCard label="Active Facilities" value={stats.facilities} icon="🏛️" color="bg-blue-50 text-blue-700" />
          <StatCard label="Pending Bookings" value={stats.pending} icon="⏳" color="bg-amber-50 text-amber-700" link="/controller" />
        </div>
      )}

      {/* Controller summary */}
      {user?.role === 'controller' && (
        <div className="card bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-amber-800">Bookings Awaiting Review</h2>
              <p className="text-3xl font-bold text-amber-700 mt-1">{pendingCount}</p>
            </div>
            <Link to="/controller" className="btn-primary">
              Review Bookings
            </Link>
          </div>
        </div>
      )}

      {/* Booker summary */}
      {user?.role === 'booker' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card">
            <p className="text-sm text-gray-500">Your Pending Bookings</p>
            <p className="text-3xl font-bold text-amber-600 mt-1">
              {bookings.filter(b => b.booker_id === user.id).length}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Your Upcoming Approved</p>
            <p className="text-3xl font-bold text-green-600 mt-1">
              {bookings.filter(b => b.status === 'approved' && b.date >= today).length}
            </p>
          </div>
        </div>
      )}

      {/* Today's bookings */}
      <div className="card">
        <h2 className="mb-4">Today's Bookings — {format(new Date(), 'd MMM yyyy')}</h2>
        {todayBookings.length === 0 ? (
          <p className="text-gray-500 text-sm">No bookings today.</p>
        ) : (
          <div className="space-y-2">
            {todayBookings
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map(b => (
                <Link
                  key={b.id}
                  to={`/bookings/${b.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-mono font-medium text-gray-700 w-20">
                      {b.start_time} – {b.end_time || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{b.facility_name}</p>
                      <p className="text-xs text-gray-500">{b.booker_name} · {slotsToLabel(b.duration_slots)}</p>
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </Link>
              ))}
          </div>
        )}
      </div>

      {/* Recent bookings (booker only) */}
      {user?.role === 'booker' && bookings.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2>Your Pending Requests</h2>
            <Link to="/bookings" className="text-sm text-primary-600 hover:text-primary-800">View all</Link>
          </div>
          <div className="space-y-2">
            {bookings.slice(0, 5).map(b => (
              <Link
                key={b.id}
                to={`/bookings/${b.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-primary-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{b.facility_name}</p>
                  <p className="text-xs text-gray-500">{b.date} at {b.start_time} · {slotsToLabel(b.duration_slots)}</p>
                </div>
                <StatusBadge status={b.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color, link }: { label: string; value: number; icon: string; color: string; link?: string }) {
  const content = (
    <div className={`card flex items-center gap-4 ${color} border-0`}>
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm opacity-80">{label}</p>
      </div>
    </div>
  )
  if (link) return <Link to={link}>{content}</Link>
  return content
}
