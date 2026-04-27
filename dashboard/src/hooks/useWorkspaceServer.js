import { useState, useEffect, useRef, useCallback } from 'react'

export function useWorkspaceServer() {
  const [wsStatus, setWsStatus] = useState('disconnected') // disconnected, connecting, connected
  const [calStatus, setCalStatus] = useState('idle') // idle, warning, running
  const [calProgress, setCalProgress] = useState(0)
  const [calLogs, setCalLogs] = useState([])
  const [fileExists, setFileExists] = useState(false)
  const wsRef = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    setWsStatus('connecting')
    const ws = new WebSocket('ws://localhost:8765')

    ws.onopen = () => setWsStatus('connected')

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'progress') {
          setCalProgress(data.value)
        } else if (data.type === 'status') {
          setCalStatus(data.value)
        } else if (data.type === 'exists') {
          setFileExists(data.value)
          if (data.value) setCalStatus('warning')
          else setCalStatus('idle')
        } else if (data.type === 'complete') {
          setCalStatus('idle')
          setCalProgress(100)
          setCalLogs(prev => [...prev, {
            type: 'info',
            message: '✅ Calibration complete! Switch to Mode 3 to see the workspace.',
            timestamp: Date.now()
          }])
          setTimeout(() => setCalProgress(0), 3000)
        } else if (data.type === 'cal_log') {
          setCalLogs(prev => {
            const next = [...prev, { ...data.data, timestamp: Date.now() }]
            // Keep only last 500 entries
            return next.length > 500 ? next.slice(-500) : next
          })
        } else if (data.type === 'error') {
          setCalLogs(prev => [...prev, {
            type: 'fail',
            message: `❌ Error: ${data.message}`,
            timestamp: Date.now()
          }])
        }
      } catch (e) {
        console.error("Invalid WS message:", event.data)
      }
    }

    ws.onclose = () => setWsStatus('disconnected')
    ws.onerror = () => setWsStatus('disconnected')

    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  const checkExists = useCallback((mode) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'check_exists', mode }))
    }
  }, [])

  const startMathGeneration = useCallback((mode) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setCalLogs([])
      wsRef.current.send(JSON.stringify({ action: `generate_${mode}` }))
    }
  }, [])

  const startPhysicalCalibration = useCallback((mode, port, numSamples) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setCalLogs([])
      wsRef.current.send(JSON.stringify({
        action: `calibrate_${mode}`,
        port: port,
        num_samples: numSamples
      }))
    }
  }, [])

  const stopCalibration = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'stop' }))
    }
  }, [])

  const clearLogs = useCallback(() => setCalLogs([]), [])

  return {
    wsStatus,
    calStatus,
    setCalStatus,
    calProgress,
    calLogs,
    fileExists,
    checkExists,
    startMathGeneration,
    startPhysicalCalibration,
    stopCalibration,
    clearLogs
  }
}
