import { useState } from 'react'
import { Cable, Wifi } from 'lucide-react'

export function SerialConnector({ isConnected, error, onConnect, onDisconnect }) {
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      await onConnect()
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-red-400 text-xs font-mono max-w-[180px] truncate" title={error}>
          {error}
        </span>
      )}
      {isConnected ? (
        <button
          onClick={onDisconnect}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-orange-500/50 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 font-mono text-sm transition-colors"
        >
          <Cable className="w-4 h-4" />
          Disconnect
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-orange-500/50 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 disabled:opacity-50 font-mono text-sm transition-colors"
        >
          <Wifi className="w-4 h-4" />
          {connecting ? 'Connecting…' : 'Connect Serial'}
        </button>
      )}
    </div>
  )
}
