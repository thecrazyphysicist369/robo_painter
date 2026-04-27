import { useMemo, useRef, Suspense, useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Activity, Cpu, GripVertical, Square, Database, Trash2, Zap, ChevronDown, ChevronUp, Terminal, ScrollText, MapPin } from 'lucide-react'
import { SerialConnector } from './SerialConnector'
import { MotorCard } from './MotorCard'
import { RoboticArm } from './RoboticArm'
import { XboxControllerVisual } from './XboxControllerVisual'
import { WorkspaceVisualizer } from './WorkspaceVisualizer'
import { forwardKinematics } from '../utils/forwardKinematics'
import { useSerial } from '../hooks/useSerial'
import { useCalibration } from '../hooks/useCalibration'

const MOTORS = [
  { key: 'shoulder', name: 'M1 - Shoulder' },
  { key: 'elbow', name: 'M2 - Elbow' },
  { key: 'wristRotation', name: 'M3 - Wrist Rotation' },
  { key: 'wristPitch', name: 'M4 - Wrist Pitch' },
  { key: 'gripper', name: 'M5 - Gripper' },
]

const RAD2DEG = 180 / Math.PI
const MIN_SIDEBAR = 180
const MAX_LEFT = 420
const MAX_RIGHT = 420
const DEFAULT_LEFT = 224
const DEFAULT_RIGHT = 256

const MIN_FOOTER = 32
const MAX_FOOTER = 420
const DEFAULT_FOOTER = 170

const LOG_TABS = [
  { id: 'serial', label: 'Serial', icon: Terminal },
  { id: 'calibration', label: 'Calibration', icon: ScrollText },
  { id: 'waypoint', label: 'Waypoints', icon: MapPin },
]

const CONTROL_MODES = [
  { id: 'fk_motor', label: 'Mode 1: FK Per-Motor' },
  { id: 'fk_head', label: 'Mode 2: FK Head (Jog)' },
  { id: 'ik_reach', label: 'Mode 3: IK Reachable' },
  { id: 'ik_dex', label: 'Mode 4: IK Dexterous' }
]

function logColor(type) {
  if (type === 'success') return 'text-emerald-400/90'
  if (type === 'fail') return 'text-red-400/90'
  if (type === 'warn') return 'text-yellow-400/90'
  if (type === 'info') return 'text-blue-400/90'
  if (type === 'attempt') return 'text-white/40'
  return 'text-white/60'
}

