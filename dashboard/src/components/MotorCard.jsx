import { useMemo } from 'react'

export function MotorCard({ name, angle, velocity, sparklineData }) {
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
      <div className="text-orange-500 font-semibold text-sm mb-1">{name}</div>
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
