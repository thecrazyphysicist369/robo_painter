/**
 * Forward kinematics for 5-DOF arm (fixed base).
 * Shoulder S (vertical pitch), Elbow E (pitch), Wrist Roll WR, Wrist Pitch WP, Gripper G.
 * Angles in degrees 0–180; 90° is neutral/center.
 * Returns { x, y, z, roll, pitch, yaw } in arbitrary units and radians.
 */

const DEG2RAD = Math.PI / 180
const L1 = 1.0  // shoulder to elbow
const L2 = 0.8  // elbow to wrist
const L3 = 0.3  // wrist to gripper tip (approximate)

export function forwardKinematics(shoulder, elbow, wristRotation, wristPitch, gripper) {
  // Map 0–180 to rad: 90° -> 0, 0° -> -90°, 180° -> 90°
  const s = (shoulder - 90) * DEG2RAD
  const e = (elbow - 90) * DEG2RAD
  const wr = (wristRotation - 90) * DEG2RAD
  const wp = (wristPitch - 90) * DEG2RAD

  // Wrist position in YZ plane (shoulder + elbow only)
  const y = L1 * Math.cos(s) + L2 * Math.cos(s + e)
  const z = L1 * Math.sin(s) + L2 * Math.sin(s + e)
  let x = 0

  // Wrist roll rotates the end-effector frame around the arm axis; small L3 offset gives X
  const armAngle = s + e
  x += L3 * Math.cos(wr) * Math.sin(wp)
  const y2 = L3 * Math.sin(wr) * Math.sin(wp)
  const z2 = L3 * Math.cos(wp)
  // Rotate (x,y2,z2) by armAngle in YZ
  const xFinal = x
  const yFinal = y + y2 * Math.cos(armAngle) - z2 * Math.sin(armAngle)
  const zFinal = z + y2 * Math.sin(armAngle) + z2 * Math.cos(armAngle)

  return {
    x: xFinal,
    y: yFinal,
    z: zFinal,
    roll: wr,
    pitch: wp,
    yaw: armAngle,
  }
}
