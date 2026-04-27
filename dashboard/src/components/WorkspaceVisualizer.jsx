import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'

const TARGET_WORKSPACE_SPAN = 2.2

function buildHullPlanes(vertices, faces) {
  if (!vertices?.length || !faces?.length) return []
  const center = new THREE.Vector3()
  vertices.forEach((v) => center.add(new THREE.Vector3(v[0], v[1], v[2])))
  center.multiplyScalar(1 / vertices.length)

  return faces.map((face) => {
    const a = new THREE.Vector3(...vertices[face[0]])
    const b = new THREE.Vector3(...vertices[face[1]])
    const c = new THREE.Vector3(...vertices[face[2]])
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
    const towardCenter = new THREE.Vector3().subVectors(center, a)
    if (normal.dot(towardCenter) > 0) normal.multiplyScalar(-1)
    const d = -normal.dot(a)
    return { normal, d }
  })
}

function WaypointGizmo({ position, index, isInsideHull, onDraggingChanged, onMoveEnd }) {
  const tcRef = useRef()
  const lastValidRef = useRef(new THREE.Vector3(...position))

  useEffect(() => {
    const tc = tcRef.current
    if (!tc) return
    const handler = (event) => onDraggingChanged(event.value)
    tc.addEventListener('dragging-changed', handler)
    return () => tc.removeEventListener('dragging-changed', handler)
  }, [onDraggingChanged])

  return (
    <TransformControls
      ref={tcRef}
      mode="translate"
      size={0.7}
      showX
      showY
      showZ
      position={position}
      onObjectChange={() => {
        const obj = tcRef.current?.object
        if (!obj) return
        const p = obj.position
        const candidate = [p.x, p.y, p.z]
        if (isInsideHull(candidate)) {
          lastValidRef.current.set(p.x, p.y, p.z)
        } else {
          p.copy(lastValidRef.current)
        }
      }}
      onMouseUp={() => {
        const p = lastValidRef.current
        onMoveEnd(index, [p.x, p.y, p.z])
      }}
    >
      <mesh
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <sphereGeometry args={[0.041, 16, 16]} />
        <meshStandardMaterial color="#86efac" emissive="#166534" emissiveIntensity={0.55} />
      </mesh>
    </TransformControls>
  )
}

