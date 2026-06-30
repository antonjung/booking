import { useState, FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import supabase from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Register() {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Already logged in — go home
  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('submit-registration', {
        body: { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), organisation: organisation.trim(), notes: notes.trim() },
      })

      if (fnError) {
        let msg = fnError.message || 'Submission failed'
        try {
          if ('context' in fnError && fnError.context instanceof Response) {
            const b = await (fnError.context as Response).json()
            msg = b?.error || msg
          }
        } catch { /* noop */ }
        setError(msg)
      } else if (data?.error) {
        setError(data.error)
      } else {
        setSubmitted(true)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-800 to-primary-900 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-2xl mb-4">
            <svg className="h-9 w-9 text-primary-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Request Access</h1>
          <p className="text-gray-500 text-sm mt-1">Village Hall Booking</p>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Request Submitted</h2>
            <p className="text-gray-600 text-sm">
              Your registration request has been sent for review. You'll receive an email once your account is approved.
            </p>
            <Link to="/login" className="btn-primary inline-block mt-2">Back to Sign In</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="label">Full Name *</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input"
                placeholder="Your full name"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="label">Email *</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="your@email.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label htmlFor="phone" className="label">Phone Number</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="input"
                placeholder="Optional"
                autoComplete="tel"
              />
            </div>

            <div>
              <label htmlFor="organisation" className="label">Organisation / Group</label>
              <input
                id="organisation"
                type="text"
                value={organisation}
                onChange={e => setOrganisation(e.target.value)}
                className="input"
                placeholder="e.g. Yoga Club, Parish Council"
              />
            </div>

            <div>
              <label htmlFor="notes" className="label">How will you use the hall?</label>
              <textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="input"
                rows={3}
                placeholder="Brief description of your regular activities or events…"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting…
                </span>
              ) : 'Submit Request'}
            </button>

            <p className="text-center text-sm text-gray-500 pt-2">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-800 font-medium">Sign in</Link>
            </p>
          </form>
        )}

        <p className="text-center text-xs text-gray-300 mt-6">v1.2.0</p>
      </div>
    </div>
  )
}
