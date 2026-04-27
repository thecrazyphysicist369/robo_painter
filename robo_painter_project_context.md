# Robo Painter — Full Project Context & Continuation Guide

> **Purpose of this document:** This captures an entire design conversation about building a robotic arm painting system. Upload this file to any agentic IDE (Claude Code, Cursor, Windsurf, etc.) so the AI can continue development with full context. No prior chat history is needed.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Current State of the Repository](#2-current-state-of-the-repository)
3. [Hardware Setup](#3-hardware-setup)
4. [Architecture Decision Log](#4-architecture-decision-log)
5. [Kinematics — FK and IK](#5-kinematics--fk-and-ik)
6. [Stereo Vision & Object Localization](#6-stereo-vision--object-localization)
7. [Path Planning — Painting Surfaces](#7-path-planning--painting-surfaces)
8. [Dashboard Modes — The Four-Mode Control System](#8-dashboard-modes--the-four-mode-control-system)
9. [Workspace Computation — Reachable & Dexterous](#9-workspace-computation--reachable--dexterous)
10. [Trajectory Execution & Servo Control](#10-trajectory-execution--servo-control)
11. [Vision Feedback — Verifying Paint Coverage](#11-vision-feedback--verifying-paint-coverage)
12. [Advanced — Painting Arbitrary 3D Models](#12-advanced--painting-arbitrary-3d-models)
13. [Code Snippets & Reference Implementations](#13-code-snippets--reference-implementations)
14. [Development Roadmap](#14-development-roadmap)
15. [Open Questions & Future Decisions](#15-open-questions--future-decisions)

---

## 1. Project Overview

**Goal:** Build a system where a 3D-printed robotic arm holding a sketch pen can autonomously paint surfaces of 3D objects (starting with a cube, scaling to arbitrary meshes).

**Repo:** `https://github.com/thecrazyphysicist369/robo_painter`

**Starting point (simple):** Paint all six faces of a cube with the same color.
**Advanced goal:** Paint complex 3D models with multiple colors, using stereo vision for localization and verification.

---

## 2. Current State of the Repository

### What exists (as of the conversation date):

```
robo_painter/
├── robotic_arm_5motor_/
│   └── robotic_arm_5motor_.ino      # Main Arduino sketch (Xbox + 5 servos)
├── dashboard/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Dashboard.jsx         # Main layout: 3-panel with 3D view
│   │   │   ├── RoboticArm.jsx       # Three.js 5-DOF arm visualization
│   │   │   ├── MotorCard.jsx         # Per-motor telemetry cards
│   │   │   ├── SerialConnector.jsx   # Web Serial API connector
│   │   │   ├── XboxControllerVisual.jsx  # Controller state display
│   │   │   └── ErrorBoundary.jsx
│   │   ├── hooks/
│   │   │   └── useSerial.js          # Serial parsing + state management
│   │   └── utils/
│   │       └── forwardKinematics.js  # Basic planar FK (JS, for dashboard)
│   ├── package.json                  # React + Vite + Tailwind + Three.js
│   └── vite.config.js
├── gripper_test/
│   └── gripper_test.ino              # Isolated gripper debugging sketch
├── unused code/                      # Earlier experiments (keyboard, redgear, etc.)
├── Robotic Arm 3D Model STEP.zip     # CAD files for the arm
└── README.md                         # Comprehensive setup/usage docs
```

### Tech stack (dashboard):
- React + Vite + Tailwind CSS
- Three.js via `@react-three/fiber` and `@react-three/drei`
- Web Serial API for Arduino COM port access
- Lucide React for icons

### What the dashboard currently does:
- Connects to Arduino via Web Serial (Chrome/Edge, 115200 baud)
- Parses compact serial format: `S:<angle>,E:<angle>,WR:<angle>,WP:<angle>,G:<angle>`
- Parses controller state: `CTRL:LX:<val>,LY:<val>,RX:<val>,RY:<val>,LT:<val>,RT:<val>,A:<0|1>,B:<0|1>,X:<0|1>,Y:<0|1>`
- 3D arm visualization with lerped joint animations
- Forward kinematics display (end-effector XYZ + RPY)
- Motor telemetry cards with angular velocity and sparkline history
- Xbox controller visual with live stick/trigger/button indicators
- Resizable 3-panel layout (left sidebar, center 3D, right sidebar)
- Serial log terminal at bottom

### Current FK implementation (JavaScript, dashboard only):
```javascript
const L1 = 1.0  // shoulder to elbow (arbitrary units)
const L2 = 0.8  // elbow to wrist
const L3 = 0.3  // wrist to gripper tip
// Maps 0-180 servo degrees to radians centered at 0 (90° = neutral)
// Computes position in YZ plane via shoulder + elbow
// Adds wrist roll/pitch offset for end-effector
```
**Note:** These link lengths are placeholders. Real values must be measured from the STEP files or physical arm.

---

## 3. Hardware Setup

### Current hardware:
- **Arm:** 3D-printed 5-DOF robotic arm
- **Servos:** 5× (likely MG996R or SG90 mix), pins 3, 5, 6, 7, 9
- **Controller:** Xbox 360 wired controller via USB Host Shield on Arduino
- **Board:** Arduino Uno/Mega with USB Host Shield stacked
- **Power:** External 5V supply for servos (common ground with Arduino)

### Decided architecture (new):
- **Computer:** Old laptop with Intel i3 7th gen (replaces Raspberry Pi idea — cost decision)
- **Controller routing:** Xbox controller plugged directly into laptop USB (NOT through Arduino USB Host Shield). Laptop reads controller via `pygame`, computes kinematics, sends final angles to Arduino over serial.
- **Arduino role:** Dumb PWM servo driver only. No USB Host Shield needed. Receives angle commands over serial, writes to servos.
- **USB Host Shield:** REMOVED from the design. Frees pins 10-13.

### Joint configuration:
| Joint | Arduino Pin | Servo | Function |
|-------|------------|-------|----------|
| 1 - Shoulder | Pin 3 | MG996R/SG90 | Vertical pitch (up/down) |
| 2 - Elbow | Pin 5 | MG996R/SG90 | Horizontal extension |
| 3 - Wrist Pitch | Pin 6 | SG90 | Wrist up/down |
| 4 - Wrist Roll | Pin 7 (was 9) | SG90 | Wrist rotation/twist |
| 5 - Gripper | Pin 9 (was 10) | SG90 | Open/close clamp |

### 5-DOF limitation:
The arm has 5 joints, giving 5 degrees of freedom. Full 6-DOF control of position (3) + orientation (3) is not possible. The arm can reach a 3D position with partial orientation control. For painting, this means:
- Some face orientations may be unreachable without rotating the object
- A turntable or manual reorientation may be needed for all 6 faces of a cube
- Consider adding a 6th servo for base rotation (yaw) — pin 10 is now free

### Wiring (new — no USB Host Shield):
```
Laptop ──USB──► Arduino (serial commands only)
Laptop ──USB──► Xbox Controller (pygame reads it)
Laptop ──USB──► Stereo Camera(s) (future)

Arduino Pin 3  ──► Shoulder Servo (signal)
Arduino Pin 5  ──► Elbow Servo (signal)
Arduino Pin 6  ──► Wrist Pitch Servo (signal)
Arduino Pin 7  ──► Wrist Roll Servo (signal)
Arduino Pin 9  ──► Gripper Servo (signal)

External 5V PSU ──► All servo power (red wires)
External GND    ──► All servo ground + Arduino GND (CRITICAL: common ground)
```

---

## 4. Architecture Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary computer | Old i3 laptop | Cost — Raspberry Pi 5 + accessories too expensive |
| Controller input | Laptop reads Xbox via USB/pygame | Eliminates USB Host Shield, simplifies Arduino |
| Arduino role | Dumb servo driver (serial → PWM) | All intelligence on laptop, Arduino is just muscle |
| Communication | USB Serial (115200 baud) | Simple, reliable, low latency |
| Dashboard | Keep existing React/Three.js dashboard | Already built, good visualization |
| Dashboard comms | Migrate from Web Serial to WebSocket | Python backend on laptop serves the dashboard |
| IK library | `roboticstoolbox-python` (Peter Corke) | Mature, supports DH parameters, has IK solvers |
| Vision (future) | Stereo cameras or OAK-D | Not yet purchased/implemented |
| AI accelerator (if needed) | Hailo-8 HAT+ (26 TOPS) or Luxonis OAK-D | Decided against for now due to cost |

---

## 5. Kinematics — FK and IK

### DH Parameters
Must be measured from the STEP files in the repo (`Robotic Arm 3D Model STEP.zip`). The current FK uses placeholder link lengths (L1=1.0, L2=0.8, L3=0.3 in arbitrary units).

**Action needed:** Extract real link lengths, joint offsets, and twist angles from the CAD files. Build a proper DH parameter table:

```python
import roboticstoolbox as rtb
import numpy as np

# PLACEHOLDER — replace with measured values from STEP files
robot = rtb.DHRobot([
    rtb.RevoluteDH(d=0.05, a=0,    alpha=np.pi/2),   # Joint 1: Shoulder
    rtb.RevoluteDH(d=0,    a=0.10, alpha=0),           # Joint 2: Elbow
    rtb.RevoluteDH(d=0,    a=0.08, alpha=0),           # Joint 3: Wrist Pitch
    rtb.RevoluteDH(d=0,    a=0,    alpha=np.pi/2),     # Joint 4: Wrist Roll
    rtb.RevoluteDH(d=0.03, a=0,    alpha=0),           # Joint 5: Gripper
], name="painter")
```

### FK validation process:
1. Send known angles to Arduino
2. Measure physical pen tip position with ruler/calipers
3. Compare to FK prediction
4. Iterate DH parameters until error < 2mm

### IK solver:
```python
from spatialmath import SE3

target = SE3(x, y, z) * SE3.Ry(np.pi)  # position + pen pointing down
solution = robot.ikine_LM(target, q0=current_angles)  # Levenberg-Marquardt
# For 5-DOF, use mask to relax one orientation constraint:
solution = robot.ikine_LM(target, mask=[1,1,1,1,1,0])  # free yaw
```

---

## 6. Stereo Vision & Object Localization

### Not yet implemented. Plan:

1. **Camera calibration:** OpenCV `calibrateCamera` + `stereoCalibrate` with checkerboard
2. **Hand-eye calibration:** ArUco marker on pen holder, 15-20 poses, `cv2.calibrateHandEye`
3. **Cube detection:** Point cloud from stereo depth → RANSAC plane removal → cluster → oriented bounding box
4. **Libraries:** OpenCV, Open3D, trimesh

### Camera options considered:
- Two USB webcams (cheapest, most calibration work)
- Intel RealSense D435 (USB depth camera, good but expensive)
- Luxonis OAK-D (stereo + AI in one, best integration but most expensive)

---

## 7. Path Planning — Painting Surfaces

### For a cube (known geometry):
1. Detect cube pose (center + rotation) from vision
2. Define 6 faces relative to cube center
3. For each face: generate raster zigzag toolpath
4. At each waypoint: pen tip at position, pen axis perpendicular to face (negative normal)
5. Solve IK for each waypoint
6. Stream trajectory to Arduino

### Raster path generation:
```python
def generate_raster_path(face_center, normal, up_vec, size, line_spacing=0.003):
    right_vec = np.cross(normal, up_vec)
    right_vec /= np.linalg.norm(right_vec)
    half = size / 2
    waypoints = []
    num_lines = int(size / line_spacing)
    for i in range(num_lines):
        v_offset = -half + i * line_spacing
        if i % 2 == 0:
            start = face_center + up_vec * v_offset - right_vec * half
            end   = face_center + up_vec * v_offset + right_vec * half
        else:
            start = face_center + up_vec * v_offset + right_vec * half
            end   = face_center + up_vec * v_offset - right_vec * half
        pen_offset = normal * 0.001
        waypoints.append(start + pen_offset)
        waypoints.append(end + pen_offset)
    return waypoints
```

### For arbitrary meshes (advanced):
- Load STL/OBJ with `trimesh`
- UV-based path planning or geodesic slicing
- Multi-color: group faces by color, paint one color at a time, swap pens
- Collision avoidance needed for complex shapes

---

## 8. Dashboard Modes — The Four-Mode Control System

The dashboard should have a mode switcher with four modes. This is the core commissioning and calibration tool.

### Mode 1: FK Per-Motor (EXISTING — already built)
- Joystick axes map directly to individual servo angles
- Left stick Y → Shoulder, Left stick X → Elbow
- Right stick Y → Wrist Pitch, Right stick X → Wrist Roll
- Triggers → Gripper open/close
- **Purpose:** Verify each joint moves correctly, find physical limits

### Mode 2: FK Head Mode (Cartesian Jog) — TO BUILD
- Joystick inputs become Cartesian velocities: dx, dy, dz, droll, dpitch, dyaw
- Uses Jacobian-based resolved-rate control
- Joint velocities = J_pseudoinverse × desired_cartesian_velocity
- Needs damped least-squares pseudoinverse near singularities
- **Purpose:** Validate kinematic model — if joystick +X moves pen tip +X in real life, FK is correct

```python
class CartesianJogController:
    def __init__(self, robot):
        self.robot = robot
        self.q = np.array([np.pi/2] * 5)
        self.max_joint_vel = 0.5  # rad/s safety limit

    def jog(self, cartesian_vel, dt=0.02):
        J = self.robot.jacob0(self.q)
        J_pinv = damped_pinv(J, damping=0.01)
        qdot = J_pinv @ np.array(cartesian_vel)
        scale = np.max(np.abs(qdot)) / self.max_joint_vel
        if scale > 1.0:
            qdot /= scale
        self.q = self.q + qdot * dt
        self.q = np.clip(self.q, self.robot.qlim[0], self.robot.qlim[1])
        return np.degrees(self.q)

def damped_pinv(J, damping=0.01):
    JJT = J @ J.T
    return J.T @ np.linalg.inv(JJT + damping**2 * np.eye(JJT.shape[0]))
```

### Mode 3: IK Reachable Workspace — TO BUILD
- Displays translucent convex hull of all reachable positions
- User places numbered waypoint balls in 3D space (drag & drop)
- "Go" button: arm visits each waypoint in order
- IK solves for position only: `mask=[1,1,1,0,0,0]`
- **Purpose:** Test IK solver, tune trajectory smoothness, validate reachability

### Mode 4: IK Dexterous Workspace — TO BUILD
- Displays smaller volume where the arm can reach with orientation diversity
- Waypoint balls have orientation gizmos (3 rings like a gimbal)
- User specifies both WHERE the pen goes and WHICH DIRECTION it points
- IK solves for position + orientation: `mask=[1,1,1,1,1,0]` (5 constraints for 5 DOF)
- **Purpose:** Verify painting feasibility — "can the pen reach this face at the right angle?"

### Workspace computation:
```python
def compute_both_workspaces(robot, num_samples=200000):
    joint_limits = robot.qlim
    position_map = {}
    bin_size = 0.005  # 5mm bins

    for _ in range(num_samples):
        q = np.random.uniform(joint_limits[0], joint_limits[1])
        T = robot.fkine(q)
        pos = T.t
        rot = T.R
        key = tuple((pos / bin_size).astype(int))
        if key not in position_map:
            position_map[key] = []
        position_map[key].append(rot)

    reachable_points = []
    dexterous_points = []

    for key, rotations in position_map.items():
        center = np.array(key) * bin_size + bin_size / 2
        reachable_points.append(center)
        if is_dexterous(rotations):
            dexterous_points.append(center)

    return np.array(reachable_points), np.array(dexterous_points)

def is_dexterous(rotations, min_orientations=6, spread_threshold=0.5):
    if len(rotations) < min_orientations:
        return False
    z_axes = np.array([R[:, 2] for R in rotations])
    cov = np.cov(z_axes.T)
    eigenvalues = np.linalg.eigvalsh(cov)
    sorted_eigs = np.sort(eigenvalues)[::-1]
    return sorted_eigs[0] > spread_threshold and sorted_eigs[1] > spread_threshold * 0.3
```

---

## 9. Workspace Computation — Reachable & Dexterous

### Reachable workspace:
- Monte Carlo: sample 100k-200k random joint configs
- Run FK on each → collect pen tip positions
- Convex hull of point cloud = reachable volume boundary
- Any (x,y,z) inside the hull is reachable by at least one joint configuration

### Dexterous workspace:
- Same sampling, but also record the rotation matrix at each config
- Bin positions into 5mm cells
- For each cell: check if the pen's pointing direction has enough diversity
- Diversity measured via eigenvalue analysis of z-axis covariance
- A point is "dexterous" if the pen can point in multiple sufficiently different directions there

### Dashboard visualization:
- Reachable: translucent orange mesh (convex hull)
- Dexterous: translucent green mesh (subset, always smaller)
- In dexterous mode, show reachable as faint wireframe for reference
- Waypoint balls constrained to be inside the active workspace

---

## 10. Trajectory Execution & Servo Control

### Arduino firmware (new — simplified, no USB Host Shield):
```cpp
#include <Servo.h>

Servo servos[5];
const int pins[5] = {3, 5, 6, 7, 9};
int currentAngles[5] = {90, 90, 90, 90, 90};

void setup() {
    Serial.begin(115200);
    for (int i = 0; i < 5; i++) {
        servos[i].attach(pins[i]);
        servos[i].write(90);
    }
    Serial.println("READY");
}

void loop() {
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();

        if (line.startsWith("A:")) {
            // Format: A:90,85,120,90,45
            line = line.substring(2);
            int idx = 0;
            int start = 0;
            for (int i = 0; i <= line.length() && idx < 5; i++) {
                if (i == line.length() || line[i] == ',') {
                    int angle = line.substring(start, i).toInt();
                    angle = constrain(angle, 0, 180);
                    currentAngles[idx] = angle;
                    servos[idx].write(angle);
                    idx++;
                    start = i + 1;
                }
            }
            Serial.print("OK:");
            for (int i = 0; i < 5; i++) {
                Serial.print(currentAngles[i]);
                if (i < 4) Serial.print(",");
            }
            Serial.println();
        } else if (line == "Q") {
            Serial.print("POS:");
            for (int i = 0; i < 5; i++) {
                Serial.print(currentAngles[i]);
                if (i < 4) Serial.print(",");
            }
            Serial.println();
        } else if (line == "HOME") {
            for (int i = 0; i < 5; i++) {
                currentAngles[i] = 90;
                servos[i].write(90);
            }
            Serial.println("HOMED");
        }
    }
}
```

### Protocol:
- `A:90,85,120,90,45\n` → set angles, responds `OK:90,85,120,90,45`
- `Q\n` → query, responds `POS:90,85,120,90,45`
- `HOME\n` → all to 90°, responds `HOMED`

### Python serial driver:
```python
import serial
import time

class ArduinoServoDriver:
    def __init__(self, port='COM3', baud=115200):
        self.ser = serial.Serial(port, baud, timeout=1)
        time.sleep(2)  # Arduino reset
        line = self.ser.readline().decode().strip()
        print(f"Arduino: {line}")

    def set_angles(self, angles):
        cmd = "A:" + ",".join(str(int(a)) for a in angles) + "\n"
        self.ser.write(cmd.encode())
        return self.ser.readline().decode().strip()

    def query(self):
        self.ser.write(b"Q\n")
        resp = self.ser.readline().decode().strip()
        if resp.startswith("POS:"):
            return [int(x) for x in resp[4:].split(",")]
        return None

    def home(self):
        self.ser.write(b"HOME\n")
        return self.ser.readline().decode().strip()
```

### Smooth trajectory (quintic polynomial):
```python
import roboticstoolbox as rtb

traj = rtb.jtraj(q_start, q_end, 50)  # 50 steps, smooth accel/decel
for q in traj.q:
    driver.set_angles(np.degrees(q))
    time.sleep(0.02)  # 50Hz
```

---

## 11. Vision Feedback — Verifying Paint Coverage

### Post-paint verification:
1. Move arm out of camera view
2. Capture color image of the painted face
3. Perspective-warp the face to a square image
4. Convert to HSV, threshold for expected color
5. Measure coverage percentage
6. If below threshold, identify unpainted regions and generate touch-up paths

```python
def check_coverage(face_img, target_hsv_low, target_hsv_high, threshold=0.90):
    hsv = cv2.cvtColor(face_img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, target_hsv_low, target_hsv_high)
    coverage = np.count_nonzero(mask) / mask.size
    if coverage < threshold:
        unpainted = cv2.bitwise_not(mask)
        contours, _ = cv2.findContours(unpainted, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)
        return False, coverage, contours
    return True, coverage, None
```

---

## 12. Advanced — Painting Arbitrary 3D Models

### Mesh input:
```python
import trimesh
mesh = trimesh.load('model.stl')
face_normals = mesh.face_normals
face_centers = mesh.triangles_center
```

### Surface slicing for toolpaths:
```python
slices = mesh.section_multiplane(
    plane_origin=mesh.centroid,
    plane_normal=[0, 0, 1],
    heights=np.linspace(-0.05, 0.05, 30)
)
```

### Multi-color workflow:
1. Color map via UV texture or per-face colors
2. Group faces by color
3. For each color: generate toolpaths, paint, verify, swap pen
4. Registration check between colors via camera

---

## 13. Code Snippets & Reference Implementations

### Xbox controller reading (laptop, pygame):
```python
import pygame
import threading

class XboxController:
    def __init__(self):
        pygame.init()
        pygame.joystick.init()
        if pygame.joystick.get_count() == 0:
            raise RuntimeError("No controller found")
        self.joy = pygame.joystick.Joystick(0)
        self.joy.init()
        self.axes = [0.0] * self.joy.get_numaxes()
        self.buttons = [0] * self.joy.get_numbuttons()
        self._lock = threading.Lock()
        self._running = False

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._poll, daemon=True)
        self._thread.start()

    def _poll(self):
        while self._running:
            pygame.event.pump()
            with self._lock:
                for i in range(self.joy.get_numaxes()):
                    self.axes[i] = self.joy.get_axis(i)
                for i in range(self.joy.get_numbuttons()):
                    self.buttons[i] = self.joy.get_button(i)
            pygame.time.wait(10)

    def get_state(self):
        with self._lock:
            return {
                'left_x': self.axes[0], 'left_y': self.axes[1],
                'right_x': self.axes[2] if len(self.axes) > 2 else 0,
                'right_y': self.axes[3] if len(self.axes) > 3 else 0,
                'lt': self.axes[4] if len(self.axes) > 4 else 0,
                'rt': self.axes[5] if len(self.axes) > 5 else 0,
                'a': self.buttons[0], 'b': self.buttons[1],
                'x': self.buttons[2], 'y': self.buttons[3],
            }
```

### WebSocket server (replaces Web Serial on dashboard):
```python
import asyncio
import websockets
import json

class ArmServer:
    def __init__(self, robot, servo_driver, controller):
        self.robot = robot
        self.driver = servo_driver
        self.controller = controller
        self.mode = 'fk_motor'
        self.waypoints = []
        self.jog_controller = CartesianJogController(robot)

    async def handler(self, websocket):
        async for message in websocket:
            msg = json.loads(message)
            if msg['type'] == 'set_mode':
                self.mode = msg['mode']
            elif msg['type'] == 'jog' and self.mode == 'fk_head':
                new_angles = self.jog_controller.jog(msg['vel'])
                self.driver.set_angles(new_angles)
                await websocket.send(json.dumps({
                    'type': 'angles', 'data': new_angles.tolist()
                }))
            elif msg['type'] == 'add_waypoint':
                self.waypoints.append(msg['position'])
            elif msg['type'] == 'clear_waypoints':
                self.waypoints.clear()
            elif msg['type'] == 'go':
                asyncio.create_task(self.run_waypoints(websocket))

    async def run_waypoints(self, websocket):
        # ... execute waypoints, stream progress ...
        pass

    def start(self, host='0.0.0.0', port=8765):
        start_server = websockets.serve(self.handler, host, port)
        asyncio.get_event_loop().run_until_complete(start_server)
        asyncio.get_event_loop().run_forever()
```

### Waypoint execution:
```python
def execute_waypoints(robot, driver, waypoints, speed=0.5):
    q_current = np.radians(driver.query())
    for i, wp in enumerate(waypoints):
        target = SE3(wp[0], wp[1], wp[2]) * SE3.Ry(np.pi)
        solution = robot.ikine_LM(target, q0=q_current)
        if not solution.success:
            print(f"Waypoint {i} unreachable: {wp}")
            continue
        q_target = solution.q
        traj = rtb.jtraj(q_current, q_target, 50)
        for q in traj.q:
            driver.set_angles(np.degrees(q))
            time.sleep(0.02)
        q_current = q_target
```

---

## 14. Development Roadmap

### Phase 1: Arduino simplification (Week 1)
- [ ] Flash new simplified Arduino sketch (serial command receiver only)
- [ ] Remove USB Host Shield from Arduino
- [ ] Test serial protocol: send `A:90,90,90,90,90` from laptop, verify servos move
- [ ] Write Python `ArduinoServoDriver` class

### Phase 2: Controller on laptop (Week 1)
- [ ] Install pygame, test Xbox controller reading on laptop
- [ ] Build control loop: controller → angles → serial → Arduino
- [ ] Verify FK Per-Motor mode works through laptop (same behavior as before, but routed through laptop)

### Phase 3: Kinematics (Week 2-3)
- [ ] Extract DH parameters from STEP files
- [ ] Build robot model with `roboticstoolbox-python`
- [ ] Validate FK: send known angles, measure physical position, compare
- [ ] Implement IK: test with known reachable targets
- [ ] Implement Cartesian Jog controller (Jacobian + damped pseudoinverse)

### Phase 4: Dashboard migration (Week 3-4)
- [ ] Replace `useSerial` hook with `useWebSocket` hook
- [ ] Add mode switcher UI (4 modes)
- [ ] Implement FK Head mode in dashboard + Python backend
- [ ] Add workspace visualization (precomputed convex hull → Three.js mesh)
- [ ] Add waypoint balls (drag & drop in 3D)
- [ ] Add "Go" button + waypoint execution
- [ ] Add dexterous workspace mode with orientation gizmos

### Phase 5: Painting a cube (Week 5-6)
- [ ] Hardcode cube position (no vision yet)
- [ ] Generate raster paths for one face
- [ ] Execute paint trajectory
- [ ] Iterate on smoothness, pressure, coverage

### Phase 6: Vision (Week 7+)
- [ ] Add stereo camera(s)
- [ ] Camera calibration
- [ ] Hand-eye calibration
- [ ] Cube detection from point cloud
- [ ] Post-paint color verification

### Phase 7: Advanced (Week 9+)
- [ ] Arbitrary mesh painting
- [ ] Multi-color support
- [ ] Collision avoidance

---

## 15. Open Questions & Future Decisions

1. **5-DOF vs 6-DOF:** Should a 6th servo (base rotation) be added? Pin 10 is now free. This would make painting all cube faces without a turntable much easier.

2. **Turntable alternative:** Instead of 6th DOF, a servo-driven turntable under the object rotates it to present each face. Mechanically simpler but adds calibration complexity.

3. **Camera choice:** Not yet purchased. Budget will determine whether it's two webcams (~₹1000), RealSense D435 (~₹20,000), or OAK-D (~₹25,000).

4. **Link lengths:** Need to be extracted from `Robotic Arm 3D Model STEP.zip`. This is the critical first step for accurate kinematics.

5. **Servo pulse ranges:** Each servo's `min_pulse` and `max_pulse` need calibration. MG996R typically: 500-2500μs. SG90 typically: 600-2400μs.

6. **Dashboard hosting:** Currently runs on laptop at `localhost:5173` (Vite dev server). For production, could be built and served by the Python backend.

7. **Painting medium:** Sketch pen (marker) assumed. Brush + paint would require pressure control and dipping logic.

---

## Python Dependencies (laptop)

```
roboticstoolbox-python
spatialmath-python
numpy
scipy
opencv-python
open3d
trimesh
pyserial
pygame
websockets
```

Install: `pip install roboticstoolbox-python spatialmath-python numpy scipy opencv-python open3d trimesh pyserial pygame websockets`

---

## System Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│              Laptop (i3 7th gen, Win/Linux)           │
│                                                       │
│  ┌────────────┐  ┌─────────────────────────────────┐ │
│  │ Xbox Ctrl  │  │  Python Process                  │ │
│  │ (USB,      │──│                                  │ │
│  │  pygame)   │  │  Controller ──► Mode Switch      │ │
│  └────────────┘  │                  │               │ │
│                  │    ┌─────────────┼────────────┐  │ │
│  ┌────────────┐  │    │FK Motor  FK Head         │  │ │
│  │ Stereo     │  │    │(direct)  (Jacobian)      │  │ │
│  │ Camera(s)  │──│    │                          │  │ │
│  │ (USB)      │  │    │IK Reach  IK Dexterous    │  │ │
│  └────────────┘  │    │(waypoint)(wp+orient)     │  │ │
│                  │    └─────────────┼────────────┘  │ │
│  ┌────────────┐  │                  ▼               │ │
│  │ Dashboard  │  │           Serial Write           │ │
│  │ (browser,  │◄─│        "A:90,85,120,90,45"       │ │
│  │  localhost)│  └──────────────────┼───────────────┘ │
│  └────────────┘                     │                 │
└─────────────────────────────────────┼─────────────────┘
                               USB Serial
                    ┌─────────────────▼───────────────┐
                    │    Arduino (no USB Host Shield)  │
                    │    Dumb PWM driver: 5 servos     │
                    │    ~50 lines of code             │
                    └─────────────────────────────────┘
```

---

*Document generated from a design conversation. All code snippets are reference implementations — they compile/run but DH parameters, pin assignments, and calibration values need to be filled in with real measurements from the physical arm.*
