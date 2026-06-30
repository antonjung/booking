import nodemailer from 'npm:nodemailer'

function getTransporter() {
  const host = Deno.env.get('EMAIL_HOST')
  const user = Deno.env.get('EMAIL_USER')
  const pass = Deno.env.get('EMAIL_PASS')
  if (!host || !user || !pass) return null

  return nodemailer.createTransport({
    host,
    port: parseInt(Deno.env.get('EMAIL_PORT') || '587'),
    secure: false,
    auth: { user, pass },
  })
}

const FROM = () => Deno.env.get('EMAIL_FROM') || 'noreply@villagehall.local'

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) return
  await transporter.sendMail({ from: FROM(), to, subject, html })
}

export function bookingRequestHtml(
  bookerName: string, facilityName: string, date: string,
  startTime: string, durationSlots: number, notes?: string
): string {
  const mins = durationSlots * 30
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`
  return `<h2>New Booking Request</h2>
<p><strong>${bookerName}</strong> has requested a booking:</p>
<ul>
  <li><strong>Facility:</strong> ${facilityName}</li>
  <li><strong>Date:</strong> ${date}</li>
  <li><strong>Time:</strong> ${startTime} (${dur})</li>
  ${notes ? `<li><strong>Notes:</strong> ${notes}</li>` : ''}
</ul>
<p>Please log in to approve or deny this request.</p>`
}

export function bookingStatusHtml(
  status: 'approved' | 'denied', facilityName: string, date: string,
  startTime: string, durationSlots: number, notes?: string
): string {
  const label = status === 'approved' ? 'Approved' : 'Denied'
  const color = status === 'approved' ? '#16a34a' : '#dc2626'
  const mins = durationSlots * 30
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`
  return `<h2 style="color:${color}">Booking ${label}</h2>
<ul>
  <li><strong>Facility:</strong> ${facilityName}</li>
  <li><strong>Date:</strong> ${date}</li>
  <li><strong>Time:</strong> ${startTime} (${dur})</li>
</ul>
${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}`
}
