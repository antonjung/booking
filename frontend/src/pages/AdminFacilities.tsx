import { useState, useEffect, FormEvent } from 'react'
import client from '../api/client'
import { Facility } from '../types'

interface FacilityForm {
  name: string
  description: string
  type: 'room' | 'equipment' | 'service'
  capacity: string
  is_whole_hall: boolean
  active: boolean
  color: string
}

const emptyForm: FacilityForm = {
  name: '', description: '', type: 'room', capacity: '', is_whole_hall: false, active: true, color: '#2563eb',
}

function TypeBadge({ type }: { type: string }) {
  const cls = type === 'room' ? 'badge-room' : type === 'equipment' ? 'badge-equipment' : 'badge-service'
  return <span className={cls}>{type}</span>
}

export default function AdminFacilities() {
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editFacility, setEditFacility] = useState<Facility | null>(null)
  const [form, setForm] = useState<FacilityForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await client.get('/facilities/all')
      setFacilities(res.data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditFacility(null)
    setForm(emptyForm)
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (f: Facility) => {
    setEditFacility(f)
    setForm({
      name: f.name,
      description: f.description || '',
      type: f.type,
      capacity: f.capacity ? String(f.capacity) : '',
      is_whole_hall: f.is_whole_hall === 1,
      active: f.active === 1,
      color: f.color || '#2563eb',
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)

    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        type: form.type,
        capacity: form.capacity ? parseInt(form.capacity) : undefined,
        is_whole_hall: form.is_whole_hall,
        active: form.active,
        color: form.color,
      }

      if (editFacility) {
        await client.put(`/facilities/${editFacility.id}`, payload)
      } else {
        await client.post('/facilities', payload)
      }
      setShowModal(false)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setFormError(msg || 'Failed to save facility.')
    } finally {
      setFormLoading(false)
    }
  }

  const toggleActive = async (f: Facility) => {
    try {
      await client.put(`/facilities/${f.id}`, { active: f.active === 0 })
      await load()
    } catch {
      alert('Failed to toggle facility status')
    }
  }

  const handleDelete = async (f: Facility) => {
    if (!confirm(`Permanently delete "${f.name}"? This cannot be undone.`)) return
    try {
      await client.delete(`/facilities/${f.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg || 'Failed to delete facility.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Facility Management</h1>
        <button onClick={openAdd} className="btn-primary">+ Add Facility</button>
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
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium hidden sm:table-cell">Description</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium hidden md:table-cell">Capacity</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {facilities.map(f => (
                  <tr key={f.id} className={`hover:bg-gray-50 ${f.active === 0 ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: f.color || '#2563eb' }} />
                        <div className="font-medium">{f.name}</div>
                      </div>
                      {f.is_whole_hall === 1 && (
                        <span className="text-xs text-indigo-600 ml-5">Whole Hall</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={f.type} /></td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell max-w-xs truncate">
                      {f.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {f.capacity ? `${f.capacity} people` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(f)}
                        className={`badge cursor-pointer ${f.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {f.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(f)} className="btn-secondary btn-sm">Edit</button>
                        <button onClick={() => handleDelete(f)} className="btn-danger btn-sm">Delete</button>
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
              <h2>{editFacility ? 'Edit Facility' : 'Add New Facility'}</h2>
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

              <div>
                <label className="label">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" required />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" rows={2} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Type *</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as FacilityForm['type'] }))} className="input" required>
                    <option value="room">Room</option>
                    <option value="equipment">Equipment</option>
                    <option value="service">Service</option>
                  </select>
                </div>
                <div>
                  <label className="label">Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                    className="input"
                    placeholder="People"
                  />
                </div>
              </div>

              <div>
                <label className="label">Pill Colour</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    className="h-9 w-14 rounded border border-gray-300 cursor-pointer p-0.5"
                  />
                  <span className="text-sm text-gray-500 font-mono">{form.color}</span>
                  <div className="text-xs px-2 py-1 rounded-full text-white font-medium" style={{ backgroundColor: form.color }}>
                    Preview
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_whole_hall}
                    onChange={e => setForm(f => ({ ...f, is_whole_hall: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600"
                  />
                  <span className="text-sm text-gray-700">Whole Hall booking</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={formLoading} className="btn-primary flex-1">
                  {formLoading ? 'Saving...' : editFacility ? 'Save Changes' : 'Create Facility'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
