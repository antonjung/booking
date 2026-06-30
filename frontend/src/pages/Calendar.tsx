import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks,
  addDays, subDays, isSameMonth, isSameDay, parseISO,
} from 'date-fns'
import client from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Booking, Facility } from '../types'

type View = 'month' | 'week' | 'day' | 'list'

const PALETTE = [
  '#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626',
  '#0891b2', '#65a30d', '#ea580c', '#db2777', '#4f46e5',
]

const SLOT_PX = 48        // day view: 30-min slot height
const WEEK_SLOT_PX = 12   // week view: 30-min slot height (1 hour = 24px)
const HOUR_START = 7
const HOUR_END = 22
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TOTAL_HEIGHT = (HOUR_END - HOUR_START) * 2 * SLOT_PX
const WEEK_TOTAL_HEIGHT = (HOUR_END - HOUR_START) * 2 * WEEK_SLOT_PX

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

function bookingPos(b: Booking, slotPx = SLOT_PX) {
  const top = Math.max(0, (timeToMinutes(b.start_time) - HOUR_START * 60) / 30 * slotPx)
  const height = b.duration_slots * slotPx
  return { top, height }
}

function bookerLabel(b: Booking) {
  const org = b.organisation || b.booker_organisation
  return org ? `${b.booker_name} · ${org}` : b.booker_name
}

function displayOrg(b: Booking) {
  return b.organisation || b.booker_organisation || b.booker_name
}

