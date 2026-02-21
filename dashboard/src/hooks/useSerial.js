import { useState, useCallback, useRef } from 'react'

/**
 * Parses compact serial format: S:<angle>,E:<angle>,WR:<angle>,WP:<angle>,G:<angle>\n
 * Returns { shoulder, elbow, wristRotation, wristPitch, gripper } in degrees 0-180, or null if invalid.
 */
export function parseCompactLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  const s = trimmed.match(/S:(\d+)/)
  const e = trimmed.match(/E:(\d+)/)
  const wr = trimmed.match(/WR:(\d+)/)
  const wp = trimmed.match(/WP:(\d+)/)
  const g = trimmed.match(/G:(\d+)/)
  if (!s || !e || !wr || !wp || !g) return null
  return {
    shoulder: Math.min(180, Math.max(0, parseInt(s[1], 10))),
    elbow: Math.min(180, Math.max(0, parseInt(e[1], 10))),
    wristRotation: Math.min(180, Math.max(0, parseInt(wr[1], 10))),
    wristPitch: Math.min(180, Math.max(0, parseInt(wp[1], 10))),
    gripper: Math.min(180, Math.max(0, parseInt(g[1], 10))),
  }
}

const LERP_FACTOR = 0.15

export function useSerial() {
  const [isConnected, setIsConnected] = useState(false)
  const [angles, setAngles] = useState({
    shoulder: 90,
    elbow: 90,
    wristRotation: 90,
    wristPitch: 90,
    gripper: 90,
  })
  const [angularVelocities, setAngularVelocities] = useState({
    shoulder: 0,
    elbow: 0,
    wristRotation: 0,
    wristPitch: 0,
    gripper: 0,
  })
  const [logLines, setLogLines] = useState([])
  const [error, setError] = useState(null)
  const [sparklineHistory, setSparklineHistory] = useState({
    shoulder: [],
    elbow: [],
    wristRotation: [],
    wristPitch: [],
    gripper: [],
  })
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const readBufferRef = useRef('')
  const prevAnglesRef = useRef({ ...angles })
  const prevTimeRef = useRef(performance.now())
  const sparklineRef = useRef({
    shoulder: [],
    elbow: [],
    wristRotation: [],
    wristPitch: [],
    gripper: [],
  })
  const MAX_SPARKLINE = 32

  const appendLog = useCallback((text) => {
    setLogLines((prev) => [...prev.slice(-199), text])
  }, [])

  const computeVelocities = useCallback((nextAngles) => {
    const now = performance.now()
    const dt = (now - prevTimeRef.current) / 1000
    prevTimeRef.current = now
    if (dt <= 0) return prevAnglesRef.current
    const prev = prevAnglesRef.current
    const vel = {
      shoulder: (nextAngles.shoulder - prev.shoulder) / dt,
      elbow: (nextAngles.elbow - prev.elbow) / dt,
      wristRotation: (nextAngles.wristRotation - prev.wristRotation) / dt,
      wristPitch: (nextAngles.wristPitch - prev.wristPitch) / dt,
      gripper: (nextAngles.gripper - prev.gripper) / dt,
    }
    prevAnglesRef.current = { ...nextAngles }
    return vel
  }, [])

  const pushSparkline = useCallback((key, value) => {
    const ref = sparklineRef.current[key]
    ref.push(value)
    if (ref.length > MAX_SPARKLINE) ref.shift()
    setSparklineHistory((prev) => ({
      ...prev,
      [key]: [...ref],
    }))
  }, [])

  const processLine = useCallback(
    (line) => {
      appendLog(line)
      const parsed = parseCompactLine(line)
      if (!parsed) return
      const vel = computeVelocities({
        shoulder: parsed.shoulder,
        elbow: parsed.elbow,
        wristRotation: parsed.wristRotation,
        wristPitch: parsed.wristPitch,
        gripper: parsed.gripper,
      })
      setAngularVelocities(vel)
      pushSparkline('shoulder', parsed.shoulder)
      pushSparkline('elbow', parsed.elbow)
      pushSparkline('wristRotation', parsed.wristRotation)
      pushSparkline('wristPitch', parsed.wristPitch)
      pushSparkline('gripper', parsed.gripper)
      setAngles((prev) => ({
        shoulder: prev.shoulder + (parsed.shoulder - prev.shoulder) * LERP_FACTOR,
        elbow: prev.elbow + (parsed.elbow - prev.elbow) * LERP_FACTOR,
        wristRotation: prev.wristRotation + (parsed.wristRotation - prev.wristRotation) * LERP_FACTOR,
        wristPitch: prev.wristPitch + (parsed.wristPitch - prev.wristPitch) * LERP_FACTOR,
        gripper: prev.gripper + (parsed.gripper - prev.gripper) * LERP_FACTOR,
      }))
    },
    [appendLog, computeVelocities, pushSparkline]
  )

  const readLoop = useCallback(
    async (reader, port) => {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = new TextDecoder().decode(value)
          readBufferRef.current += chunk
          const lines = readBufferRef.current.split('\n')
          readBufferRef.current = lines.pop() ?? ''
          for (const line of lines) if (line.trim()) processLine(line)
        }
      } catch (err) {
        if (portRef.current) {
          setError(err.message)
          setIsConnected(false)
        }
      }
    },
    [processLine]
  )

  const connect = useCallback(async () => {
    setError(null)
    if (!navigator.serial) {
      setError('Web Serial API not supported. Use Chrome/Edge and HTTPS or localhost.')
      return
    }
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 115200 })
      portRef.current = port
      const reader = port.readable.getReader()
      readerRef.current = reader
      setIsConnected(true)
      appendLog('[Connected] Baud: 115200')
      readLoop(reader, port)
    } catch (err) {
      setError(err.message || 'Failed to connect')
      setIsConnected(false)
    }
  }, [appendLog, readLoop])

  const disconnect = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel()
        readerRef.current = null
      }
      if (portRef.current) {
        await portRef.current.close()
        portRef.current = null
      }
      setIsConnected(false)
      appendLog('[Disconnected]')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  return {
    isConnected,
    angles,
    angularVelocities,
    logLines,
    error,
    connect,
    disconnect,
    sparklineHistory,
  }
}
