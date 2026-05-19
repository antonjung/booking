import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks,
  addDays, subDays, isSameMonth, isSameDay,
} from 'date-fns'
import client from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Booking, Facility, User } from '../types'

type View = 'month' | 'week' | 'day' | 'list'

const PALETTE = [
  '#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626',
  '#0891b2', '#65a30d', '#ea580c', '#db2777', '#4f46e5',
]

const SLOT_PX = 48
const HOUR_START = 7
const HOUR_END = 22
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TOTAL_HEIGHT = (HOUR_END - HOUR_START) * 2 * SLOT_PX

function getFacilityColor(facilityId: number, facilities: Facility[]) {
  const f = facilities.find(f => f.id === facilityId)
  if (f?.color) return f.color
  const idx = facilities.findIndex(f => f.id === facilityId)
  return PALETTE[Math.max(0, idx) % PALETTE.length]
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function slotsToLabel(slots: number) {
  const h = Math.floor(slots / 2), m = (slots % 2) * 30
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function bookingPos(b: Booking) {
  const top = Math.max(0, (timeToMinutes(b.start_time) - HOUR_START * 60) / 30 * SLOT_PX)
  const height = b.duration_slots * SLOT_PX
  return { top, height }
}

function bookerLabel(b: Booking) {
  return b.booker_organisation ? `${b.booker_name} · ${b.booker_organisation}` : b.booker_name
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Calendar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([client.get('/bookings'), client.get('/facilities')])
      .then(([bRes, fRes]) => { setBookings(bRes.data); setFacilities(fRes.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const activeBookings = useMemo(() => bookings.filter(b => b.status !== 'denied'), [bookings])

  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {}
    for (const b of activeBookings) {
      if (!map[b.date]) map[b.date] = []
      map[b.date].push(b)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return map
  }, [activeBookings])

  const todayMidnight = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const goTo = (dir: 1 | -1) => {
    setCurrentDate(d => {
      if (view === 'month') return dir > 0 ? addMonths(d, 1) : subMonths(d, 1)
      if (view === 'week') return dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1)
      return dir > 0 ? addDays(d, 1) : subDays(d, 1)
    })
  }

  const title = useMemo(() => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy')
    if (view === 'week') {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 })
      const e = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`
    }
    if (view === 'day') return format(currentDate, 'EEEE, d MMMM yyyy')
    return 'All Bookings'
  }, [view, currentDate])

  const onBookingClick = (id: number) => navigate(`/bookings/${id}`)
  const onNewBooking = (date?: string) =>
    navigate(date ? `/bookings/new?date=${date}` : '/bookings/new')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {view !== 'list' && (
            <button onClick={() => goTo(-1)} className="p-2 rounded-md hover:bg-gray-100 text-gray-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1 className="text-xl font-bold min-w-[200px] text-center">{title}</h1>
          {view !== 'list' && (
            <>
              <button onClick={() => goTo(1)} className="p-2 rounded-md hover:bg-gray-100 text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                Today
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-gray-300 overflow-hidden text-sm">
            {(['month', 'week', 'day', 'list'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 capitalize transition-colors ${view === v ? 'bg-primary-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {v}
              </button>
            ))}
          </div>
          {user?.role !== 'admin' && (
            <button onClick={() => onNewBooking()} className="btn-primary">+ New</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
        </div>
      ) : (
        <>
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              bookingsByDate={bookingsByDate}
              facilities={facilities}
              user={user}
              todayMidnight={todayMidnight}
              onBookingClick={onBookingClick}
              onNewBooking={onNewBooking}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              bookingsByDate={bookingsByDate}
              facilities={facilities}
              user={user}
              todayMidnight={todayMidnight}
              onBookingClick={onBookingClick}
              onNewBooking={onNewBooking}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              bookingsByDate={bookingsByDate}
              facilities={facilities}
              onBookingClick={onBookingClick}
            />
          )}
          {view === 'list' && (
            <ListView
              bookings={activeBookings}
              facilities={facilities}
              onBookingClick={onBookingClick}
            />
          )}
        </>
      )}
    </div>
  )
}

// ─── Time grid helpers ────────────────────────────────────────────────────────

function TimeLabels() {
  return (
    <div className="relative border-r border-gray-200 bg-gray-50">
      {HOURS.map(h => (
        <div
          key={h}
          className="absolute w-full text-right pr-2 text-xs text-gray-400 select-none"
          style={{ top: (h - HOUR_START) * 2 * SLOT_PX - 7 }}
        >
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  )
}

function GridLines() {
  return (
    <>
      {HOURS.map(h => (
        <div key={h} className="absolute w-full border-t border-gray-100" style={{ top: (h - HOUR_START) * 2 * SLOT_PX }} />
      ))}
      {HOURS.map(h => (
        <div key={`${h}h`} className="absolute w-full border-t border-gray-50" style={{ top: (h - HOUR_START) * 2 * SLOT_PX + SLOT_PX }} />
      ))}
    </>
  )
}

function BookingBlock({ b, facilities, onClick, compact = false }: {
  b: Booking
  facilities: Facility[]
  onClick: () => void
  compact?: boolean
}) {
  const { top, height } = bookingPos(b)
  if (top >= TOTAL_HEIGHT) return null
  const color = getFacilityColor(b.facility_id, facilities)

  return (
    <div
      onClick={onClick}
      title={`${b.facility_name} · ${b.start_time}–${b.end_time} · ${bookerLabel(b)}${b.status === 'pending' ? ' (pending)' : ''}`}
      style={{ top, height, backgroundColor: color, opacity: b.status === 'pending' ? 0.7 : 1 }}
      className="absolute left-0.5 right-0.5 rounded text-white text-xs p-1 overflow-hidden cursor-pointer hover:opacity-90 z-10 shadow-sm"
    >
      <div className="font-semibold truncate">{b.start_time}</div>
      {!compact && <div className="truncate">{b.facility_name}</div>}
      {height >= SLOT_PX * 2 && <div className="truncate opacity-80 text-xs">{b.booker_name}</div>}
      {height >= SLOT_PX * 3 && b.booker_organisation && (
        <div className="truncate opacity-70 text-xs">{b.booker_organisation}</div>
      )}
    </div>
  )
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({ currentDate, bookingsByDate, facilities, user, todayMidnight, onBookingClick, onNewBooking }: {
  currentDate: Date
  bookingsByDate: Record<string, Booking[]>
  facilities: Facility[]
  user: User | null
  todayMidnight: Date
  onBookingClick: (id: number) => void
  onNewBooking: (date: string) => void
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const facilitiesInView = useMemo(() => {
    const ids = new Set<number>()
    for (const day of days) {
      for (const b of bookingsByDate[format(day, 'yyyy-MM-dd')] || []) ids.add(b.facility_id)
    }
    return facilities.filter(f => ids.has(f.id))
  }, [days, bookingsByDate, facilities])

  const MAX = 3

  return (
    <>
      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {WEEK_DAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d[0]}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const key = format(day, 'yyyy-MM-dd')
            const dayBookings = bookingsByDate[key] || []
            const inMonth = isSameMonth(day, currentDate)
            const isToday = isSameDay(day, new Date())
            const isPast = day < todayMidnight
            const clickable = !isPast && user?.role !== 'admin'
            const isLastCol = (idx + 1) % 7 === 0

            return (
              <div
                key={key}
                onClick={clickable ? () => onNewBooking(key) : undefined}
                className={[
                  'min-h-[90px] sm:min-h-[110px] border-b border-r border-gray-100 p-1 sm:p-1.5',
                  isLastCol ? 'border-r-0' : '',
                  !inMonth ? 'bg-gray-50/70' : isPast ? 'bg-gray-50/40' : 'bg-white',
                  clickable ? 'cursor-pointer hover:bg-primary-50/60 transition-colors' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className={[
                  'text-xs sm:text-sm font-semibold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full mb-1',
                  isToday ? 'bg-primary-700 text-white' : inMonth && !isPast ? 'text-gray-900' : 'text-gray-400',
                ].join(' ')}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayBookings.slice(0, MAX).map(b => {
                    const color = getFacilityColor(b.facility_id, facilities)
                    const isOwn = b.booker_id === user?.id
                    return (
                      <div
                        key={b.id}
                        onClick={e => { e.stopPropagation(); onBookingClick(b.id) }}
                        title={`${b.facility_name} · ${b.start_time}–${b.end_time} · ${bookerLabel(b)}${b.status === 'pending' ? ' (pending)' : ''}`}
                        style={{
                          backgroundColor: color,
                          opacity: b.status === 'pending' ? 0.6 : 1,
                          ...(isOwn ? { outline: '2px solid white', outlineOffset: '-2px', boxShadow: `0 0 0 2px ${color}` } : {}),
                        }}
                        className="text-white text-xs px-1 sm:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-90 transition-opacity leading-tight"
                      >
                        <span className="font-semibold hidden sm:inline">{b.start_time} </span>
                        <span className="font-medium">{b.facility_name.split(' ')[0]}</span>
                      </div>
                    )
                  })}
                  {dayBookings.length > MAX && (
                    <button
                      onClick={e => { e.stopPropagation(); onBookingClick(dayBookings[MAX].id) }}
                      className="text-xs text-gray-500 hover:text-primary-600 pl-1 leading-tight"
                    >
                      +{dayBookings.length - MAX} more
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {facilitiesInView.map(f => (
          <div key={f.id} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getFacilityColor(f.id, facilities) }} />
            <span className="text-sm text-gray-700">{f.name}</span>
          </div>
        ))}
        {facilitiesInView.length > 0 && (
          <span className="text-xs text-gray-400">· Faded = pending · Ringed = your booking</span>
        )}
      </div>
    </>
  )
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({ currentDate, bookingsByDate, facilities, user, todayMidnight, onBookingClick, onNewBooking }: {
  currentDate: Date
  bookingsByDate: Record<string, Booking[]>
  facilities: Facility[]
  user: User | null
  todayMidnight: Date
  onBookingClick: (id: number) => void
  onNewBooking: (date: string) => void
}) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [currentDate])

  return (
    <div className="card p-0 overflow-hidden">
      {/* Day headers */}
      <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        <div className="border-r border-gray-200" />
        {weekDays.map(day => {
          const isToday = isSameDay(day, new Date())
          const isPast = day < todayMidnight
          const clickable = !isPast && user?.role !== 'admin'
          const key = format(day, 'yyyy-MM-dd')
          return (
            <div
              key={key}
              onClick={clickable ? () => onNewBooking(key) : undefined}
              className={`py-2 text-center border-l border-gray-200 ${clickable ? 'cursor-pointer hover:bg-primary-50' : ''}`}
            >
              <div className="text-xs text-gray-500 uppercase">{format(day, 'EEE')}</div>
              <div className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mx-auto ${isToday ? 'bg-primary-700 text-white' : isPast ? 'text-gray-400' : 'text-gray-900'}`}>
                {format(day, 'd')}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', height: TOTAL_HEIGHT }}>
          <TimeLabels />
          {weekDays.map(day => {
            const key = format(day, 'yyyy-MM-dd')
            const dayBookings = bookingsByDate[key] || []
            const isToday = isSameDay(day, new Date())
            return (
              <div key={key} className={`relative border-l border-gray-200 ${isToday ? 'bg-primary-50/20' : ''}`}>
                <GridLines />
                {dayBookings.map(b => (
                  <BookingBlock key={b.id} b={b} facilities={facilities} onClick={() => onBookingClick(b.id)} compact />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Day view ─────────────────────────────────────────────────────────────────

function DayView({ currentDate, bookingsByDate, facilities, onBookingClick }: {
  currentDate: Date
  bookingsByDate: Record<string, Booking[]>
  facilities: Facility[]
  onBookingClick: (id: number) => void
}) {
  const key = format(currentDate, 'yyyy-MM-dd')
  const dayBookings = bookingsByDate[key] || []

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', height: TOTAL_HEIGHT }}>
          <TimeLabels />
          <div className="relative">
            <GridLines />
            {dayBookings.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                No bookings this day
              </div>
            )}
            {dayBookings.map(b => {
              const { top, height } = bookingPos(b)
              if (top >= TOTAL_HEIGHT) return null
              const color = getFacilityColor(b.facility_id, facilities)
              return (
                <div
                  key={b.id}
                  onClick={() => onBookingClick(b.id)}
                  style={{ top, height, backgroundColor: color, opacity: b.status === 'pending' ? 0.7 : 1 }}
                  className="absolute left-2 right-2 rounded-lg text-white p-2 overflow-hidden cursor-pointer hover:opacity-90 shadow-md z-10"
                >
                  <div className="font-bold text-sm truncate">{b.facility_name}</div>
                  <div className="text-xs opacity-90">{b.start_time} – {b.end_time} · {slotsToLabel(b.duration_slots)}</div>
                  {height >= SLOT_PX * 1.5 && (
                    <div className="text-xs mt-1 opacity-80 truncate">{bookerLabel(b)}</div>
                  )}
                  {height >= SLOT_PX * 2.5 && b.status === 'pending' && (
                    <div className="text-xs mt-0.5 opacity-70">Pending approval</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({ bookings, facilities, onBookingClick }: {
  bookings: Booking[]
  facilities: Facility[]
  onBookingClick: (id: number) => void
}) {
  const grouped = useMemo(() => {
    const sorted = [...bookings].sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.start_time.localeCompare(b.start_time)
    )
    const map: Record<string, Booking[]> = {}
    for (const b of sorted) {
      if (!map[b.date]) map[b.date] = []
      map[b.date].push(b)
    }
    return map
  }, [bookings])

  const dates = Object.keys(grouped).sort()

  if (dates.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">No bookings to show.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {dates.map(date => (
        <div key={date} className="card p-0 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-700 text-sm">
              {format(new Date(`${date}T00:00:00`), 'EEEE, d MMMM yyyy')}
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {grouped[date].map(b => {
              const color = getFacilityColor(b.facility_id, facilities)
              return (
                <div
                  key={b.id}
                  onClick={() => onBookingClick(b.id)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{b.facility_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        b.status === 'approved' ? 'bg-green-100 text-green-700' :
                        b.status === 'denied' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {b.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {b.start_time} – {b.end_time} · {slotsToLabel(b.duration_slots)}
                    </div>
                    <div className="text-sm text-gray-600 truncate">{bookerLabel(b)}</div>
                  </div>
                  <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
