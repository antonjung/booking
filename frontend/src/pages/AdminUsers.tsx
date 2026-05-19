import { useState, useEffect, FormEvent } from 'react'
import client from '../api/client'
import { User } from '../types'

interface UserForm {
  username: string
  email: string
  password: string
  name: string
  organisation: string
  phone: string
  role: 'admin' | 'controller' | 'booker'
  contact_preference: 'email' | 'notification' | 'both'
}

const emptyForm: UserForm = {
  username: '', email: '', password: '', name: '',
  organisation: '', phone: '', role: 'booker', contact_preference: 'both',
}

function RoleBadge({ role }: { role: string }) {
  const cls = role === 'admin' ? 'badge-admin' : role === 'controller' ? 'badge-controller' : 'badge-booker'
  return <span className={cls}>{role}</span>
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await client.get('/users')
      setUsers(res.data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditUser(null)
    setForm(emptyForm)
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (u: User) => {
    setEditUser(u)
    setForm({
      username: u.username,
      email: u.email,
      password: '',
      name: u.name,
      organisation: u.organisation || '',
      phone: u.phone || '',
      role: u.role,
      contact_preference: u.contact_preference,
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)

    try {
      const payload: Record<string, string> = {
        username: form.username,
        email: form.email,
        name: form.name,
        organisation: form.organisation,
        phone: form.phone,
        role: form.role,
        contact_preference: form.contact_preference,
      }
      if (form.password) payload.password = form.password
      if (!editUser) {
        if (!form.password) { setFormError('Password is required for new users'); setFormLoading(false); return }
        payload.password = form.password
      }

      if (editUser) {
        await client.put(`/users/${editUser.id}`, payload)
      } else {
        await client.post('/users', payload)
      }
      setShowModal(false)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setFormError(msg || 'Failed to save user.')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await client.delete(`/users/${id}`)
      setDeleteConfirm(null)
      await load()
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to delete user')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>User Management</h1>
        <button onClick={openAdd} className="btn-primary">+ Add User</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Username</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium hidden sm:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium hidden md:table-cell">Organisation</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Role</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.username}</td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{u.email}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{u.organisation || '—'}</td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(u)} className="btn-secondary btn-sm">Edit</button>
                        {deleteConfirm === u.id ? (
                          <>
                            <button onClick={() => handleDelete(u.id)} className="btn-danger btn-sm">Confirm</button>
                            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary btn-sm">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setDeleteConfirm(u.id)} className="btn-danger btn-sm">Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2>{editUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{formError}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" required />
                </div>
                <div>
                  <label className="label">Username *</label>
                  <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="input" required />
                </div>
              </div>

              <div>
                <label className="label">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" required />
              </div>

              <div>
                <label className="label">{editUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input" required={!editUser} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Organisation</label>
                  <input value={form.organisation} onChange={e => setForm(f => ({ ...f, organisation: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Role *</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserForm['role'] }))} className="input" required>
                    <option value="booker">Booker</option>
                    <option value="controller">Controller</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="label">Contact Preference</label>
                  <select value={form.contact_preference} onChange={e => setForm(f => ({ ...f, contact_preference: e.target.value as UserForm['contact_preference'] }))} className="input">
                    <option value="both">Email & Notification</option>
                    <option value="email">Email only</option>
                    <option value="notification">Notification only</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={formLoading} className="btn-primary flex-1">
                  {formLoading ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
