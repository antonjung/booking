import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import client from '../api/client'
import { RegistrationRequest } from '../types'
import { formatDistanceToNow } from 'date-fns'

type Tab = 'pending' | 'history'

export default function AdminRegistrations() {
  const [requests, setRequests] = useState<RegistrationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [copied, setCopied] = useState(false)

  const registerUrl = `${window.location.origin}/register`

  const load = async () => {
    setLoading(true)
    try {
      const res = await client.get('/registrations')
      setRequests(res.data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pending = requests.filter(r => r.status === 'pending')
  const history = requests.filter(r => r.status !== 'pending')

  const handleApprove = async (id: number) => {
    setActionLoading(true)
    setActionError('')
    try {
      await client.put(`/registrations/${id}/approve`, {})
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg || 'Failed to approve')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeny = async (id: number) => {
    setActionLoading(true)
    setActionError('')
    try {
      await client.put(`/registrations/${id}/deny`, { reason: denyReason })
      setReviewId(null)
      setDenyReason('')
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg || 'Failed to deny')
    } finally {
      setActionLoading(false)
    }
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(registerUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const shown = tab === 'pending' ? pending : history

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Registration Requests</h1>
        {pending.length > 0 && (
          <span className="badge-pending text-sm px-3 py-1">{pending.length} pending</span>
        )}
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {actionError}
        </div>
      )}

      {/* QR Code & Link */}
      <div className="card">
        <h2 className="mb-4">Registration Link</h2>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex-shrink-0">
            <QRCodeSVG
              value={registerUrl}
              size={160}
              bgColor="#ffffff"
              fgColor="#1d4ed8"
              level="M"
              includeMargin
            />
            <p className="text-xs text-gray-400 mt-1 text-center">Print or share this QR code</p>
          </div>
          <div className="flex-1 space-y-3">
            <p className="text-sm text-gray-600">
              Share this link or QR code so new users can submit a registration request. You'll be notified and can approve or deny access from this page.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-gray-100 rounded-lg px-3 py-2 text-gray-700 truncate">
                {registerUrl}
              </code>
              <button onClick={copyUrl} className="btn-secondary flex-shrink-0">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <a href={registerUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary-600 hover:text-primary-800 underline">
              Open registration page →
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(['pending', 'history'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pending' ? `Pending (${pending.length})` : `History (${history.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
        </div>
      ) : shown.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-500">
            {tab === 'pending' ? 'No pending registration requests.' : 'No review history yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(r => (
            <div key={r.id}
              className={`card border ${r.status === 'pending' ? 'border-gray-200' : r.status === 'approved' ? 'border-green-100' : 'border-red-100'}`}>
              <div className="flex flex-wrap gap-4 items-start justify-between">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{r.name}</span>
                    {r.status !== 'pending' && (
                      <span className={r.status === 'approved' ? 'badge-approved' : 'badge-denied'}>
                        {r.status}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">{r.email}</div>
                  {r.phone && <div className="text-sm text-gray-500">{r.phone}</div>}
                  {r.organisation && (
                    <div className="text-sm text-gray-600 font-medium">{r.organisation}</div>
                  )}
                  {r.notes && (
                    <div className="text-sm text-gray-500 italic pt-1">"{r.notes}"</div>
                  )}
                  {r.denial_reason && (
                    <div className="text-sm text-red-600 pt-1">Denied: {r.denial_reason}</div>
                  )}
                  <div className="text-xs text-gray-400">
                    Submitted {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </div>
                </div>

                {r.status === 'pending' && reviewId !== r.id && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApprove(r.id)}
                      disabled={actionLoading}
                      className="btn-success btn-sm"
                    >
                      {actionLoading ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => { setReviewId(r.id); setDenyReason('') }}
                      className="btn-danger btn-sm"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>

              {/* Deny reason input */}
              {reviewId === r.id && (
                <div className="mt-4 pt-4 border-t border-red-100 space-y-3">
                  <div>
                    <label className="label">Reason for denial (optional — sent to user)</label>
                    <textarea
                      value={denyReason}
                      onChange={e => setDenyReason(e.target.value)}
                      className="input"
                      rows={2}
                      placeholder="e.g. We are not accepting new members at this time."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setReviewId(null)} className="btn-secondary flex-1">Cancel</button>
                    <button
                      onClick={() => handleDeny(r.id)}
                      disabled={actionLoading}
                      className="btn-danger flex-1"
                    >
                      {actionLoading ? '…' : 'Confirm Denial'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
