import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

function RoleBadge({ role }: { role: string }) {
  const cls = role === 'admin' ? 'badge-admin' : role === 'controller' ? 'badge-controller' : 'badge-booker'
  return <span className={cls}>{role}</span>
}

export default function Profile() {
  const { user, updateUser } = useAuth()

  const [name, setName] = useState(user?.name || '')
  const [organisation, setOrganisation] = useState(user?.organisation || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [contactPref, setContactPref] = useState<'email' | 'notification' | 'both'>(user?.contact_preference || 'both')

  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')

  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [passLoading, setPassLoading] = useState(false)

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault()
    setProfileMsg(null)
    setProfileLoading(true)

    try {
      await updateUser({ name, organisation, phone, contact_preference: contactPref as 'email' | 'notification' | 'both' })
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setProfileMsg({ type: 'error', text: msg || 'Failed to update profile.' })
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordSave = async (e: FormEvent) => {
    e.preventDefault()
    setPassMsg(null)

    if (newPass !== confirmPass) {
      setPassMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }

    if (newPass.length < 6) {
      setPassMsg({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }

    setPassLoading(true)
    try {
      await updateUser({ current_password: currentPass, new_password: newPass })
      setPassMsg({ type: 'success', text: 'Password changed successfully.' })
      setCurrentPass('')
      setNewPass('')
      setConfirmPass('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setPassMsg({ type: 'error', text: msg || 'Failed to change password.' })
    } finally {
      setPassLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1>My Profile</h1>

      {/* Account info */}
      <div className="card bg-gray-50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary-700 flex items-center justify-center text-white text-xl font-bold">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.username} · {user?.email}</p>
            <div className="mt-1">
              <RoleBadge role={user?.role || ''} />
            </div>
          </div>
        </div>
      </div>

      {/* Edit profile */}
      <div className="card">
        <h2 className="mb-4">Edit Profile</h2>
        <form onSubmit={handleProfileSave} className="space-y-4">
          {profileMsg && (
            <div className={`px-4 py-3 rounded-md text-sm ${
              profileMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {profileMsg.text}
            </div>
          )}

          <div>
            <label className="label">Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input" required />
          </div>

          <div>
            <label className="label">Organisation</label>
            <input value={organisation} onChange={e => setOrganisation(e.target.value)} className="input" placeholder="Your organisation or group name" />
          </div>

          <div>
            <label className="label">Phone Number</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input" placeholder="+44 7700 900000" />
          </div>

          <div>
            <label className="label">Contact Preference</label>
            <select value={contactPref} onChange={e => setContactPref(e.target.value as 'email' | 'notification' | 'both')} className="input">
              <option value="both">Email & In-app Notification</option>
              <option value="email">Email only</option>
              <option value="notification">In-app Notification only</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">How you would like to be notified about booking updates.</p>
          </div>

          <button type="submit" disabled={profileLoading} className="btn-primary w-full">
            {profileLoading ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="card">
        <h2 className="mb-4">Change Password</h2>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          {passMsg && (
            <div className={`px-4 py-3 rounded-md text-sm ${
              passMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {passMsg.text}
            </div>
          )}

          <div>
            <label className="label">Current Password</label>
            <input type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} className="input" required />
          </div>

          <div>
            <label className="label">New Password</label>
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} className="input" required minLength={6} />
          </div>

          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} className="input" required minLength={6} />
          </div>

          <button type="submit" disabled={passLoading} className="btn-primary w-full">
            {passLoading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
