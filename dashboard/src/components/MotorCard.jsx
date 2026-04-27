import { useMemo } from 'react'
import { RotateCcw, RotateCw } from 'lucide-react'

export function MotorCard({ name, angle, velocity, sparklineData, onJog, isConnected }) {
  const path = useMemo(() => {
    if (!sparklineData?.length) return ''
    const min = Math.min(...sparklineData)
    const max = Math.max(...sparklineData) || 1
    const range = max - min || 1
    const w = 120
    const h = 24
    const points = sparklineData.map((v, i) => {
      const x = (i / (sparklineData.length - 1 || 1)) * w
      const y = h - ((v - min) / range) * (h - 2) - 1
      return `${x},${y}`
    })
    return points.length ? `M ${points.join(' L ')}` : ''
  }, [sparklineData])

  const safeAngle = typeof angle === 'number' && !Number.isNaN(angle) ? angle : 0
  const safeVel = typeof velocity === 'number' && !Number.isNaN(velocity) ? velocity : 0

  return (
    <div className="rounded-lg border border-orange-500/30 bg-black/60 p-3 font-mono">
      <div className="flex items-center justify-between mb-1">
        <div className="text-orange-500 font-semibold text-sm">{name}</div>
        {onJog && (
          <div className="flex items-center gap-1">
            <button
              onPointerDown={(e) => { e.stopPropagation(); onJog(-5) }}
              disabled={!isConnected}
              className="p-1 rounded border border-white/10 bg-white/5 text-white/60 hover:bg-orange-500/20 hover:text-orange-400 hover:border-orange-500/30 active:scale-90 active:bg-orange-500/40 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              title="Rotate -5°"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); onJog(5) }}
              disabled={!isConnected}
              className="p-1 rounded border border-white/10 bg-white/5 text-white/60 hover:bg-orange-500/20 hover:text-orange-400 hover:border-orange-500/30 active:scale-90 active:bg-orange-500/40 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              title="Rotate +5°"
            >
              <RotateCw className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <div className="flex justify-between text-white/90 text-xs mb-1">
        <span>Angle: <span className="text-orange-400">{safeAngle.toFixed(1)}°</span></span>
        <span>ω: <span className="text-orange-400">{safeVel.toFixed(1)} deg/s</span></span>
      </div>
      <div className="h-6 w-full rounded bg-white/5 overflow-hidden">
        {path && (
          <svg width="100%" height="24" viewBox="0 0 120 24" preserveAspectRatio="none" className="text-orange-500">
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  )
}
