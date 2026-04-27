import { useState, useCallback, useRef } from 'react'

// DH parameters matching backend/workspace_generator.py
const DH_PARAMS = [
  { d: 0.05, a: 0.00, alpha: Math.PI / 2, offset: 0 },  // Shoulder
  { d: 0.00, a: 0.10, alpha: 0.00,         offset: 0 },  // Elbow
  { d: 0.00, a: 0.08, alpha: 0.00,         offset: 0 },  // Wrist Pitch
  { d: 0.00, a: 0.00, alpha: Math.PI / 2,  offset: 0 },  // Wrist Roll
  { d: 0.03, a: 0.00, alpha: 0.00,         offset: 0 },  // Gripper
]

function dhMatrix(theta, d, a, alpha) {
  const ct = Math.cos(theta), st = Math.sin(theta)
  const ca = Math.cos(alpha), sa = Math.sin(alpha)
  return [
    [ct, -st * ca,  st * sa, a * ct],
    [st,  ct * ca, -ct * sa, a * st],
    [0,        sa,       ca,      d],
    [0,         0,        0,      1],
  ]
}

function matMul4(A, B) {
  const R = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        R[i][j] += A[i][k] * B[k][j]
  return R
}

/** DH-based forward kinematics. q = [q1..q5] in radians. Returns [x, y, z]. */
export function fkDH(q) {
  let T = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
  for (let i = 0; i < 5; i++) {
    const p = DH_PARAMS[i]
    const A = dhMatrix(q[i] + p.offset, p.d, p.a, p.alpha)
    T = matMul4(T, A)
  }
  return [T[0][3], T[1][3], T[2][3]]
}

/** Convert servo degrees (0-180) to radians centered at 0. */
function servoToRad(servoDeg) {
  return servoDeg.map((a) => ((a - 90) * Math.PI) / 180)
}

// --- Convex hull via Quickhull (3D) ---
// Minimal implementation sufficient for workspace point clouds.

function cross3(a, b) {
  return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]
}
function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
function sub3(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]] }
function norm3(v) { const l = Math.sqrt(dot3(v, v)); return l > 0 ? [v[0]/l, v[1]/l, v[2]/l] : [0,0,0] }

/**
 * Compute 3D convex hull using incremental algorithm.
 * points: [[x,y,z], ...]
 * Returns { vertices: [[x,y,z],...], faces: [[i,j,k],...] }
 */
