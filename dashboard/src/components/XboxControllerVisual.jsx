/**
 * Xbox controller live view: white/orange, animated stick arrows and button highlights.
 * controller: { leftStick: {x,y}, rightStick: {x,y}, lt, rt, a, b, x, y } (sticks -100..100, triggers 0..100)
 */
export function XboxControllerVisual({ controller }) {
  const ls = controller?.leftStick ?? { x: 0, y: 0 }
  const rs = controller?.rightStick ?? { x: 0, y: 0 }
  const lt = Math.max(0, Math.min(100, controller?.lt ?? 0))
  const rt = Math.max(0, Math.min(100, controller?.rt ?? 0))
  const a = controller?.a ? 1 : 0
  const b = controller?.b ? 1 : 0
  const x = controller?.x ? 1 : 0
  const y = controller?.y ? 1 : 0

  const stickRadius = 24
  const leftX = 70
  const leftY = 100
  const rightX = 170
  const rightY = 85
  const stickOffset = (v, max) => Math.max(-1, Math.min(1, v / (max || 1))) * (stickRadius * 0.7)

  const lsDx = stickOffset(ls.x, 100)
  const lsDy = -stickOffset(ls.y, 100)
  const rsDx = stickOffset(rs.x, 100)
  const rsDy = -stickOffset(rs.y, 100)

  const orange = '#f97316'
  const white = '#ffffff'
  const inactive = 'rgba(255,255,255,0.25)'

  return (
    <div className="flex flex-col gap-2 w-full overflow-hidden">
      <div className="text-orange-500 font-semibold text-xs uppercase tracking-wider">Xbox controller</div>
      <div className="flex justify-center">
        <svg
          viewBox="0 0 240 160"
          className="w-full max-w-[220px] h-auto select-none"
          style={{ color: white }}
        >
          {/* Controller body */}
          <ellipse cx="120" cy="90" rx="105" ry="55" fill="none" stroke={white} strokeWidth="3" />
          <ellipse cx="120" cy="90" rx="98" ry="48" fill="none" stroke={orange} strokeWidth="1" opacity={0.6} />

          {/* Left stick well */}
          <circle cx={leftX} cy={leftY} r={stickRadius + 4} fill="none" stroke={white} strokeWidth="2" />
          <circle cx={leftX} cy={leftY} r={stickRadius} fill="rgba(0,0,0,0.3)" stroke={white} strokeWidth="1" />
          <circle
            cx={leftX + lsDx}
            cy={leftY + lsDy}
            r={14}
            fill={Math.abs(ls.x) > 5 || Math.abs(ls.y) > 5 ? orange : white}
            stroke={orange}
            strokeWidth="2"
            style={{ transition: 'fill 0.05s, transform 0.05s' }}
          />
          {/* Left stick direction arrows */}
          {(Math.abs(ls.x) > 8 || Math.abs(ls.y) > 8) && (
            <g transform={`translate(${leftX + lsDx}, ${leftY + lsDy})`}>
              {ls.y < -8 && <path d="M0,-18 L-4,-8 L0,-6 L4,-8 Z" fill={orange} className="animate-pulse" style={{ animationDuration: '0.5s' }} />}
              {ls.y > 8 && <path d="M0,18 L-4,8 L0,6 L4,8 Z" fill={orange} className="animate-pulse" style={{ animationDuration: '0.5s' }} />}
              {ls.x < -8 && <path d="M-18,0 L-8,-4 L-6,0 L-8,4 Z" fill={orange} className="animate-pulse" style={{ animationDuration: '0.5s' }} />}
              {ls.x > 8 && <path d="M18,0 L8,-4 L6,0 L8,4 Z" fill={orange} className="animate-pulse" style={{ animationDuration: '0.5s' }} />}
            </g>
          )}

          {/* Right stick well */}
          <circle cx={rightX} cy={rightY} r={stickRadius - 2} fill="none" stroke={white} strokeWidth="2" />
          <circle cx={rightX} cy={rightY} r={stickRadius - 6} fill="rgba(0,0,0,0.3)" stroke={white} strokeWidth="1" />
          <circle
            cx={rightX + rsDx}
            cy={rightY + rsDy}
            r={10}
            fill={Math.abs(rs.x) > 5 || Math.abs(rs.y) > 5 ? orange : white}
            stroke={orange}
            strokeWidth="2"
            style={{ transition: 'fill 0.05s' }}
          />
          {(Math.abs(rs.x) > 8 || Math.abs(rs.y) > 8) && (
            <g transform={`translate(${rightX + rsDx}, ${rightY + rsDy})`}>
              {rs.y < -8 && <path d="M0,-12 L-3,-5 L0,-4 L3,-5 Z" fill={orange} className="animate-pulse" style={{ animationDuration: '0.5s' }} />}
              {rs.y > 8 && <path d="M0,12 L-3,5 L0,4 L3,5 Z" fill={orange} className="animate-pulse" style={{ animationDuration: '0.5s' }} />}
              {rs.x < -8 && <path d="M-12,0 L-5,-3 L-4,0 L-5,3 Z" fill={orange} className="animate-pulse" style={{ animationDuration: '0.5s' }} />}
              {rs.x > 8 && <path d="M12,0 L5,-3 L4,0 L5,3 Z" fill={orange} className="animate-pulse" style={{ animationDuration: '0.5s' }} />}
            </g>
          )}

          {/* LT */}
          <rect x="42" y="28" width="36" height="14" rx="4" fill="none" stroke={white} strokeWidth="2" />
          <rect x="44" y="30" width={32 * (lt / 100)} height="10" rx="3" fill={lt > 5 ? orange : inactive} style={{ transition: 'width 0.05s' }} />

          {/* RT - fill from right edge */}
          <rect x="162" y="28" width="36" height="14" rx="4" fill="none" stroke={white} strokeWidth="2" />
          <rect x={164 + 32 * (1 - rt / 100)} y="30" width={32 * (rt / 100)} height="10" rx="3" fill={rt > 5 ? orange : inactive} style={{ transition: 'width 0.05s' }} />

          {/* A */}
          <circle cx="205" cy="118" r="12" fill={a ? orange : inactive} stroke={white} strokeWidth="2" />
          <text x="205" y="122" textAnchor="middle" fontSize="12" fill={a ? white : white} fontWeight="bold">A</text>

          {/* B */}
          <circle cx="223" cy="100" r="12" fill={b ? orange : inactive} stroke={white} strokeWidth="2" />
          <text x="223" y="104" textAnchor="middle" fontSize="12" fill={b ? white : white} fontWeight="bold">B</text>

          {/* X */}
          <circle cx="187" cy="100" r="12" fill={x ? orange : inactive} stroke={white} strokeWidth="2" />
          <text x="187" y="104" textAnchor="middle" fontSize="12" fill={x ? white : white} fontWeight="bold">X</text>

          {/* Y */}
          <circle cx="205" cy="82" r="12" fill={y ? orange : inactive} stroke={white} strokeWidth="2" />
          <text x="205" y="86" textAnchor="middle" fontSize="12" fill={y ? white : white} fontWeight="bold">Y</text>
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-white/70">
        <span>L stick: {ls.x}, {ls.y}</span>
        <span>R stick: {rs.x}, {rs.y}</span>
        <span>LT: {lt}%</span>
        <span>RT: {rt}%</span>
      </div>
    </div>
  )
}
