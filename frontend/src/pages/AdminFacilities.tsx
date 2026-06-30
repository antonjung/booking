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

function TypeBadge({ type, color }: { type: string; color?: string }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium text-white capitalize"
      style={{ backgroundColor: color || '#2563eb' }}
    >
      {type}
    </span>
  )
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
      is_whole_hall: !!f.is_whole_hall,
      active: !!f.active,
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
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {facilities.map(f => (
                  <tr key={f.id} className={`hover:bg-gray-50 ${!f.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{f.name}</div>
                      {f.is_whole_hall && (
                        <span className="text-xs text-indigo-600">Whole Hall</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={f.type} color={f.color} /></td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell max-w-xs truncate">
                      {f.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {f.capacity ? `${f.capacity} people` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(f)} title="Edit" className="p-1.5 text-gray-500 hover:text-primary-700 hover:bg-gray-100 rounded transition-colors">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(f)} title="Delete" className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
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