function convexHull3D(points) {
  const n = points.length
  if (n < 4) return { vertices: points, faces: [] }

  // Find 4 non-coplanar points for initial tetrahedron
  let i0 = 0, i1 = -1, i2 = -1, i3 = -1
  for (let i = 1; i < n; i++) {
    const d = sub3(points[i], points[i0])
    if (dot3(d, d) > 1e-12) { i1 = i; break }
  }
  if (i1 < 0) return { vertices: [points[0]], faces: [] }

  const e01 = sub3(points[i1], points[i0])
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1) continue
    const c = cross3(e01, sub3(points[i], points[i0]))
    if (dot3(c, c) > 1e-12) { i2 = i; break }
  }
  if (i2 < 0) return { vertices: [points[i0], points[i1]], faces: [] }

  const faceNorm = norm3(cross3(sub3(points[i1], points[i0]), sub3(points[i2], points[i0])))
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1 || i === i2) continue
    const d = dot3(faceNorm, sub3(points[i], points[i0]))
    if (Math.abs(d) > 1e-10) { i3 = i; break }
  }
  if (i3 < 0) return { vertices: [points[i0], points[i1], points[i2]], faces: [[0, 1, 2]] }

  // Build initial tetrahedron (ensure outward normals)
  const tetIdx = [i0, i1, i2, i3]
  let faces = [
    [0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]
  ]

  const usedIdx = new Set(tetIdx)
  const hullPts = tetIdx.map((i) => points[i])

  // Orient faces outward
  const center = [
    (hullPts[0][0]+hullPts[1][0]+hullPts[2][0]+hullPts[3][0])/4,
    (hullPts[0][1]+hullPts[1][1]+hullPts[2][1]+hullPts[3][1])/4,
    (hullPts[0][2]+hullPts[1][2]+hullPts[2][2]+hullPts[3][2])/4,
  ]
  for (let fi = 0; fi < faces.length; fi++) {
    const [a, b, c] = faces[fi]
    const fn = cross3(sub3(hullPts[b], hullPts[a]), sub3(hullPts[c], hullPts[a]))
    if (dot3(fn, sub3(hullPts[a], center)) < 0) {
      faces[fi] = [a, c, b]
    }
  }

  // Incrementally add remaining points
  for (let pi = 0; pi < n; pi++) {
    if (usedIdx.has(pi)) continue
    const pt = points[pi]

    // Find visible faces
    const visible = []
    for (let fi = 0; fi < faces.length; fi++) {
      const [a, b, c] = faces[fi]
      const fn = cross3(sub3(hullPts[b], hullPts[a]), sub3(hullPts[c], hullPts[a]))
      if (dot3(fn, sub3(pt, hullPts[a])) > 1e-10) {
        visible.push(fi)
      }
    }
    if (visible.length === 0) continue

    // Find horizon edges
    const visibleSet = new Set(visible)
    const edgeCount = new Map()
    const edgeKey = (a, b) => `${Math.min(a,b)}_${Math.max(a,b)}`
    const edgeDir = new Map()
    for (const fi of visible) {
      const f = faces[fi]
      for (let ei = 0; ei < 3; ei++) {
        const a = f[ei], b = f[(ei + 1) % 3]
        const key = edgeKey(a, b)
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1)
        edgeDir.set(key, [a, b])
      }
    }

    const newPtIdx = hullPts.length
    hullPts.push(pt)

    const horizonEdges = []
    for (const [key, count] of edgeCount) {
      if (count === 1) horizonEdges.push(edgeDir.get(key))
    }

    // Remove visible faces (in reverse order)
    const sortedVisible = [...visibleSet].sort((a, b) => b - a)
    for (const fi of sortedVisible) faces.splice(fi, 1)

    // Create new faces from horizon edges to new point
    for (const [a, b] of horizonEdges) {
      const newFace = [a, b, newPtIdx]
      const fn = cross3(sub3(hullPts[b], hullPts[a]), sub3(hullPts[newPtIdx], hullPts[a]))
      const fc = [0,0,0]
      for (const p of hullPts) { fc[0] += p[0]; fc[1] += p[1]; fc[2] += p[2] }
      fc[0] /= hullPts.length; fc[1] /= hullPts.length; fc[2] /= hullPts.length
      if (dot3(fn, sub3(hullPts[a], fc)) < 0) {
        newFace[1] = newPtIdx; newFace[2] = b
      }
      faces.push(newFace)
    }
  }

  // Compact: only keep vertices referenced by faces
  const usedVerts = new Set()
  for (const f of faces) for (const v of f) usedVerts.add(v)
  const sortedVerts = [...usedVerts].sort((a, b) => a - b)
  const remap = new Map()
  const outVerts = []
  for (let i = 0; i < sortedVerts.length; i++) {
    remap.set(sortedVerts[i], i)
    outVerts.push(hullPts[sortedVerts[i]])
  }
  const outFaces = faces.map((f) => f.map((v) => remap.get(v)))

  return { vertices: outVerts, faces: outFaces }
}

// --- Hook ---