function yToTime(offsetY: number, slotPx = SLOT_PX): string {
  const slotIndex = Math.round(offsetY / slotPx)
  const clamped = Math.max(0, Math.min((HOUR_END - HOUR_START) * 2 - 1, slotIndex))
  const totalMinutes = HOUR_START * 60 + clamped * 30
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Calendar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const locState = location.state as { initialDate?: string; initialView?: View } | null
  const [view, setView] = useState<View>(locState?.initialView ?? 'month')
  const [currentDate, setCurrentDate] = useState(() => {
    if (locState?.initialDate) {
      const d = new Date(locState.initialDate + 'T00:00:00')
      if (!isNaN(d.getTime())) return d
    }
    return new Date()
  })
  const [bookings, setBookings] = useState<Booking[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [facilityFilter, setFacilityFilter] = useState<number | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [slide, setSlide] = useState({ x: 0, opacity: 1, anim: false })
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const loadBookings = async () => {
    try {
      const res = await client.get('/bookings')
      setBookings(res.data)
    } catch {}
  }

  useEffect(() => {
    Promise.all([client.get('/bookings'), client.get('/facilities')])
      .then(([bRes, fRes]) => { setBookings(bRes.data); setFacilities(fRes.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const activeBookings = useMemo(() => bookings.filter(b => b.status !== 'denied'), [bookings])

  const filteredBookings = useMemo(() => {
    if (!facilityFilter) return activeBookings
    const selectedFacility = facilities.find(f => f.id === facilityFilter)
    const wholeHallIds = new Set(facilities.filter(f => f.is_whole_hall).map(f => f.id))
    return activeBookings.filter(b =>
      b.facility_id === facilityFilter ||
      (selectedFacility?.type === 'room' && wholeHallIds.has(b.facility_id))
    )
  }, [activeBookings, facilityFilter, facilities])

  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {}
    for (const b of filteredBookings) {
      if (!map[b.date]) map[b.date] = []
      map[b.date].push(b)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return map
  }, [filteredBookings])

  const todayMidnight = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const facilitiesForKey = useMemo(() => {
    const ids = new Set(filteredBookings.map(b => b.facility_id))
    return facilities.filter(f => ids.has(f.id))
  }, [filteredBookings, facilities])

  const goTo = (dir: 1 | -1) => {
    setSlide({ x: dir > 0 ? -40 : 40, opacity: 0, anim: true })
    setTimeout(() => {
      setCurrentDate(d => {
        if (view === 'month') return dir > 0 ? addMonths(d, 1) : subMonths(d, 1)
        if (view === 'week') return dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1)
        return dir > 0 ? addDays(d, 1) : subDays(d, 1)
      })
      setSlide({ x: dir > 0 ? 40 : -40, opacity: 0, anim: false })
      requestAnimationFrame(() => requestAnimationFrame(() =>
        setSlide({ x: 0, opacity: 1, anim: true })
      ))
    }, 180)
  }

  const title = useMemo(() => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy')
    if (view === 'week') {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 })
      const e = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`
    }
    if (view === 'day') return format(currentDate, 'EEE d MMM yyyy')
    return 'All Bookings'
  }, [view, currentDate])

  const onBookingClick = (id: number) => {
    const booking = filteredBookings.find(b => b.id === id)
    if (booking) setSelectedBooking(booking)
  }
  const onNewBooking = (date?: string) =>
    navigate(date ? `/bookings/new?date=${date}` : '/bookings/new')

  const canDrag = (b: Booking) => {
    if (b.status !== 'pending') return false
    if (user?.role === 'booker') return b.booker_id === user.id
    return true
  }

  const handleCancel = async (bookingId: number) => {
    try {
      await client.delete(`/bookings/${bookingId}`)
      setSelectedBooking(null)
      await loadBookings()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg || 'Failed to cancel booking')
    }
  }

  const handleReschedule = async (bookingId: number, newDate: string, newTime: string) => {
    try {
      await client.patch(`/bookings/${bookingId}`, { date: newDate, start_time: newTime })
      await loadBookings()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg || 'Failed to reschedule booking')
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null || view === 'list') return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      goTo(dx < 0 ? 1 : -1)
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  return (
    <div
      className="space-y-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
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
          <h1 className="text-xl font-bold w-64 text-center shrink-0">{title}</h1>
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
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={facilityFilter ?? ''}
            onChange={e => setFacilityFilter(e.target.value ? Number(e.target.value) : null)}
            className="input py-1.5 text-sm w-36"
          >
            <option value="">All rooms</option>
            {facilities.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
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
          <button onClick={() => onNewBooking()} className="btn-primary">+ New</button>
        </div>
      </div>

      {selectedBooking && (
        <BookingPopup
          booking={selectedBooking}
          facilities={facilities}
          currentUserId={user?.id}
          onClose={() => setSelectedBooking(null)}
          onNavigate={() => navigate(`/bookings/${selectedBooking.id}`)}
          onCancel={handleCancel}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
        </div>
      ) : (
        <div
          style={{
            transform: `translateX(${slide.x}px)`,
            opacity: slide.opacity,
            transition: slide.anim ? 'transform 0.18s ease, opacity 0.18s ease' : 'none',
          }}
        >
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              bookingsByDate={bookingsByDate}
              facilities={facilities}
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
              todayMidnight={todayMidnight}
              onBookingClick={onBookingClick}
              onNewBooking={onNewBooking}
              canDrag={canDrag}
              onReschedule={handleReschedule}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              bookingsByDate={bookingsByDate}
              facilities={facilities}
              onBookingClick={onBookingClick}
              canDrag={canDrag}
              onReschedule={handleReschedule}
            />
          )}
          {view === 'list' && (
            <ListView
              bookings={filteredBookings}
              facilities={facilities}
              onBookingClick={onBookingClick}
            />
          )}
          {facilitiesForKey.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
              {facilitiesForKey.map(f => (
                <div key={f.id} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: getFacilityColor(f.id, facilities) }} />
                  <span className="text-sm text-gray-700">{f.name}</span>
                </div>
              ))}
              <span className="text-xs text-gray-400">· Faded = pending</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Time grid helpers ────────────────────────────────────────────────────────

function TimeLabels({ slotPx = SLOT_PX }: { slotPx?: number }) {
  return (
    <div className="relative border-r border-gray-200 bg-gray-50">
      {HOURS.map(h => (
        <div
          key={h}
          className="absolute w-full text-right pr-2 text-xs text-gray-400 select-none"
          style={{ top: (h - HOUR_START) * 2 * slotPx - 7 }}
        >
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  )
}

function GridLines({ slotPx = SLOT_PX }: { slotPx?: number }) {
  return (
    <>
      {HOURS.map(h => (
        <div key={h} className="absolute w-full border-t border-gray-100" style={{ top: (h - HOUR_START) * 2 * slotPx }} />
      ))}
      {HOURS.map(h => (
        <div key={`${h}h`} className="absolute w-full border-t border-gray-50" style={{ top: (h - HOUR_START) * 2 * slotPx + slotPx }} />
      ))}
    </>
  )
}

function BookingBlock({ b, facilities, onClick, isDraggable, onDragStart, onDragEnd, slotPx = SLOT_PX }: {
  b: Booking
  facilities: Facility[]
  onClick: () => void
  isDraggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  slotPx?: number
}) {
  const totalHeight = (HOUR_END - HOUR_START) * 2 * slotPx
  const { top, height } = bookingPos(b, slotPx)
  if (top >= totalHeight) return null
  const color = getFacilityColor(b.facility_id, facilities)

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? onDragStart : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      onClick={onClick}
      title={`${b.facility_name} · ${b.start_time}–${b.end_time} · ${bookerLabel(b)}${b.status === 'pending' ? ' (pending)' : ''}`}
      style={{ top, height, backgroundColor: color, opacity: b.status === 'pending' ? 0.7 : 1 }}
      className={`absolute left-0.5 right-0.5 rounded overflow-hidden z-10 shadow-sm hover:opacity-90 ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      {height >= slotPx * 2 && (
        <span className="text-white text-[9px] leading-none px-0.5 pt-0.5 block truncate">
          {displayOrg(b)}
        </span>
      )}
    </div>
  )
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({ currentDate, bookingsByDate, facilities, todayMidnight, onBookingClick, onNewBooking }: {
  currentDate: Date
  bookingsByDate: Record<string, Booking[]>
  facilities: Facility[]
  todayMidnight: Date
  onBookingClick: (id: number) => void
  onNewBooking: (date: string) => void
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const MAX = 3
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
            const bookable = !isPast
            const isLastCol = (idx + 1) % 7 === 0

            return (
              <div
                key={key}
                onTouchStart={bookable ? () => { lpTimer.current = setTimeout(() => onNewBooking(key), 1000) } : undefined}
                onTouchMove={() => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } }}
                onTouchEnd={() => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } }}
                onClick={bookable ? () => onNewBooking(key) : undefined}
                className={[
                  'min-h-[90px] sm:min-h-[110px] border-b border-r border-gray-100 p-1 sm:p-1.5',
                  isLastCol ? 'border-r-0' : '',
                  !inMonth ? 'bg-gray-50/70' : isPast ? 'bg-gray-50/40' : 'bg-white',
                  bookable ? 'cursor-pointer hover:bg-primary-50/60 transition-colors' : '',
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
                    return (
                      <div
                        key={b.id}
                        onClick={e => { e.stopPropagation(); onBookingClick(b.id) }}
                        title={`${b.facility_name} · ${b.start_time}–${b.end_time} · ${bookerLabel(b)}${b.status === 'pending' ? ' (pending)' : ''}`}
                        style={{ backgroundColor: color, opacity: b.status === 'pending' ? 0.5 : 1 }}
                        className="h-6 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center px-1.5 overflow-hidden"
                      >
                        <span className="text-white text-xs truncate leading-none">
                          {displayOrg(b)}
                        </span>
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
    </>
  )
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({ currentDate, bookingsByDate, facilities, todayMidnight, onBookingClick, onNewBooking, canDrag, onReschedule }: {
  currentDate: Date
  bookingsByDate: Record<string, Booking[]>
  facilities: Facility[]
  todayMidnight: Date
  onBookingClick: (id: number) => void
  onNewBooking: (date: string) => void
  canDrag: (b: Booking) => boolean
  onReschedule: (bookingId: number, newDate: string, newTime: string) => void
}) {
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [currentDate])

  const handleDrop = (e: React.DragEvent, dayKey: string) => {
    e.preventDefault()
    setDropTarget(null)
    const bookingId = parseInt(e.dataTransfer.getData('bookingId'))
    if (!bookingId) return
    const rect = e.currentTarget.getBoundingClientRect()
    onReschedule(bookingId, dayKey, yToTime(e.clientY - rect.top, WEEK_SLOT_PX))
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Day headers */}
      <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        <div className="border-r border-gray-200" />
        {weekDays.map(day => {
          const isToday = isSameDay(day, new Date())
          const isPast = day < todayMidnight
          const bookable = !isPast
          const key = format(day, 'yyyy-MM-dd')
          return (
            <div
              key={key}
              onTouchStart={bookable ? () => { lpTimer.current = setTimeout(() => onNewBooking(key), 1000) } : undefined}
              onTouchMove={() => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } }}
              onTouchEnd={() => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } }}
              onClick={bookable ? () => onNewBooking(key) : undefined}
              className={`py-2 text-center border-l border-gray-200 ${bookable ? 'cursor-pointer hover:bg-primary-50' : ''}`}
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
      <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', height: WEEK_TOTAL_HEIGHT }}>
        <TimeLabels slotPx={WEEK_SLOT_PX} />
        {weekDays.map(day => {
          const key = format(day, 'yyyy-MM-dd')
          const dayBookings = bookingsByDate[key] || []
          const isToday = isSameDay(day, new Date())
          const isDropTarget = dropTarget === key
          return (
            <div
              key={key}
              className={`relative border-l border-gray-200 transition-colors ${isToday ? 'bg-primary-50/20' : ''} ${isDropTarget ? 'bg-primary-100/50' : ''}`}
              onDragOver={e => { e.preventDefault(); setDropTarget(key) }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={e => handleDrop(e, key)}
            >
              <GridLines slotPx={WEEK_SLOT_PX} />
              {dayBookings.map(b => (
                <BookingBlock
                  key={b.id}
                  b={b}
                  facilities={facilities}
                  onClick={() => onBookingClick(b.id)}
                  slotPx={WEEK_SLOT_PX}
                  isDraggable={canDrag(b)}
                  onDragStart={e => e.dataTransfer.setData('bookingId', String(b.id))}
                  onDragEnd={() => setDropTarget(null)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Day view ─────────────────────────────────────────────────────────────────

function DayView({ currentDate, bookingsByDate, facilities, onBookingClick, canDrag, onReschedule }: {
  currentDate: Date
  bookingsByDate: Record<string, Booking[]>
  facilities: Facility[]
  onBookingClick: (id: number) => void
  canDrag: (b: Booking) => boolean
  onReschedule: (bookingId: number, newDate: string, newTime: string) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const key = format(currentDate, 'yyyy-MM-dd')
  const dayBookings = bookingsByDate[key] || []

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const bookingId = parseInt(e.dataTransfer.getData('bookingId'))
    if (!bookingId) return
    const rect = e.currentTarget.getBoundingClientRect()
    onReschedule(bookingId, key, yToTime(e.clientY - rect.top))
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', height: TOTAL_HEIGHT }}>
          <TimeLabels />
          <div
            className={`relative transition-colors ${isDragOver ? 'bg-primary-100/50' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <GridLines />
            {dayBookings.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
                No bookings this day
              </div>
            )}
            {dayBookings.map(b => {
              const { top, height } = bookingPos(b)
              if (top >= TOTAL_HEIGHT) return null
              const color = getFacilityColor(b.facility_id, facilities)
              const draggable = canDrag(b)
              return (
                <div
                  key={b.id}
                  draggable={draggable}
                  onDragStart={draggable ? e => {
                    e.dataTransfer.setData('bookingId', String(b.id))
                  } : undefined}
                  onDragEnd={draggable ? () => setIsDragOver(false) : undefined}
                  onClick={() => onBookingClick(b.id)}
                  style={{ top, height, backgroundColor: color, opacity: b.status === 'pending' ? 0.7 : 1 }}
                  className={`absolute left-2 right-2 rounded-lg text-white p-2 overflow-hidden hover:opacity-90 shadow-md z-10 ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
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

// ─── Booking popup ────────────────────────────────────────────────────────────

function BookingPopup({ booking, facilities, currentUserId, onClose, onNavigate, onCancel }: {
  booking: Booking
  facilities: Facility[]
  currentUserId?: string
  onClose: () => void
  onNavigate: () => void
  onCancel: (id: number) => void
}) {
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const color = getFacilityColor(booking.facility_id, facilities)
  const statusCls = booking.status === 'approved'
    ? 'bg-green-100 text-green-700'
    : booking.status === 'denied'
    ? 'bg-red-100 text-red-700'
    : 'bg-amber-100 text-amber-700'

  const canCancel = booking.status === 'pending' && booking.booker_id === currentUserId

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="font-semibold text-gray-900 truncate">{booking.facility_name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${statusCls}`}>
              {booking.status}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 space-y-1.5">
          <div className="text-sm font-medium text-gray-800">
            {format(parseISO(booking.date), 'EEEE, d MMMM yyyy')}
          </div>
          <div className="text-sm text-gray-600">
            {booking.start_time} – {booking.end_time} · {slotsToLabel(booking.duration_slots)}
          </div>
          <div className="text-sm text-gray-600">
            {booking.booker_name}
            {(booking.organisation || booking.booker_organisation) && (
              <span className="text-gray-500"> · {booking.organisation || booking.booker_organisation}</span>
            )}
          </div>
          {booking.notes && (
            <div className="text-sm text-gray-500 italic pt-1">{booking.notes}</div>
          )}
          {booking.controller_notes && (
            <div className="text-sm text-gray-500 border-t border-gray-100 pt-2 mt-1">
              <span className="font-medium text-gray-600">Controller note:</span> {booking.controller_notes}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 flex gap-2">
          {canCancel && !cancelConfirm && (
            <button onClick={() => setCancelConfirm(true)} className="btn-danger flex-1">
              Cancel
            </button>
          )}
          {canCancel && cancelConfirm && (
            <>
              <button onClick={() => onCancel(booking.id)} className="btn-danger flex-1">Confirm Cancel</button>
              <button onClick={() => setCancelConfirm(false)} className="btn-secondary flex-1">Keep</button>
            </>
          )}
          {!cancelConfirm && (
            <button onClick={onNavigate} className="btn-primary flex-1">
              View Details
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
