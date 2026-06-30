import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendEmail } from '../_shared/email.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const role = user.app_metadata?.role || 'booker'
  if (!['controller', 'admin'].includes(role)) return json({ error: 'Forbidden' }, 403)

  const { request_id, action, reason } = await req.json()
  if (!['approve', 'deny'].includes(action)) return json({ error: 'Invalid action' }, 400)

  const { data: request } = await supabase
    .from('registration_requests')
    .select('*')
    .eq('id', request_id)
    .single()

  if (!request) return json({ error: 'Registration request not found' }, 404)
  if (request.status !== 'pending') return json({ error: 'Request has already been reviewed' }, 400)

  if (action === 'deny') {
    await supabase.from('registration_requests').update({
      status: 'denied',
      reviewed_by: user.id,
      denial_reason: reason || null,
    }).eq('id', request_id)

    await sendEmail(
      request.email,
      'Your registration request',
      `<p>Hi ${request.name},</p>
       <p>Thank you for your interest in Village Hall Booking.</p>
       <p>Unfortunately, your registration request has not been approved at this time.</p>
       ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
       <p>If you have questions, please contact the hall directly.</p>`
    )

    return json({ message: 'Registration request denied' })
  }

  // action === 'approve'
  // Check email not already registered
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', request.email)
    .maybeSingle()

  if (existingUser) {
    // Already a user — just mark approved
    await supabase.from('registration_requests').update({
      status: 'approved', reviewed_by: user.id
    }).eq('id', request_id)
    return json({ message: 'Already registered — request marked approved' })
  }

  // Generate invite link (creates auth user, no email sent by Supabase)
  const siteUrl = Deno.env.get('SITE_URL') || 'https://booking-9c3.pages.dev'
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: request.email,
    options: { redirectTo: siteUrl },
  })

  if (linkError) return json({ error: `Failed to create account: ${linkError.message}` }, 500)

  const inviteUser = linkData.user
  const inviteLink = linkData.properties?.action_link

  // Create public.users profile
  const usernameBase = request.email.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase()
  const username = `${usernameBase}_${Date.now().toString(36)}`

  await supabase.from('users').insert({
    id: inviteUser.id,
    username,
    email: request.email,
    name: request.name,
    phone: request.phone || null,
    organisation: request.organisation || null,
    role: 'booker',
    contact_preference: 'both',
  })

  // Set role in app_metadata so JWT contains the role
  await supabase.auth.admin.updateUserById(inviteUser.id, {
    app_metadata: { role: 'booker' },
  })

  // Mark request approved
  await supabase.from('registration_requests').update({
    status: 'approved', reviewed_by: user.id
  }).eq('id', request_id)

  // Send invite email via our Gmail SMTP
  await sendEmail(
    request.email,
    'Your Village Hall Booking account is ready',
    `<h2>Welcome, ${request.name}!</h2>
     <p>Your registration request has been approved. Click the link below to set your password and access the system:</p>
     <p style="margin: 24px 0;">
       <a href="${inviteLink}"
          style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
         Set My Password
       </a>
     </p>
     <p style="color:#6b7280;font-size:0.875rem;">This link expires in 24 hours. After setting your password, you can log in at <a href="${siteUrl}">${siteUrl}</a></p>
     <p style="color:#6b7280;font-size:0.875rem;">If you didn't request this, you can ignore this email.</p>`
  )

  return json({ message: 'Registration approved — invite email sent' })
})
