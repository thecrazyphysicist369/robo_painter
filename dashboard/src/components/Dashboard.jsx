import { useMemo, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Activity, Cpu } from 'lucide-react'
import { SerialConnector } from './SerialConnector'
import { MotorCard } from './MotorCard'
import { RoboticArm } from './RoboticArm'
import { forwardKinematics } from '../utils/forwardKinematics'
import { useSerial } from '../hooks/useSerial'

const MOTORS = [
  { key: 'shoulder', name: 'M1 - Shoulder' },
  { key: 'elbow', name: 'M2 - Elbow' },
  { key: 'wristRotation', name: 'M3 - Wrist Rotation' },
  { key: 'wristPitch', name: 'M4 - Wrist Pitch' },
  { key: 'gripper', name: 'M5 - Gripper' },
]

const RAD2DEG = 180 / Math.PI

export function Dashboard() {
  const {
    isConnected,
    angles,
    angularVelocities,
    logLines,
    error,
    connect,
    disconnect,
    sparklineHistory,
  } = useSerial()

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

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar - Kinematics */}
        <aside className="w-56 flex-shrink-0 border-r border-orange-500/30 p-4 flex flex-col gap-4" style={{ background: 'rgba(20,20,20,0.9)' }}>
          <div className="text-orange-500 font-semibold text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Kinematics
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-white/50 text-xs uppercase tracking-wider mb-0.5">End Effector (X, Y, Z)</div>
              <div className="text-orange-400 font-mono">
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
        </aside>

        {/* Center - Three.js Canvas */}
        <main className="flex-1 min-w-0 relative" style={{ minHeight: 300, background: '#000' }}>
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
              <OrbitControls makeDefault minDistance={1} maxDistance={8} enablePan />
            </Canvas>
          </Suspense>
        </main>

        {/* Right Sidebar - Motor Data */}
        <aside className="w-64 flex-shrink-0 border-l border-orange-500/30 p-4 flex flex-col gap-3 overflow-auto" style={{ background: 'rgba(20,20,20,0.9)' }}>
          <div className="text-orange-500 font-semibold text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            Motor Data
          </div>
          {MOTORS.map(({ key, name }) => (
            <MotorCard
              key={key}
              name={name}
              angle={angles[key]}
              velocity={angularVelocities[key]}
              sparklineData={sparklineHistory[key]}
            />
          ))}
        </aside>
      </div>

      {/* Footer - Terminal Log */}
      <footer className="flex-shrink-0 h-32 border-t border-orange-500/30 bg-black overflow-hidden flex flex-col">
        <div className="px-3 py-1.5 border-b border-orange-500/20 text-orange-500/80 text-xs font-mono">
          Serial log (raw)
        </div>
        <div className="flex-1 overflow-auto p-2 font-mono text-xs text-green-400/90 bg-black/80">
          {logLines.length === 0 && (
            <span className="text-white/40">Connect serial to see Arduino output…</span>
          )}
          {logLines.map((line, i) => (
            <div key={i} className="leading-tight truncate">
              {line}
            </div>
          ))}
        </div>
      </footer>
    </div>
  )
}