export function useCalibration({ sendAnglesAndWait, sendHome, isConnected }) {
  const [calStatus, setCalStatus] = useState('idle') // idle | running
  const [calProgress, setCalProgress] = useState(0)
  const [calLogs, setCalLogs] = useState([])
  const cancelRef = useRef(false)

  const appendLog = useCallback((type, message, extra) => {
    setCalLogs((prev) => {
      const entry = { type, message, timestamp: Date.now(), ...extra }
      const next = [...prev, entry]
      return next.length > 500 ? next.slice(-500) : next
    })
  }, [])

  const clearLogs = useCallback(() => setCalLogs([]), [])

  const stopCalibration = useCallback(() => { cancelRef.current = true }, [])

  /**
   * Math-only workspace generation (no Arduino needed).
   * Runs FK on random joint configs and computes convex hull entirely in-browser.
   */
  const startMathGeneration = useCallback(async (numSamples = 50000) => {
    setCalStatus('running')
    setCalProgress(0)
    cancelRef.current = false
    appendLog('info', `Starting math-only generation with ${numSamples} samples...`)

    // Run in batches to keep UI responsive
    const BATCH = 2000
    const positions = []

    for (let i = 0; i < numSamples; i += BATCH) {
      if (cancelRef.current) {
        appendLog('warn', 'Generation cancelled by user')
        setCalStatus('idle')
        return
      }
      const end = Math.min(i + BATCH, numSamples)
      for (let j = i; j < end; j++) {
        const q = Array.from({ length: 5 }, () => (Math.random() - 0.5) * Math.PI)
        positions.push(fkDH(q))
      }
      setCalProgress(Math.round((end / numSamples) * 90))
      await new Promise((r) => setTimeout(r, 0)) // yield to UI
    }

    appendLog('info', `Computing convex hull from ${positions.length} points...`)
    setCalProgress(95)
    await new Promise((r) => setTimeout(r, 0))

    const hull = convexHull3D(positions)
    setCalProgress(100)

    const outputData = {
      vertices: hull.vertices,
      faces: hull.faces,
      num_samples: numSamples,
    }

    // Save to public/ via download (or we can write to localStorage and serve)
    const blob = new Blob([JSON.stringify(outputData)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'r_workspace.json'
    a.click()
    URL.revokeObjectURL(url)

    appendLog('success', `Done! ${hull.vertices.length} hull vertices, ${hull.faces.length} faces. File downloaded as r_workspace.json — place it in dashboard/public/`)
    setCalStatus('idle')
    setTimeout(() => setCalProgress(0), 3000)
  }, [appendLog])

  /**
   * Physical calibration via the unified Web Serial connection.
   * Sends random angles to Arduino, reads achieved positions, builds real workspace hull.
   */
  const startPhysicalCalibration = useCallback(async (numSamples = 100) => {
    if (!isConnected) {
      appendLog('fail', 'Cannot calibrate: serial not connected. Use the Connect button first.')
      return
    }
    setCalStatus('running')
    setCalProgress(0)
    cancelRef.current = false

    appendLog('info', `Starting physical calibration with ${numSamples} samples...`)

    // Home first
    appendLog('info', 'Homing arm to 90,90,90,90,90...')
    const homed = await sendHome(5000)
    if (!homed) appendLog('warn', 'No HOMED response (continuing anyway)')
    await new Promise((r) => setTimeout(r, 1000))

    const positions = []
    let successful = 0
    let failed = 0

    // Generate and send random angle sets
    for (let i = 0; i < numSamples; i++) {
      if (cancelRef.current) {
        appendLog('warn', 'Calibration cancelled by user')
        break
      }
      const sample = i + 1
      const commanded = [
        30 + Math.floor(Math.random() * 121),  // Shoulder 30-150
        30 + Math.floor(Math.random() * 121),  // Elbow 30-150
        20 + Math.floor(Math.random() * 141),  // Wrist Pitch 20-160
        Math.floor(Math.random() * 181),        // Wrist Roll 0-180
        60 + Math.floor(Math.random() * 61),    // Gripper 60-120
      ]

      appendLog('attempt', `[${sample}/${numSamples}] Sending: ${commanded.join(',')}`)
      const achieved = await sendAnglesAndWait(commanded, 5000)

      if (achieved === null) {
        failed++
        appendLog('fail', `[${sample}/${numSamples}] TIMEOUT`, {
          reachability: Math.round((successful / (successful + failed)) * 100) || 0
        })
      } else {
        const qRad = servoToRad(achieved)
        const pos = fkDH(qRad)
        positions.push(pos)
        successful++
        const errAvg = commanded.reduce((s, c, idx) => s + Math.abs(c - achieved[idx]), 0) / 5
        appendLog('success',
          `[${sample}/${numSamples}] OK → ${achieved.join(',')} | pos (${pos[0].toFixed(4)}, ${pos[1].toFixed(4)}, ${pos[2].toFixed(4)}) | err ${errAvg.toFixed(1)}°`,
          { reachability: Math.round((successful / (successful + failed)) * 100) }
        )
      }
      setCalProgress(Math.round((sample / numSamples) * 100))
    }

    // Home after calibration
    appendLog('info', 'Calibration complete. Homing arm...')
    await sendHome(5000)

    if (positions.length < 4) {
      appendLog('fail', 'Not enough points for convex hull (need at least 4)')
      setCalStatus('idle')
      return
    }

    appendLog('info', `Computing convex hull from ${positions.length} points...`)
    const hull = convexHull3D(positions)

    const outputData = {
      vertices: hull.vertices,
      faces: hull.faces,
      num_samples: numSamples,
      successful_samples: successful,
      failed_samples: failed,
      reachability_pct: Math.round((successful / (successful + failed)) * 100),
      calibration_type: 'physical',
    }

    const blob = new Blob([JSON.stringify(outputData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'r_workspace.json'
    a.click()
    URL.revokeObjectURL(url)

    appendLog('success', `Workspace saved! ${successful} successful, ${failed} failed, ${outputData.reachability_pct}% reachability. File downloaded — place it in dashboard/public/`)
    setCalStatus('idle')
    setTimeout(() => setCalProgress(0), 3000)
  }, [isConnected, sendAnglesAndWait, sendHome, appendLog])

  return {
    calStatus,
    calProgress,
    calLogs,
    startMathGeneration,
    startPhysicalCalibration,
    stopCalibration,
    clearLogs,
  }
}
