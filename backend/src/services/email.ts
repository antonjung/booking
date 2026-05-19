import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log(`[Email] Email not configured. Would send to ${to}: ${subject}`);
    return;
  }

  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@villagehall.local',
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err);
  }
}

export function bookingRequestEmailHtml(bookerName: string, facility: string, date: string, startTime: string, durationSlots: number, notes?: string): string {
  const hours = Math.floor(durationSlots / 2);
  const mins = (durationSlots % 2) * 30;
  const durationStr = hours > 0 && mins > 0 ? `${hours}h ${mins}min` : hours > 0 ? `${hours}h` : `${mins}min`;

  return `
    <h2>New Booking Request</h2>
    <p>A new booking request has been submitted and requires your review.</p>
    <table style="border-collapse:collapse;width:100%;max-width:500px">
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Booker</td><td style="padding:8px">${bookerName}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Facility</td><td style="padding:8px">${facility}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Date</td><td style="padding:8px">${date}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Start Time</td><td style="padding:8px">${startTime}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Duration</td><td style="padding:8px">${durationStr}</td></tr>
      ${notes ? `<tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Notes</td><td style="padding:8px">${notes}</td></tr>` : ''}
    </table>
    <p>Please log in to review and approve or deny this booking.</p>
  `;
}

export function bookingStatusEmailHtml(status: 'approved' | 'denied', facility: string, date: string, startTime: string, durationSlots: number, controllerNotes?: string): string {
  const hours = Math.floor(durationSlots / 2);
  const mins = (durationSlots % 2) * 30;
  const durationStr = hours > 0 && mins > 0 ? `${hours}h ${mins}min` : hours > 0 ? `${hours}h` : `${mins}min`;
  const statusText = status === 'approved' ? 'Approved' : 'Denied';
  const statusColor = status === 'approved' ? '#16a34a' : '#dc2626';

  return `
    <h2>Booking <span style="color:${statusColor}">${statusText}</span></h2>
    <p>Your booking request has been <strong>${statusText.toLowerCase()}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;max-width:500px">
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Facility</td><td style="padding:8px">${facility}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Date</td><td style="padding:8px">${date}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Start Time</td><td style="padding:8px">${startTime}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Duration</td><td style="padding:8px">${durationStr}</td></tr>
      ${controllerNotes ? `<tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Notes</td><td style="padding:8px">${controllerNotes}</td></tr>` : ''}
    </table>
  `;
}
