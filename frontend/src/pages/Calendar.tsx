import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay,
} from 'date-fns'
import client from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Booking, Facility } from '../types'

const PALETTE = [
  '#2563eb', // blue
  '#059669', // emerald
  '#7c3aed', // violet
  '#d97706', // amber
  '#dc2626', // red
  '#0891b2', // cyan
  '#65a30d', // lime
  '#ea580c', // orange
  '#db2777', // pink
  '#4f46e5', // indigo
]

function getFacilityColor(facilityId: number, facilities: Facility[]): string {
  const idx = facilities.findIndex(f => f.id === facilityId)
  return PALETTE[Math.max(0, idx) % PALETTE.length]
}

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Calendar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      client.get('/bookings'),
      client.get('/facilities'),
    ])
      .then(([bRes, fRes]) => {
        setBookings(bRes.data)
        setFacilities(fRes.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentMonth])

  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {}
    for (const b of bookings) {
      if (b.status === 'denied') continue
      if (!map[b.date]) map[b.date] = []
      map[b.date].push(b)
    }
    // sort each day by start_time
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return map
  }, [bookings])

  const facilitiesInView = useMemo(() => {
    const ids = new Set<number>()
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd')
      for (const b of bookingsByDate[key] || []) ids.add(b.facility_id)
    }
    return facilities.filter(f => ids.has(f.id))
  }, [days, bookingsByDate, facilities])

  const todayMidnight = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const handleDayClick = (day: Date) => {
    if (day < todayMidnight) return
    if (user?.role === 'admin') return
    navigate(`/bookings/new?date=${format(day, 'yyyy-MM-dd')}`)
  }

  const canClick = (day: Date) => day >= todayMidnight && user?.role !== 'admin'

  const MAX_CHIPS = 3

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            aria-label="Previous month"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold w-48 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h1>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            aria-label="Next month"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="text-sm text-primary-600 hover:text-primary-800 font-medium ml-1"
          >
            Today
          </button>
        </div>
        {user?.role !== 'admin' && (
          <button onClick={() => navigate('/bookings/new')} className="btn-primary">
            + New Booking
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
              {WEEK_DAYS.map(d => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
                >
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d[0]}</span>
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayBookings = bookingsByDate[key] || []
                const inMonth = isSameMonth(day, currentMonth)
                const isToday = isSameDay(day, new Date())
                const isPast = day < todayMidnight
                const clickable = canClick(day)
                const isLastCol = (idx + 1) % 7 === 0

                return (
                  <div
                    key={key}
                    onClick={clickable ? () => handleDayClick(day) : undefined}
                    className={[
                      'min-h-[90px] sm:min-h-[110px] border-b border-r border-gray-100 p-1 sm:p-1.5',
                      isLastCol ? 'border-r-0' : '',
                      !inMonth ? 'bg-gray-50/70' : isPast ? 'bg-gray-50/40' : 'bg-white',
                      clickable ? 'cursor-pointer hover:bg-primary-50/60 transition-colors' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {/* Date number */}
                    <div
                      className={[
                        'text-xs sm:text-sm font-semibold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full mb-1',
                        isToday
                          ? 'bg-primary-700 text-white'
                          : inMonth && !isPast
                          ? 'text-gray-900'
                          : 'text-gray-400',
                      ].join(' ')}
                    >
                      {format(day, 'd')}
                    </div>

                    {/* Booking chips */}
                    <div className="space-y-0.5">
                      {dayBookings.slice(0, MAX_CHIPS).map(b => {
                        const color = getFacilityColor(b.facility_id, facilities)
                        const isOwn = b.booker_id === user?.id
                        const isPending = b.status === 'pending'

                        return (
                          <div
                            key={b.id}
                            onClick={e => { e.stopPropagation(); navigate(`/bookings/${b.id}`) }}
                            title={`${b.facility_name} · ${b.start_time}–${b.end_time} · ${b.booker_name}${isPending ? ' (pending)' : ''}`}
                            style={{
                              backgroundColor: color,
                              opacity: isPending ? 0.6 : 1,
                              ...(isOwn ? {
                                outline: '2px solid white',
                                outlineOffset: '-2px',
                                boxShadow: `0 0 0 2px ${color}`,
                              } : {}),
                            }}
                            className="text-white text-xs px-1 sm:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-90 transition-opacity leading-tight"
                          >
                            <span className="font-semibold hidden sm:inline">{b.start_time}</span>
                            <span className="font-medium"> {b.facility_name.split(' ')[0]}</span>
                          </div>
                        )
                      })}

                      {dayBookings.length > MAX_CHIPS && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            navigate(`/bookings?date=${key}`)
                          }}
                          className="text-xs text-gray-500 hover:text-primary-600 pl-1 leading-tight"
                        >
                          +{dayBookings.length - MAX_CHIPS} more
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {facilitiesInView.map(f => (
              <div key={f.id} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: getFacilityColor(f.id, facilities) }}
                />
                <span className="text-sm text-gray-700">{f.name}</span>
              </div>
            ))}
            {facilitiesInView.length > 0 && (
              <span className="text-xs text-gray-400 ml-1">
                · Faded = pending · Ringed = your booking · Click a date to book
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
