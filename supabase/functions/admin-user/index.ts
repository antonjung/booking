import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

  const callerRole = user.app_metadata?.role || 'booker'
  if (callerRole !== 'admin') return json({ error: 'Forbidden: admin only' }, 403)

  const body = await req.json()

  // POST: create user
  if (req.method === 'POST') {
    const { username, email, password, name, organisation, phone, role = 'booker', contact_preference = 'both' } = body

    if (!username || !email || !password || !name)
      return json({ error: 'username, email, password, and name are required' }, 400)

    const { data: authData, error: authCreateErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
    })
    if (authCreateErr) return json({ error: authCreateErr.message }, 400)

    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .insert({ id: authData.user.id, username, email, name, organisation: organisation || null, phone: phone || null, role, contact_preference })
      .select()
      .single()

    if (profileErr) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      return json({ error: profileErr.message }, 400)
    }

    return json(profile, 201)
  }

  // PUT: update user
  if (req.method === 'PUT') {
    const { id, username, email, password, name, organisation, phone, role, contact_preference } = body
    if (!id) return json({ error: 'id is required' }, 400)

    const profileUpdates: Record<string, unknown> = {}
    if (username !== undefined) profileUpdates.username = username
    if (email !== undefined) profileUpdates.email = email
    if (name !== undefined) profileUpdates.name = name
    if (organisation !== undefined) profileUpdates.organisation = organisation
    if (phone !== undefined) profileUpdates.phone = phone
    if (role !== undefined) profileUpdates.role = role
    if (contact_preference !== undefined) profileUpdates.contact_preference = contact_preference

    if (Object.keys(profileUpdates).length > 0) {
      const { error: updateErr } = await supabase.from('users').update(profileUpdates).eq('id', id)
      if (updateErr) return json({ error: updateErr.message }, 400)
    }

    // Sync role to auth metadata
    if (role) {
      await supabase.auth.admin.updateUserById(id, { app_metadata: { role } })
    }

    // Update auth email or password
    const authUpdates: Record<string, unknown> = {}
    if (email) authUpdates.email = email
    if (password) authUpdates.password = password
    if (Object.keys(authUpdates).length > 0) {
      await supabase.auth.admin.updateUserById(id, authUpdates)
    }

    const { data: updated } = await supabase.from('users').select('*').eq('id', id).single()
    return json(updated)
  }

  // DELETE: remove user
  if (req.method === 'DELETE') {
    const { id } = body
    if (!id) return json({ error: 'id is required' }, 400)
    if (id === user.id) return json({ error: 'Cannot delete your own account' }, 400)

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(id)
    if (deleteErr) return json({ error: deleteErr.message }, 400)
    // ON DELETE CASCADE handles public.users row deletion

    return json({ message: 'User deleted' })
  }

  return json({ error: 'Method not allowed' }, 405)
})