export function Dashboard() {
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT)
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT)
  const [footerHeight, setFooterHeight] = useState(DEFAULT_FOOTER)
  const [footerCollapsed, setFooterCollapsed] = useState(false)
  const [activeLogTab, setActiveLogTab] = useState('serial')
  const [resizingLeft, setResizingLeft] = useState(false)
  const [resizingRight, setResizingRight] = useState(false)
  const [resizingFooter, setResizingFooter] = useState(false)
  const [activeMode, setActiveMode] = useState('fk_motor')
  const [waypoints, setWaypoints] = useState([])
  const [isExecutingWaypoints, setIsExecutingWaypoints] = useState(false)
  const [activeWaypointIndex, setActiveWaypointIndex] = useState(-1)
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(-1)
  const [waypointLogs, setWaypointLogs] = useState([])
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  const [numSamples, setNumSamples] = useState(100)
  const logEndRef = useRef(null)
  const footerHeightBeforeCollapse = useRef(DEFAULT_FOOTER)

  const {
    isConnected,
    angles,
    angularVelocities,
    logLines,
    error,
    connect,
    disconnect,
    sparklineHistory,
    controller,
    sendAngles,
    sendAnglesAndWait,
    sendHome,
    queryPosition,
    writeRaw,
    servoMode,
    pcaAvailable,
    switchServoMode,
  } = useSerial()

  const {
    calStatus, calProgress, calLogs,
    startMathGeneration, startPhysicalCalibration, stopCalibration, clearLogs,
  } = useCalibration({ sendAnglesAndWait, sendHome, isConnected })

  const appendWaypointLog = useCallback((type, message) => {
    setWaypointLogs((prev) => {
      const next = [...prev, { type, message, timestamp: Date.now() }]
      return next.length > 500 ? next.slice(-500) : next
    })
  }, [])

  const addWaypoint = useCallback((point) => {
    setWaypoints((prev) => {
      const next = [...prev, point]
      const idx = next.length - 1
      setSelectedWaypointIndex(idx)
      appendWaypointLog('info', `Added waypoint #${idx + 1} at (${point[0].toFixed(3)}, ${point[1].toFixed(3)}, ${point[2].toFixed(3)})`)
      return next
    })
  }, [appendWaypointLog])

  const selectWaypoint = useCallback((index) => {
    setSelectedWaypointIndex(index)
    const wp = waypoints[index]
    if (wp) {
      appendWaypointLog('attempt', `Selected waypoint #${index + 1} at (${wp[0].toFixed(3)}, ${wp[1].toFixed(3)}, ${wp[2].toFixed(3)})`)
    }
  }, [waypoints, appendWaypointLog])

  const deleteWaypoint = useCallback((index) => {
    setWaypoints((prev) => prev.filter((_, i) => i !== index))
    if (selectedWaypointIndex === index) setSelectedWaypointIndex(-1)
    else if (selectedWaypointIndex > index) setSelectedWaypointIndex((v) => v - 1)
    appendWaypointLog('warn', `Deleted waypoint #${index + 1}`)
  }, [appendWaypointLog, selectedWaypointIndex])

  const commitWaypointMove = useCallback((index, point) => {
    setWaypoints((prev) => prev.map((wp, i) => (i === index ? point : wp)))
    appendWaypointLog('success', `Moved waypoint #${index + 1} to (${point[0].toFixed(3)}, ${point[1].toFixed(3)}, ${point[2].toFixed(3)})`)
  }, [appendWaypointLog])

  const clearWaypoints = useCallback(() => {
    setWaypoints([])
    setSelectedWaypointIndex(-1)
    setActiveWaypointIndex(-1)
    setIsExecutingWaypoints(false)
    appendWaypointLog('warn', 'Cleared all waypoints')
  }, [appendWaypointLog])

  const solveReachableIK = useCallback((point) => {
    const [x, y, z] = point
    const L1 = 0.9
    const L2 = 0.7
    const radial = Math.sqrt(y * y + z * z)
    const clampedR = Math.max(0.05, Math.min(L1 + L2 - 1e-3, radial))
    const cosElbow = Math.max(-1, Math.min(1, (clampedR * clampedR - L1 * L1 - L2 * L2) / (2 * L1 * L2)))
    const elbow = Math.acos(cosElbow)
    const shoulder = Math.atan2(z, y) - Math.atan2(L2 * Math.sin(elbow), L1 + L2 * Math.cos(elbow))

    const shoulderDeg = Math.max(0, Math.min(180, (shoulder * RAD2DEG) + 90))
    const elbowDeg = Math.max(0, Math.min(180, (elbow * RAD2DEG) + 90))

    const wristPitchDeg = 90
    const wristRollDeg = Math.max(0, Math.min(180, 90 + x * 12))
    const gripperDeg = 90
    return [shoulderDeg, elbowDeg, wristPitchDeg, wristRollDeg, gripperDeg]
  }, [])

  const jogAnglesRef = useRef({ shoulder: 90, elbow: 90, wristRotation: 90, wristPitch: 90, gripper: 90 })

  const jogMotor = useCallback(async (motorKey, delta) => {
    const prev = jogAnglesRef.current
    const current = Math.round(prev[motorKey] ?? 90)
    const next = Math.max(0, Math.min(180, current + delta))
    const updated = { ...prev, [motorKey]: next }
    jogAnglesRef.current = updated
    const ordered = [updated.shoulder, updated.elbow, updated.wristPitch, updated.wristRotation, updated.gripper]
    const ok = await sendAngles(ordered)
    if (!ok) console.warn('[Jog] sendAngles returned false — writer may be null')
  }, [sendAngles])

  const resetArm = useCallback(async () => {
    const home = { shoulder: 90, elbow: 90, wristRotation: 90, wristPitch: 90, gripper: 90 }
    jogAnglesRef.current = home
    await sendAngles([90, 90, 90, 90, 90])
  }, [sendAngles])

  const testConnection = useCallback(async () => {
    if (!isConnected) return
    setActiveLogTab('serial')
    if (footerCollapsed) setFooterCollapsed(false)
    // Step 1: raw write test
    const wrote = await writeRaw('Q\n')
    if (!wrote) {
      console.error('[Test] writeRaw failed')
      return
    }
    // Step 2: wait for POS: response
    const pos = await queryPosition(3000)
    if (pos) {
      console.log('[Test] Arduino responded with POS:', pos)
    } else {
      console.warn('[Test] No POS: response — Arduino may not be parsing commands')
    }
  }, [isConnected, writeRaw, queryPosition, footerCollapsed])

  const executeWaypoints = useCallback(async () => {
    if (waypoints.length === 0 || isExecutingWaypoints) return
    setIsExecutingWaypoints(true)
    appendWaypointLog('info', `Starting waypoint run for ${waypoints.length} point(s)`)
    for (let i = 0; i < waypoints.length; i += 1) {
      setActiveWaypointIndex(i)
      const anglesCommand = solveReachableIK(waypoints[i])
      appendWaypointLog(
        'attempt',
        `WP #${i + 1}: IK -> S:${anglesCommand[0].toFixed(1)} E:${anglesCommand[1].toFixed(1)} WR:${anglesCommand[3].toFixed(1)} WP:${anglesCommand[2].toFixed(1)} G:${anglesCommand[4].toFixed(1)}`
      )
      if (isConnected) await sendAngles(anglesCommand)
      else appendWaypointLog('warn', 'Serial disconnected: calculated motion only (not sent)')
      await new Promise((resolve) => setTimeout(resolve, 650))
    }
    appendWaypointLog('success', 'Waypoint execution complete')
    setActiveWaypointIndex(-1)
    setIsExecutingWaypoints(false)
  }, [waypoints, isExecutingWaypoints, solveReachableIK, isConnected, sendAngles, appendWaypointLog])

  useEffect(() => {
    if (activeMode !== 'ik_reach') {
      setIsExecutingWaypoints(false)
      setActiveWaypointIndex(-1)
      setSelectedWaypointIndex(-1)
      setOrbitEnabled(true)
    }
  }, [activeMode])

  // --- Unified resize handling ---
  const handleMouseMove = useCallback(
    (e) => {
      if (resizingLeft) setLeftWidth((w) => Math.min(MAX_LEFT, Math.max(MIN_SIDEBAR, w + e.movementX)))
      if (resizingRight) setRightWidth((w) => Math.min(MAX_RIGHT, Math.max(MIN_SIDEBAR, w - e.movementX)))
      if (resizingFooter) setFooterHeight((h) => Math.min(MAX_FOOTER, Math.max(MIN_FOOTER, h - e.movementY)))
    },
    [resizingLeft, resizingRight, resizingFooter]
  )
  const handleMouseUp = useCallback(() => {
    setResizingLeft(false)
    setResizingRight(false)
    setResizingFooter(false)
  }, [])

  useEffect(() => {
    if (!resizingLeft && !resizingRight && !resizingFooter) return
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = resizingFooter ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizingLeft, resizingRight, resizingFooter, handleMouseMove, handleMouseUp])

  const toggleFooterCollapse = useCallback(() => {
    setFooterCollapsed((prev) => {
      if (!prev) {
        footerHeightBeforeCollapse.current = footerHeight
        return true
      }
      setFooterHeight(footerHeightBeforeCollapse.current)
      return false
    })
  }, [footerHeight])

  // Auto-scroll log panels
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines, calLogs, waypointLogs, activeLogTab])

  const kinematics = useMemo(() => {
    try {
      return forwardKinematics(
        angles.shoulder,
        angles.elbow,
        angles.wristRotation,
        angles.wristPitch,
        angles.gripper
      )
    } catch (e) {
      return { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 }
    }
  }, [angles])

  const clearActiveLog = useCallback(() => {
    if (activeLogTab === 'waypoint') setWaypointLogs([])
    else if (activeLogTab === 'calibration') clearLogs()
  }, [activeLogTab, clearLogs])

  const activeLogCount = activeLogTab === 'serial' ? logLines.length
    : activeLogTab === 'calibration' ? calLogs.length
    : waypointLogs.length

  const resolvedFooterHeight = footerCollapsed ? MIN_FOOTER : footerHeight

  return (
    <div className="h-screen flex flex-col text-white font-mono" style={{ background: '#0a0a0a', minHeight: '100vh' }}>
      {/* Header */}
      <header className="flex-shrink-0 h-12 border-b border-orange-500/30 flex items-center justify-between px-4" style={{ background: '#141414' }}>
        <div className="flex items-center gap-3">
          <Cpu className="w-6 h-6 text-orange-500" />
          <span className="font-semibold text-white">Robotic Arm Control Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-white/70 text-sm">System Status:</span>
            <span className={`flex items-center gap-1.5 text-sm ${isConnected ? 'text-emerald-400' : 'text-white/50'}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse-heartbeat' : 'bg-white/40'}`} />
              {isConnected ? 'Online' : 'Offline'}
            </span>
          </div>
          <SerialConnector isConnected={isConnected} error={error} onConnect={connect} onDisconnect={disconnect} />
        </div>
      </header>

      {/* Middle row: sidebar | canvas | sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar */}
        <aside
          className="flex-shrink-0 border-r border-orange-500/30 p-4 flex flex-col gap-4 overflow-auto"
          style={{ width: leftWidth, minWidth: MIN_SIDEBAR, maxWidth: MAX_LEFT, background: 'rgba(20,20,20,0.9)' }}
        >
          <div className="flex flex-col gap-2 border-b border-orange-500/30 pb-4">
            <div className="text-orange-500 font-semibold text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Control Mode
            </div>
            <div className="flex flex-col gap-1.5">
              {CONTROL_MODES.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setActiveMode(mode.id)}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold transition-colors ${
                    activeMode === mode.id 
                      ? 'bg-orange-500 text-white' 
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {activeMode === 'ik_reach' && (
            <div className="flex flex-col gap-2 border-b border-orange-500/30 pb-4">
              <div className="text-orange-500 font-semibold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4" />
                IK Waypoints
              </div>
              <div className="text-[10px] text-white/60 leading-relaxed">
                Click on the orange workspace hull to place waypoints.
              </div>
              <div className="text-[10px] text-white/50">
                Points: <span className="text-orange-400">{waypoints.length}</span>
                {activeWaypointIndex >= 0 && (
                  <span className="ml-2 text-emerald-400">Running #{activeWaypointIndex + 1}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={executeWaypoints}
                  disabled={waypoints.length === 0 || isExecutingWaypoints}
                  className="flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-colors bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isExecutingWaypoints ? 'Running...' : 'Go Through Points'}
                </button>
                <button
                  onClick={clearWaypoints}
                  disabled={waypoints.length === 0 || isExecutingWaypoints}
                  className="px-2 py-1.5 rounded text-xs font-semibold transition-colors bg-white/10 text-white/70 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 border-b border-orange-500/30 pb-4">
            <div className="text-orange-500 font-semibold text-sm flex items-center gap-2">
              <Database className="w-4 h-4" />
              Workspace Calibration
            </div>
            
            {calStatus === 'idle' && (
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-[10px] text-white/50 uppercase">Samples</label>
                  <input
                    type="number"
                    value={numSamples}
                    onChange={e => setNumSamples(Math.max(1, parseInt(e.target.value) || 10))}
                    className="w-full mt-0.5 px-2 py-1 bg-black/50 border border-white/10 rounded text-xs text-white focus:border-orange-500/50 outline-none"
                  />
                </div>
                <button
                  onClick={() => startPhysicalCalibration(numSamples)}
                  disabled={!isConnected}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-semibold transition-colors bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {isConnected ? 'Calibrate R-Workspace (Physical)' : 'Connect Serial First'}
                </button>
                <button
                  onClick={() => startMathGeneration(numSamples > 1000 ? numSamples : 50000)}
                  disabled={calStatus === 'running'}
                  className="text-left px-3 py-1.5 rounded text-[10px] font-semibold transition-colors bg-white/5 text-white/50 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Math-only generation (no Arduino)
                </button>
              </div>
            )}

            {calStatus === 'running' && (
              <div className="bg-white/5 border border-white/10 p-2 rounded flex flex-col gap-2">
                <div className="text-xs font-semibold text-white/80 flex justify-between">
                  <span>Calibrating...</span>
                  <span className="text-orange-400">{calProgress}%</span>
                </div>
                <div className="h-1.5 bg-black rounded overflow-hidden">
                  <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${calProgress}%` }} />
                </div>
                <div className="flex justify-center gap-3 mt-1">
                  <button onClick={stopCalibration} className="p-1.5 hover:bg-white/10 rounded text-red-400/80 hover:text-red-400" title="Stop calibration"><Square className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>

          <div className="text-orange-500 font-semibold text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Kinematics
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-white/50 text-xs uppercase tracking-wider mb-0.5">End Effector (X, Y, Z)</div>
              <div className="text-orange-400 font-mono text-xs break-all">
                X: {kinematics.x.toFixed(3)} &nbsp; Y: {kinematics.y.toFixed(3)} &nbsp; Z: {kinematics.z.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-white/50 text-xs uppercase tracking-wider mb-0.5">Orientation (Roll / Pitch / Yaw)</div>
              <div className="text-orange-400 font-mono text-xs">
                R: {(kinematics.roll * RAD2DEG).toFixed(1)}° &nbsp; P: {(kinematics.pitch * RAD2DEG).toFixed(1)}° &nbsp; Y: {(kinematics.yaw * RAD2DEG).toFixed(1)}°
              </div>
            </div>
          </div>
          <XboxControllerVisual controller={controller} />
        </aside>

        {/* Resize handle - left */}
        <div
          role="separator"
          aria-label="Resize left panel"
          className="flex-shrink-0 w-1.5 flex items-center justify-center cursor-col-resize hover:bg-orange-500/30 transition-colors group"
          style={{ background: resizingLeft ? 'rgba(249,115,22,0.5)' : 'transparent' }}
          onMouseDown={(e) => e.button === 0 && setResizingLeft(true)}
        >
          <GripVertical className="w-3 h-8 text-white/40 group-hover:text-orange-500" />
        </div>

        {/* Center - Three.js Canvas */}
        <main className="flex-1 min-w-0 relative" style={{ minHeight: 200, background: '#000' }}>
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center" style={{ background: '#0a0a0a', color: '#f97316' }}>Loading 3D…</div>}>
            <Canvas
              shadows
              camera={{ position: [2.5, 1.5, 2], fov: 45 }}
              gl={{ antialias: true, alpha: false }}
              style={{ display: 'block', width: '100%', height: '100%' }}
            >
              <color attach="background" args={['#0a0a0a']} />
              <ambientLight intensity={0.4} />
              <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
              <directionalLight position={[-3, 2, 2]} intensity={0.3} />
              <RoboticArm angles={angles} />
              <WorkspaceVisualizer
                activeMode={activeMode}
                waypoints={waypoints}
                onWaypointAdd={activeMode === 'ik_reach' ? addWaypoint : undefined}
                activeWaypointIndex={activeWaypointIndex}
                selectedWaypointIndex={selectedWaypointIndex}
                onWaypointSelect={selectWaypoint}
                onWaypointDelete={deleteWaypoint}
                onWaypointMoveEnd={commitWaypointMove}
                onTransformDragging={(dragging) => setOrbitEnabled(!dragging)}
              />
              <OrbitControls makeDefault minDistance={1} maxDistance={8} enablePan enabled={orbitEnabled} />
            </Canvas>
          </Suspense>
        </main>

        {/* Resize handle - right */}
        <div
          role="separator"
          aria-label="Resize right panel"
          className="flex-shrink-0 w-1.5 flex items-center justify-center cursor-col-resize hover:bg-orange-500/30 transition-colors group"
          style={{ background: resizingRight ? 'rgba(249,115,22,0.5)' : 'transparent' }}
          onMouseDown={(e) => e.button === 0 && setResizingRight(true)}
        >
          <GripVertical className="w-3 h-8 text-white/40 group-hover:text-orange-500" />
        </div>

        {/* Right Sidebar - Motor Data only (logs moved to bottom) */}
        <aside
          className="flex-shrink-0 border-l border-orange-500/30 flex flex-col overflow-auto"
          style={{ width: rightWidth, minWidth: MIN_SIDEBAR, maxWidth: MAX_RIGHT, background: 'rgba(20,20,20,0.9)' }}
        >
          <div className="p-4 flex flex-col gap-3">
            <div className="text-orange-500 font-semibold text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Motor Data
              <button
                onClick={testConnection}
                disabled={!isConnected}
                className="ml-auto px-2 py-0.5 rounded text-[10px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/25 active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              >
                Test TX
              </button>
              <button
                onClick={resetArm}
                disabled={!isConnected}
                className="px-2 py-0.5 rounded text-[10px] font-semibold border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/25 active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              >
                Reset Arm
              </button>
            </div>
            {/* PWM / I2C toggle */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-white/40">Driver:</span>
              <div className="flex rounded overflow-hidden border border-white/10 text-[10px] font-semibold">
                <button
                  onClick={() => switchServoMode('PWM')}
                  disabled={!isConnected}
                  className={`px-2 py-0.5 transition-all ${
                    servoMode === 'PWM'
                      ? 'bg-orange-500/30 text-orange-300 border-r border-orange-500/30'
                      : 'bg-white/5 text-white/40 border-r border-white/10 hover:bg-white/10'
                  } disabled:opacity-25 disabled:cursor-not-allowed`}
                >
                  PWM
                </button>
                <button
                  onClick={() => switchServoMode('I2C')}
                  disabled={!isConnected || !pcaAvailable}
                  title={!pcaAvailable ? 'PCA9685 not detected on Arduino' : 'Switch to PCA9685 I2C driver'}
                  className={`px-2 py-0.5 transition-all ${
                    servoMode === 'I2C'
                      ? 'bg-cyan-500/30 text-cyan-300'
                      : 'bg-white/5 text-white/40 hover:bg-white/10'
                  } disabled:opacity-25 disabled:cursor-not-allowed`}
                >
                  I2C
                </button>
              </div>
              {servoMode && (
                <span className={`text-[9px] ${servoMode === 'I2C' ? 'text-cyan-400/60' : 'text-orange-400/60'}`}>
                  {servoMode === 'I2C' ? 'PCA9685' : 'Direct'}
                </span>
              )}
              {!pcaAvailable && isConnected && (
                <span className="text-[9px] text-red-400/60">No PCA9685</span>
              )}
            </div>
            {MOTORS.map(({ key, name }) => (
              <MotorCard
                key={key}
                name={name}
                angle={angles[key]}
                velocity={angularVelocities[key]}
                sparklineData={sparklineHistory[key]}
                isConnected={isConnected}
                onJog={(delta) => jogMotor(key, delta)}
              />
            ))}
          </div>
        </aside>
      </div>

      {/* Resize handle - footer (horizontal bar) */}
      {!footerCollapsed && (
        <div
          role="separator"
          aria-label="Resize log panel"
          className="flex-shrink-0 h-1 cursor-row-resize hover:bg-orange-500/40 transition-colors"
          style={{ background: resizingFooter ? 'rgba(249,115,22,0.5)' : 'transparent' }}
          onMouseDown={(e) => e.button === 0 && setResizingFooter(true)}
        />
      )}

      {/* Footer - Tabbed Log Panel */}
      <footer
        className="flex-shrink-0 border-t border-orange-500/30 bg-black flex flex-col overflow-hidden"
        style={{ height: resolvedFooterHeight }}
      >
        {/* Tab bar */}
        <div className="flex items-center h-8 min-h-[2rem] border-b border-orange-500/20" style={{ background: '#111' }}>
          {LOG_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeLogTab === tab.id
            const count = tab.id === 'serial' ? logLines.length
              : tab.id === 'calibration' ? calLogs.length
              : waypointLogs.length
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveLogTab(tab.id); if (footerCollapsed) setFooterCollapsed(false) }}
                className={`relative flex items-center gap-1.5 px-3.5 h-full text-[11px] font-semibold transition-colors ${
                  isActive
                    ? 'text-orange-400 bg-black/80'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1 px-1 rounded text-[9px] leading-tight ${
                    isActive ? 'bg-orange-500/20 text-orange-400' : 'bg-white/10 text-white/40'
                  }`}>
                    {count > 999 ? '999+' : count}
                  </span>
                )}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />}
              </button>
            )
          })}

          <div className="ml-auto flex items-center gap-1 pr-2">
            {activeLogTab !== 'serial' && (
              <button
                onClick={clearActiveLog}
                className="p-1 text-white/30 hover:text-white/60 rounded hover:bg-white/10 transition-colors"
                title="Clear log"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={toggleFooterCollapse}
              className="p-1 text-white/30 hover:text-white/60 rounded hover:bg-white/10 transition-colors"
              title={footerCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {footerCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Log content */}
        {!footerCollapsed && (
          <div className="flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed bg-black/80">
            {/* Serial tab */}
            {activeLogTab === 'serial' && (
              <>
                {logLines.length === 0 && (
                  <span className="text-white/30">Connect serial to see Arduino output...</span>
                )}
                {logLines.map((line, i) => (
                  <div key={i} className="text-green-400/90 leading-tight truncate py-px">{line}</div>
                ))}
              </>
            )}

            {/* Calibration tab */}
            {activeLogTab === 'calibration' && (
              <>
                {calLogs.length === 0 && (
                  <span className="text-white/30">Calibration logs will appear here...</span>
                )}
                {calLogs.map((log, i) => (
                  <div key={i} className={`${logColor(log.type)} leading-tight py-px`}>
                    {log.message}
                    {log.reachability !== undefined && (
                      <span className="text-orange-400 ml-2">[reach: {log.reachability}%]</span>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Waypoint tab */}
            {activeLogTab === 'waypoint' && (
              <>
                {waypointLogs.length === 0 && (
                  <span className="text-white/30">Waypoint logs will appear here...</span>
                )}
                {waypointLogs.map((log, i) => (
                  <div key={i} className={`${logColor(log.type)} leading-tight py-px`}>{log.message}</div>
                ))}
              </>
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </footer>
    </div>
  )
}
