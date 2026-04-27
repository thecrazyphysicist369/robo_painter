import { useState, useCallback, useRef } from 'react'

export function parseCompactLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  const s = trimmed.match(/S:(-?\d+)/)
  const e = trimmed.match(/E:(-?\d+)/)
  const wr = trimmed.match(/WR:(-?\d+)/)
  const wp = trimmed.match(/WP:(-?\d+)/)
  const g = trimmed.match(/G:(-?\d+)/)
  if (!s || !e || !wr || !wp || !g) return null
  return {
    shoulder: Math.min(180, Math.max(0, parseInt(s[1], 10))),
    elbow: Math.min(180, Math.max(0, parseInt(e[1], 10))),
    wristRotation: Math.min(180, Math.max(0, parseInt(wr[1], 10))),
    wristPitch: Math.min(180, Math.max(0, parseInt(wp[1], 10))),
    gripper: Math.min(180, Math.max(0, parseInt(g[1], 10))),
  }
}

export function parseCtrlLine(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('CTRL:')) return null
  const lx = trimmed.match(/LX:(-?\d+)/)?.[1]
  const ly = trimmed.match(/LY:(-?\d+)/)?.[1]
  const rx = trimmed.match(/RX:(-?\d+)/)?.[1]
  const ry = trimmed.match(/RY:(-?\d+)/)?.[1]
  const lt = trimmed.match(/LT:(-?\d+)/)?.[1]
  const rt = trimmed.match(/RT:(-?\d+)/)?.[1]
  const a = trimmed.match(/A:(\d+)/)?.[1]
  const b = trimmed.match(/B:(\d+)/)?.[1]
  const x = trimmed.match(/X:(\d+)/)?.[1]
  const y = trimmed.match(/Y:(\d+)/)?.[1]
  if (lx == null || ly == null || rx == null || ry == null) return null
  return {
    leftStick: { x: Math.max(-100, Math.min(100, parseInt(lx, 10) || 0)), y: Math.max(-100, Math.min(100, parseInt(ly, 10) || 0)) },
    rightStick: { x: Math.max(-100, Math.min(100, parseInt(rx, 10) || 0)), y: Math.max(-100, Math.min(100, parseInt(ry, 10) || 0)) },
    lt: Math.max(0, Math.min(100, parseInt(lt, 10) || 0)),
    rt: Math.max(0, Math.min(100, parseInt(rt, 10) || 0)),
    a: parseInt(a, 10) ? 1 : 0,
    b: parseInt(b, 10) ? 1 : 0,
    x: parseInt(x, 10) ? 1 : 0,
    y: parseInt(y, 10) ? 1 : 0,
  }
}

const LERP_FACTOR = 0.15