export function WorkspaceVisualizer({
  activeMode,
  waypoints = [],
  onWaypointAdd,
  activeWaypointIndex = -1,
  selectedWaypointIndex = -1,
  onWaypointSelect,
  onWaypointDelete,
  onWaypointMoveEnd,
  onTransformDragging,
}) {
  const [geometry, setGeometry] = useState(null)
  const [workspaceScale, setWorkspaceScale] = useState(1)
  const [hoveredWaypointIndex, setHoveredWaypointIndex] = useState(-1)
  const [hullData, setHullData] = useState({ vertices: [], faces: [] })
  const draggingRef = useRef(false)
  const suppressClickUntilRef = useRef(0)

  const isReach = activeMode === 'ik_reach'
  const isWorkspaceMode = activeMode === 'ik_reach' || activeMode === 'ik_dex'

  const hullPlanes = useMemo(
    () => buildHullPlanes(hullData.vertices, hullData.faces),
    [hullData]
  )

  const isInsideHull = useCallback((worldPoint) => {
    if (!hullPlanes.length) return false
    const local = new THREE.Vector3(
      worldPoint[0] / workspaceScale,
      worldPoint[1] / workspaceScale,
      worldPoint[2] / workspaceScale
    )
    const EPS = 1e-4
    return hullPlanes.every((plane) => plane.normal.dot(local) + plane.d <= EPS)
  }, [hullPlanes, workspaceScale])

  useEffect(() => {
    if (activeMode === 'ik_reach') {
      fetch('/r_workspace.json')
        .then(res => {
          if (!res.ok) throw new Error('File not found')
          return res.json()
        })
        .then(data => {
          const vertices = new Float32Array(data.faces.length * 3 * 3)
          let i = 0
          data.faces.forEach(face => {
            const v1 = data.vertices[face[0]]
            const v2 = data.vertices[face[1]]
            const v3 = data.vertices[face[2]]
            vertices[i++] = v1[0]; vertices[i++] = v1[1]; vertices[i++] = v1[2]
            vertices[i++] = v2[0]; vertices[i++] = v2[1]; vertices[i++] = v2[2]
            vertices[i++] = v3[0]; vertices[i++] = v3[1]; vertices[i++] = v3[2]
          })
          const geom = new THREE.BufferGeometry()
          geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
          geom.computeVertexNormals()
          geom.computeBoundingBox()
          const size = new THREE.Vector3()
          geom.boundingBox?.getSize(size)
          const maxSpan = Math.max(size.x || 0, size.y || 0, size.z || 0)
          const nextScale = maxSpan > 0 ? TARGET_WORKSPACE_SPAN / maxSpan : 1
          setHullData({ vertices: data.vertices, faces: data.faces })
          setWorkspaceScale(nextScale)
          setGeometry(geom)
        })
        .catch(err => {
          console.warn('Could not load r_workspace.json:', err)
          setHullData({ vertices: [], faces: [] })
          setGeometry(null)
          setWorkspaceScale(1)
        })
    } else {
      setHullData({ vertices: [], faces: [] })
      setGeometry(null)
      setWorkspaceScale(1)
    }
  }, [activeMode])

  const handleDraggingChanged = useCallback((isDragging) => {
    draggingRef.current = isDragging
    if (isDragging) suppressClickUntilRef.current = Date.now() + 400
    onTransformDragging?.(isDragging)
  }, [onTransformDragging])

  const handleHullClick = useCallback((event) => {
    if (!onWaypointAdd) return
    if (draggingRef.current) return
    if (Date.now() < suppressClickUntilRef.current) return
    if (event.button !== 0 && event.nativeEvent?.button !== 0) return
    event.stopPropagation()
    const p = event.point
    const candidate = [p.x, p.y, p.z]
    if (isInsideHull(candidate)) onWaypointAdd(candidate)
  }, [onWaypointAdd, isInsideHull])

  if (!isWorkspaceMode) return null

  return (
    <group>
      {!isReach && (
        <mesh position={[0, 1, 0]}>
          <sphereGeometry args={[1.5, 32, 32]} />
          <meshPhysicalMaterial
            color="#22c55e"
            transparent
            opacity={0.15}
            roughness={0.2}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {isReach && geometry && (
        <mesh
          geometry={geometry}
          scale={[workspaceScale, workspaceScale, workspaceScale]}
          onClick={handleHullClick}
        >
          <meshPhysicalMaterial
            color="#f97316"
            transparent
            opacity={0.3}
            roughness={0.2}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {isReach && geometry && (
        <mesh
          geometry={geometry}
          scale={[workspaceScale, workspaceScale, workspaceScale]}
          onClick={handleHullClick}
        >
          <meshBasicMaterial color="#f97316" wireframe transparent opacity={0.1} />
        </mesh>
      )}

      {isReach && waypoints.map((point, index) => {
        if (index === selectedWaypointIndex) return null
        return (
          <mesh
            key={`wp-${index}`}
            position={point}
            onPointerOver={(e) => { e.stopPropagation(); setHoveredWaypointIndex(index) }}
            onPointerOut={(e) => { e.stopPropagation(); setHoveredWaypointIndex((p) => (p === index ? -1 : p)) }}
            onPointerDown={(e) => {
              e.stopPropagation()
              if ((e.button ?? e.nativeEvent?.button) === 0) onWaypointSelect?.(index)
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.stopPropagation()
              e.nativeEvent?.preventDefault?.()
              onWaypointDelete?.(index)
            }}
          >
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshStandardMaterial
              color={
                index === activeWaypointIndex ? '#f59e0b'
                  : index === hoveredWaypointIndex ? '#86efac'
                    : '#22c55e'
              }
              emissive={
                index === activeWaypointIndex ? '#78350f'
                  : index === hoveredWaypointIndex ? '#166534'
                    : '#14532d'
              }
              emissiveIntensity={0.45}
            />
          </mesh>
        )
      })}

      {isReach && selectedWaypointIndex >= 0 && waypoints[selectedWaypointIndex] && (
        <WaypointGizmo
          key={selectedWaypointIndex}
          position={waypoints[selectedWaypointIndex]}
          index={selectedWaypointIndex}
          isInsideHull={isInsideHull}
          onDraggingChanged={handleDraggingChanged}
          onMoveEnd={onWaypointMoveEnd}
        />
      )}
    </group>
  )
}
