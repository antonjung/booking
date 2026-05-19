import { Router, Request, Response } from 'express';
import db from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';
import { Booking, Facility } from '../types';
import { notifyControllers, notifyBooker } from '../services/notifications';

const router = Router();

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function checkConflict(
  facilityId: number,
  date: string,
  startTime: string,
  durationSlots: number,
  excludeBookingId?: number
): boolean {
  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(facilityId) as Facility | undefined;
  if (!facility) return false;

  const startMin = timeToMinutes(startTime);
  const endMin = startMin + durationSlots * 30;

  // Get all approved bookings for the same date (excluding current if updating)
  let query = `
    SELECT b.*, f.is_whole_hall, f.type FROM bookings b
    JOIN facilities f ON b.facility_id = f.id
    WHERE b.date = ? AND b.status = 'approved'
  `;
  const params: (string | number)[] = [date];

  if (excludeBookingId) {
    query += ' AND b.id != ?';
    params.push(excludeBookingId);
  }

  const existingBookings = db.prepare(query).all(...params) as (Booking & { is_whole_hall: number; type: string })[];

  for (const existing of existingBookings) {
    const existStart = timeToMinutes(existing.start_time);
    const existEnd = existStart + existing.duration_slots * 30;

    // Check time overlap
    const overlaps = startMin < existEnd && endMin > existStart;
    if (!overlaps) continue;

    const existFacility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(existing.facility_id) as Facility;

    // Direct same facility conflict
    if (existing.facility_id === facilityId) return true;

    // If booking a whole hall, check if any room is occupied
    if (facility.is_whole_hall) {
      if (existFacility.type === 'room') return true;
    }

    // If existing booking is for whole hall and we're booking a room, conflict
    if (existFacility.is_whole_hall && facility.type === 'room') return true;
  }

  return false;
}

// GET /api/bookings
router.get('/', authenticateToken, (req: Request, res: Response): void => {
  const { date, status, facility_id } = req.query;
  const user = req.user!;

  let query = `
    SELECT
      b.*,
      f.name as facility_name,
      booker.name as booker_name,
      booker.email as booker_email,
      booker.organisation as booker_organisation,
      ctrl.name as controller_name,
      (
        SELECT time(datetime(b.start_time), '+' || (b.duration_slots * 30) || ' minutes')
      ) as end_time
    FROM bookings b
    JOIN facilities f ON b.facility_id = f.id
    JOIN users booker ON b.booker_id = booker.id
    LEFT JOIN users ctrl ON b.controller_id = ctrl.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  // Bookers only see their own bookings
  if (user.role === 'booker') {
    query += ' AND b.booker_id = ?';
    params.push(user.userId);
  }

  if (date) {
    query += ' AND b.date = ?';
    params.push(date as string);
  }

  if (status) {
    query += ' AND b.status = ?';
    params.push(status as string);
  }

  if (facility_id) {
    query += ' AND b.facility_id = ?';
    params.push(parseInt(facility_id as string));
  }

  query += ' ORDER BY b.date DESC, b.start_time DESC';

  const bookings = db.prepare(query).all(...params);
  res.json(bookings);
});

// POST /api/bookings — create booking request
router.post('/', authenticateToken, requireRole('booker', 'admin', 'controller'), async (req: Request, res: Response): Promise<void> => {
  const { facility_id, date, start_time, duration_slots, notes } = req.body;

  if (!facility_id || !date || !start_time || !duration_slots) {
    res.status(400).json({ error: 'facility_id, date, start_time, and duration_slots are required' });
    return;
  }

  if (!Number.isInteger(duration_slots) || duration_slots < 1 || duration_slots > 16) {
    res.status(400).json({ error: 'duration_slots must be between 1 and 16' });
    return;
  }

  const facility = db.prepare('SELECT * FROM facilities WHERE id = ? AND active = 1').get(facility_id) as Facility | undefined;
  if (!facility) {
    res.status(404).json({ error: 'Facility not found or inactive' });
    return;
  }

  // Validate time format
  if (!/^\d{2}:\d{2}$/.test(start_time)) {
    res.status(400).json({ error: 'start_time must be in HH:MM format' });
    return;
  }

  // Check for conflicts with approved bookings
  if (checkConflict(facility_id, date, start_time, duration_slots)) {
    res.status(409).json({ error: 'This time slot conflicts with an existing approved booking' });
    return;
  }

  const startMin = timeToMinutes(start_time);
  const endMin = startMin + duration_slots * 30;
  const end_time = minutesToTime(endMin);

  const result = db.prepare(`
    INSERT INTO bookings (facility_id, booker_id, date, start_time, duration_slots, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(facility_id, req.user!.userId, date, start_time, duration_slots, notes || null);

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid) as Booking;

  // Fetch booker name
  const booker = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user!.userId) as { name: string } | undefined;

  // Notify controllers
  await notifyControllers(booking, booker?.name || 'Unknown', facility.name);

  const fullBooking = db.prepare(`
    SELECT b.*, f.name as facility_name, booker.name as booker_name, booker.email as booker_email,
    '${end_time}' as end_time
    FROM bookings b
    JOIN facilities f ON b.facility_id = f.id
    JOIN users booker ON b.booker_id = booker.id
    WHERE b.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(fullBooking);
});

// PUT /api/bookings/:id/approve
router.put('/:id/approve', authenticateToken, requireRole('controller', 'admin'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { controller_notes } = req.body;

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Booking | undefined;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  if (booking.status !== 'pending') {
    res.status(400).json({ error: 'Only pending bookings can be approved' });
    return;
  }

  // Check for conflicts before approving
  if (checkConflict(booking.facility_id, booking.date, booking.start_time, booking.duration_slots, booking.id)) {
    res.status(409).json({ error: 'Cannot approve: this booking conflicts with another approved booking' });
    return;
  }

  db.prepare(`
    UPDATE bookings
    SET status = 'approved', controller_id = ?, controller_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user!.userId, controller_notes || null, id);

  const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Booking;
  const facility = db.prepare('SELECT name FROM facilities WHERE id = ?').get(updatedBooking.facility_id) as { name: string };

  await notifyBooker(updatedBooking, 'approved', facility.name, controller_notes);

  const fullBooking = db.prepare(`
    SELECT b.*, f.name as facility_name, booker.name as booker_name, booker.email as booker_email,
    ctrl.name as controller_name
    FROM bookings b
    JOIN facilities f ON b.facility_id = f.id
    JOIN users booker ON b.booker_id = booker.id
    LEFT JOIN users ctrl ON b.controller_id = ctrl.id
    WHERE b.id = ?
  `).get(id);

  res.json(fullBooking);
});

