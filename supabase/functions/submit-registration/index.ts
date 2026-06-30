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

// Deployed with --no-verify-jwt so unauthenticated users can submit
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { name, email, phone, organisation, notes } = await req.json()

  if (!name?.trim() || !email?.trim()) {
    return json({ error: 'Name and email are required' }, 400)
  }

  const normalizedEmail = email.trim().toLowerCase()

  // Check if email is already an active user
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingUser) {
    return json({ error: 'An account with this email already exists. Please sign in.' }, 409)
  }

  // Check for a pending or approved registration request with the same email
  const { data: existingReq } = await supabase
    .from('registration_requests')
    .select('id, status')
    .eq('email', normalizedEmail)
    .in('status', ['pending', 'approved'])
    .maybeSingle()

  if (existingReq) {
    const msg = existingReq.status === 'approved'
      ? 'Your registration has already been approved — please check your email for sign-in instructions.'
      : 'A registration request for this email is already pending review.'
    return json({ error: msg }, 409)
  }

  // Insert registration request
  const { data: request, error: insertError } = await supabase
    .from('registration_requests')
    .insert({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || null,
      organisation: organisation?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (insertError) return json({ error: insertError.message }, 400)

  // Notify all controllers and admins
  const { data: reviewers } = await supabase
    .from('users')
    .select('*')
    .in('role', ['controller', 'admin'])

  const msg = `New registration request from ${name.trim()} (${normalizedEmail})${organisation ? ` — ${organisation}` : ''}`

  for (const reviewer of reviewers || []) {
    await supabase.from('notifications').insert({
      user_id: reviewer.id,
      message: msg,
      type: 'registration_request',
    })
    if (reviewer.contact_preference === 'email' || reviewer.contact_preference === 'both') {
      await sendEmail(
        reviewer.email,
        `New Registration Request: ${name.trim()}`,
        `<h2>New Registration Request</h2>
         <p><strong>Name:</strong> ${name.trim()}</p>
         <p><strong>Email:</strong> ${normalizedEmail}</p>
         ${phone ? `<p><strong>Phone:</strong> ${phone.trim()}</p>` : ''}
         ${organisation ? `<p><strong>Organisation:</strong> ${organisation.trim()}</p>` : ''}
         ${notes ? `<p><strong>Notes:</strong> ${notes.trim()}</p>` : ''}
         <p>Log in to review this request.</p>`
      )
    }
  }

  return json({ id: request.id, message: 'Registration submitted successfully' })
})
