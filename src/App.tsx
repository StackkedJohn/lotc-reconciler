import { useState, useEffect } from 'react'
import { PasswordGate } from './components/PasswordGate'
import { Dashboard } from './components/Dashboard'
import { MergeView } from './components/MergeView'
import { setPassword } from './lib/api'
import type { NeonAccount, Child, DuplicatePair } from './lib/types'

export default function App() {
  const [userName, setUserName] = useState<string | null>(null)
  const [selectedPair, setSelectedPair] = useState<{
    pair: DuplicatePair<NeonAccount | Child>
    entityType: 'neon_account' | 'child'
  } | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('reconciler_auth')
    const name = sessionStorage.getItem('reconciler_name')
    const pwd = sessionStorage.getItem('reconciler_password')
    if (stored === 'true' && name && pwd) {
      setPassword(pwd)
      setUserName(name)
    }
  }, [])

  if (!userName) {
    return <PasswordGate onAuthenticated={setUserName} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">LOTC Reconciler</h1>
          <p className="text-xs text-gray-500">Logged in as {userName}</p>
        </div>
        <button onClick={() => { sessionStorage.clear(); setUserName(null) }}
          className="text-sm text-gray-500 hover:text-gray-700">
          Sign out
        </button>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        {selectedPair ? (
          <MergeView
            pair={selectedPair.pair}
            entityType={selectedPair.entityType}
            userName={userName}
            onComplete={() => setSelectedPair(null)}
            onBack={() => setSelectedPair(null)}
          />
        ) : (
          <Dashboard
            userName={userName}
            onSelectPair={(pair, entityType) => setSelectedPair({ pair, entityType })}
          />
        )}
      </main>
    </div>
  )
}
