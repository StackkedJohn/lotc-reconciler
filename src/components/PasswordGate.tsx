import { useState } from 'react'
import { validatePassword, setPassword } from '../lib/api'

interface Props {
  onAuthenticated: (name: string) => void
}

export function PasswordGate({ onAuthenticated }: Props) {
  const [password, setPasswordInput] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || !name.trim()) {
      setError('Both fields are required')
      return
    }
    setLoading(true)
    setError('')
    const valid = await validatePassword(password)
    if (valid) {
      setPassword(password)
      sessionStorage.setItem('reconciler_name', name.trim())
      sessionStorage.setItem('reconciler_password', password)
      sessionStorage.setItem('reconciler_auth', 'true')
      onAuthenticated(name.trim())
    } else {
      setError('Invalid password')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">LOTC Reconciler</h1>
        <p className="text-sm text-gray-500 mb-6">Duplicate contact & child merge tool</p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 mb-4 text-sm"
          placeholder="e.g. Jessica"
        />

        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPasswordInput(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 mb-4 text-sm"
          placeholder="Enter shared password"
        />

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-900 text-white py-2 rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Enter'}
        </button>
      </form>
    </div>
  )
}