// PUT /api/bookings/:id/deny
router.put('/:id/deny', authenticateToken, requireRole('controller', 'admin'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { controller_notes } = req.body;

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Booking | undefined;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  if (booking.status !== 'pending') {
    res.status(400).json({ error: 'Only pending bookings can be denied' });
    return;
  }

  db.prepare(`
    UPDATE bookings
    SET status = 'denied', controller_id = ?, controller_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user!.userId, controller_notes || null, id);

  const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Booking;
  const facility = db.prepare('SELECT name FROM facilities WHERE id = ?').get(updatedBooking.facility_id) as { name: string };

  await notifyBooker(updatedBooking, 'denied', facility.name, controller_notes);

  const fullBooking = db.prepare(`
    SELECT b.*, f.name as facility_name, booker.name as booker_name, booker.email as booker_email,
    ctrl.name as controller_name
    FROM bookings b
    JOIN facilities f ON b.facility_id = f.id
    JOIN users booker ON b.booker_id = booker.id
    LEFT JOIN users ctrl ON b.controller_id = ctrl.id
    WHERE b.id = ?
  `).get(id);

  res.json(fullBooking);
});

// DELETE /api/bookings/:id — cancel booking
router.delete('/:id', authenticateToken, (req: Request, res: Response): void => {
  const { id } = req.params;
  const user = req.user!;

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Booking | undefined;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  // Bookers can only cancel their own pending bookings; admins can cancel any
  if (user.role === 'booker' && booking.booker_id !== user.userId) {
    res.status(403).json({ error: 'Not authorised to cancel this booking' });
    return;
  }

  if (user.role === 'booker' && booking.status !== 'pending') {
    res.status(400).json({ error: 'Only pending bookings can be cancelled' });
    return;
  }

  db.prepare('DELETE FROM notifications WHERE booking_id = ?').run(id);
  db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  res.json({ message: 'Booking cancelled' });
});

export default router;