export function useSerial() {
  const [isConnected, setIsConnected] = useState(false)
  const [angles, setAngles] = useState({
    shoulder: 90, elbow: 90, wristRotation: 90, wristPitch: 90, gripper: 90,
  })
  const [angularVelocities, setAngularVelocities] = useState({
    shoulder: 0, elbow: 0, wristRotation: 0, wristPitch: 0, gripper: 0,
  })
  const [logLines, setLogLines] = useState([])
  const [error, setError] = useState(null)
  const [sparklineHistory, setSparklineHistory] = useState({
    shoulder: [], elbow: [], wristRotation: [], wristPitch: [], gripper: [],
  })
  const [controller, setController] = useState({
    leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 },
    lt: 0, rt: 0, a: 0, b: 0, x: 0, y: 0,
  })
  const [servoMode, setServoMode] = useState(null)       // 'PWM' | 'I2C' | null (unknown until Arduino reports)
  const [pcaAvailable, setPcaAvailable] = useState(false) // true when Arduino prints PCA9685:OK
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const writerRef = useRef(null)
  const readBufferRef = useRef('')
  const prevAnglesRef = useRef({ ...angles })
  const prevTimeRef = useRef(performance.now())
  const sparklineRef = useRef({
    shoulder: [], elbow: [], wristRotation: [], wristPitch: [], gripper: [],
  })
  const MAX_SPARKLINE = 32

  // Pending response waiters: array of { test: (line) => value|null, resolve, reject, timer }
  const waitersRef = useRef([])

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
    setSparklineHistory((prev) => ({ ...prev, [key]: [...ref] }))
  }, [])

  const processLine = useCallback(
    (line) => {
      appendLog(line)

      // Check if any waiter matches this line
      const waiters = waitersRef.current
      for (let i = 0; i < waiters.length; i++) {
        const result = waiters[i].test(line)
        if (result !== null && result !== undefined) {
          clearTimeout(waiters[i].timer)
          waiters[i].resolve(result)
          waiters.splice(i, 1)
          return
        }
      }

      // Servo driver mode tracking
      const trimmedLine = line.trim()
      if (trimmedLine === 'PCA9685:OK') { setPcaAvailable(true); return }
      if (trimmedLine === 'PCA9685:NOT_FOUND') { setPcaAvailable(false); return }
      if (trimmedLine === 'MODE:PWM') { setServoMode('PWM'); return }
      if (trimmedLine === 'MODE:I2C') { setServoMode('I2C'); return }
      if (trimmedLine === 'ERR:PCA9685_NOT_FOUND') return

      const ctrl = parseCtrlLine(line)
      if (ctrl) { setController(ctrl); return }

      const parsed = parseCompactLine(line)
      if (!parsed) return
      const vel = computeVelocities(parsed)
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
    async (reader) => {
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
      const writer = port.writable.getWriter()
      readerRef.current = reader
      writerRef.current = writer
      setIsConnected(true)
      appendLog('[Connected] Baud: 115200')
      readLoop(reader)
    } catch (err) {
      setError(err.message || 'Failed to connect')
      setIsConnected(false)
    }
  }, [appendLog, readLoop])

  const disconnect = useCallback(async () => {
    // Cancel all pending waiters
    for (const w of waitersRef.current) {
      clearTimeout(w.timer)
      w.reject(new Error('Disconnected'))
    }
    waitersRef.current = []
    try {
      if (readerRef.current) {
        await readerRef.current.cancel()
        readerRef.current.releaseLock()
        readerRef.current = null
      }
      if (writerRef.current) {
        writerRef.current.releaseLock()
        writerRef.current = null
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
  }, [appendLog])

  const writeRaw = useCallback(async (text) => {
    if (!writerRef.current) {
      appendLog('[ERR] writeRaw: writer is null')
      return false
    }
    try {
      appendLog(`[TX] ${text.trim()}`)
      await writerRef.current.write(new TextEncoder().encode(text))
      return true
    } catch (err) {
      appendLog(`[ERR] writeRaw failed: ${err.message}`)
      setError(err.message || 'Failed to write')
      return false
    }
  }, [appendLog])

  /**
   * Send a command string and wait for a response line that matches `testFn`.
   * testFn(line) should return a parsed value (truthy/object) on match, or null/undefined to skip.
   * Returns the parsed value, or throws on timeout.
   */
  const sendAndWait = useCallback(async (command, testFn, timeoutMs = 5000) => {
    if (!writerRef.current) throw new Error('Not connected')
    appendLog(`[TX] ${command.trim()}`)
    await writerRef.current.write(new TextEncoder().encode(command))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waitersRef.current.findIndex((w) => w.resolve === resolve)
        if (idx >= 0) waitersRef.current.splice(idx, 1)
        reject(new Error(`Timeout waiting for response to: ${command.trim()}`))
      }, timeoutMs)
      waitersRef.current.push({ test: testFn, resolve, reject, timer })
    })
  }, [appendLog])

  const sendAngles = useCallback(async (anglesArray) => {
    if (!Array.isArray(anglesArray) || anglesArray.length !== 5) {
      console.warn('[sendAngles] Invalid angles array:', anglesArray)
      return false
    }
    if (!writerRef.current) {
      console.warn('[sendAngles] Writer is null — not connected')
      appendLog('[ERR] Cannot send: serial not connected')
      return false
    }
    try {
      const safe = anglesArray.map((v) => Math.max(0, Math.min(180, Math.round(v))))
      const command = `A:${safe.join(',')}\n`
      await writerRef.current.write(new TextEncoder().encode(command))
      appendLog(`[TX] ${command.trim()}`)
      return true
    } catch (err) {
      setError(err.message || 'Failed to write serial command')
      appendLog(`[ERR] Write failed: ${err.message}`)
      return false
    }
  }, [appendLog])

  /**
   * Send angles and wait for OK:<achieved angles> response.
   * Returns [a1,a2,a3,a4,a5] achieved angles array, or null on timeout.
   */
  const sendAnglesAndWait = useCallback(async (anglesArray, timeoutMs = 5000) => {
    const safe = anglesArray.map((v) => Math.max(0, Math.min(180, Math.round(v))))
    const command = `A:${safe.join(',')}\n`
    try {
      return await sendAndWait(command, (line) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('OK:')) return null
        try {
          const vals = trimmed.slice(3).split(',').map(Number)
          return vals.length === 5 ? vals : null
        } catch { return null }
      }, timeoutMs)
    } catch { return null }
  }, [sendAndWait])

  /** Send HOME command and wait for HOMED response. */
  const sendHome = useCallback(async (timeoutMs = 5000) => {
    try {
      return await sendAndWait('HOME\n', (line) => line.trim() === 'HOMED' ? true : null, timeoutMs)
    } catch { return false }
  }, [sendAndWait])

  /** Send Q command and wait for POS:<angles> response. */
  const queryPosition = useCallback(async (timeoutMs = 3000) => {
    try {
      return await sendAndWait('Q\n', (line) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('POS:')) return null
        try {
          const vals = trimmed.slice(4).split(',').map(Number)
          return vals.length === 5 ? vals : null
        } catch { return null }
      }, timeoutMs)
    } catch { return null }
  }, [sendAndWait])

  const switchServoMode = useCallback(async (mode) => {
    if (mode !== 'PWM' && mode !== 'I2C') return false
    try {
      const response = await sendAndWait(`MODE:${mode}\n`, (line) => {
        const t = line.trim()
        if (t === `MODE:${mode}`) return mode
        if (t === 'ERR:PCA9685_NOT_FOUND') return 'ERR'
        return null
      }, 3000)
      if (response === 'ERR') {
        appendLog('[ERR] PCA9685 not detected — cannot switch to I2C')
        return false
      }
      return true
    } catch {
      return false
    }
  }, [sendAndWait, appendLog])

  return {
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
  }
}
