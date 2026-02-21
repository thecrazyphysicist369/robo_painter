import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const LERP = 0.12

export function RoboticArm({ angles }) {
  const shoulderRef = useRef(null)
  const elbowRef = useRef(null)
  const wristRollRef = useRef(null)
  const wristPitchRef = useRef(null)
  const gripperLeftRef = useRef(null)
  const gripperRightRef = useRef(null)

  const s = angles?.shoulder ?? 90
  const e = angles?.elbow ?? 90
  const wr = angles?.wristRotation ?? 90
  const wp = angles?.wristPitch ?? 90
  const g = angles?.gripper ?? 90

  const lerpS = useRef(s)
  const lerpE = useRef(e)
  const lerpWR = useRef(wr)
  const lerpWP = useRef(wp)
  const lerpG = useRef(g)

  useFrame(() => {
    try {
      lerpS.current += (s - lerpS.current) * LERP
      lerpE.current += (e - lerpE.current) * LERP
      lerpWR.current += (wr - lerpWR.current) * LERP
      lerpWP.current += (wp - lerpWP.current) * LERP
      lerpG.current += (g - lerpG.current) * LERP

      const deg2rad = Math.PI / 180
      const shoulderRad = (lerpS.current - 90) * deg2rad
      const elbowRad = (lerpE.current - 90) * deg2rad
      const wristRollRad = (lerpWR.current - 90) * deg2rad
      const wristPitchRad = (lerpWP.current - 90) * deg2rad
      const gripperOpen = (lerpG.current - 90) / 90

      if (shoulderRef.current) shoulderRef.current.rotation.x = shoulderRad
      if (elbowRef.current) elbowRef.current.rotation.x = elbowRad
      if (wristRollRef.current) wristRollRef.current.rotation.z = wristRollRad
      if (wristPitchRef.current) wristPitchRef.current.rotation.x = wristPitchRad
      const jaw = Math.max(-0.5, Math.min(0.5, gripperOpen * 0.5))
      if (gripperLeftRef.current) gripperLeftRef.current.position.x = -0.15 - jaw * 0.1
      if (gripperRightRef.current) gripperRightRef.current.position.x = 0.15 + jaw * 0.1
    } catch (_) {
      // no-op so one bad frame doesn't break the loop
    }
  })

  return (
    <group position={[0, 0, 0]}>
      {/* Base (fixed) */}
      <mesh position={[0, 0, -0.2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.35, 0.4, 0.2, 24]} />
        <meshStandardMaterial color="#f97316" metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Shoulder: vertical pitch (rotation X) */}
      <group ref={shoulderRef} position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <mesh position={[0, 0, 0.15]} castShadow>
          <cylinderGeometry args={[0.12, 0.2, 0.3, 16]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.4, 0.35]} castShadow>
          <boxGeometry args={[0.12, 0.8, 0.1]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.7} />
        </mesh>

        {/* Elbow joint (pitch, rotation X) */}
        <group ref={elbowRef} position={[0, 0.8, 0.35]} rotation={[0, 0, 0]}>
          <mesh position={[0, 0, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 0.12, 16]} />
            <meshStandardMaterial color="#f97316" metalness={0.3} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.35, 0.1]} castShadow>
            <boxGeometry args={[0.1, 0.7, 0.08]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.7} />
          </mesh>

          {/* Wrist rotation (roll, rotation Z) */}
          <group ref={wristRollRef} position={[0, 0.7, 0.1]} rotation={[0, 0, 0]}>
            <mesh position={[0, 0, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.1, 0.08, 16]} />
              <meshStandardMaterial color="#f97316" metalness={0.3} roughness={0.6} />
            </mesh>
            <group ref={wristPitchRef} position={[0, 0, 0]} rotation={[0, 0, 0]}>
              <mesh position={[0, 0.08, 0.02]} castShadow>
                <boxGeometry args={[0.06, 0.08, 0.04]} />
                <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.7} />
              </mesh>
              <mesh ref={gripperLeftRef} position={[0, 0.16, 0.02]} castShadow>
                <boxGeometry args={[0.04, 0.12, 0.03]} />
                <meshStandardMaterial color="#f97316" metalness={0.3} roughness={0.6} />
              </mesh>
              <mesh ref={gripperRightRef} position={[0, 0.16, 0.02]} castShadow>
                <boxGeometry args={[0.04, 0.12, 0.03]} />
                <meshStandardMaterial color="#f97316" metalness={0.3} roughness={0.6} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
