import db from '../database';
import { Booking, User } from '../types';
import { sendEmail, bookingRequestEmailHtml, bookingStatusEmailHtml } from './email';

export function createNotification(
  userId: number,
  bookingId: number | null,
  message: string,
  type: 'booking_request' | 'booking_approved' | 'booking_denied'
): void {
  const stmt = db.prepare(`
    INSERT INTO notifications (user_id, booking_id, message, type)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(userId, bookingId, message, type);
}

export async function notifyControllers(
  booking: Booking,
  bookerName: string,
  facilityName: string
): Promise<void> {
  const controllers = db.prepare(`
    SELECT * FROM users WHERE role IN ('controller', 'admin')
  `).all() as User[];

  const message = `New booking request from ${bookerName} for ${facilityName} on ${booking.date} at ${booking.start_time}`;

  for (const controller of controllers) {
    // Always create in-app notification
    if (controller.contact_preference === 'notification' || controller.contact_preference === 'both') {
      createNotification(controller.id, booking.id, message, 'booking_request');
    }

    // Send email if preference is email or both
    if (controller.contact_preference === 'email' || controller.contact_preference === 'both') {
      const html = bookingRequestEmailHtml(
        bookerName,
        facilityName,
        booking.date,
        booking.start_time,
        booking.duration_slots,
        booking.notes
      );
      await sendEmail(controller.email, `New Booking Request: ${facilityName} on ${booking.date}`, html);
    }

    // If preference is notification only, still create notification
    if (controller.contact_preference === 'notification') {
      // Already created above
    }

    // Ensure notification is always created regardless
    if (controller.contact_preference === 'email') {
      createNotification(controller.id, booking.id, message, 'booking_request');
    }
  }
}

export async function notifyBooker(
  booking: Booking,
  status: 'approved' | 'denied',
  facilityName: string,
  controllerNotes?: string
): Promise<void> {
  const booker = db.prepare(`SELECT * FROM users WHERE id = ?`).get(booking.booker_id) as User | undefined;
  if (!booker) return;

  const statusText = status === 'approved' ? 'approved' : 'denied';
  const message = `Your booking for ${facilityName} on ${booking.date} at ${booking.start_time} has been ${statusText}${controllerNotes ? `: ${controllerNotes}` : ''}`;
  const type = status === 'approved' ? 'booking_approved' : 'booking_denied';

  // Always create in-app notification
  createNotification(booker.id, booking.id, message, type);

  // Send email if preference is email or both
  if (booker.contact_preference === 'email' || booker.contact_preference === 'both') {
    const html = bookingStatusEmailHtml(
      status,
      facilityName,
      booking.date,
      booking.start_time,
      booking.duration_slots,
      controllerNotes
    );
    await sendEmail(booker.email, `Booking ${status === 'approved' ? 'Approved' : 'Denied'}: ${facilityName} on ${booking.date}`, html);
  }
}
