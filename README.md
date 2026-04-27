# 5-DOF Robotic Arm Controller

Arduino-based robotic arm with dual input (Xbox 360 controller + Web Dashboard), dual servo driver (direct PWM + PCA9685 I2C), real-time 3D visualization, forward/inverse kinematics, workspace calibration, waypoint planning, and live motor telemetry — all over a single Web Serial connection.

![Arduino](https://img.shields.io/badge/Arduino-Compatible-00979D?logo=arduino&logoColor=white)
![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Web Dashboard](#web-dashboard)
- [Hardware Requirements](#hardware-requirements)
- [Wiring](#wiring)
- [Arduino Firmware](#arduino-firmware)
- [Serial Protocol](#serial-protocol)
- [Installation](#installation)
- [Controller Mapping](#controller-mapping)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [License](#license)

## Overview

A 5-degree-of-freedom robotic arm controlled by:

- **Xbox 360 Controller** via USB Host Shield — analog stick/trigger control
- **Web Dashboard** via Web Serial API — 3D visualization, kinematics, jogging, waypoints, calibration

Five servos: Shoulder, Elbow, Wrist Pitch, Wrist Roll, Gripper. All initialize to 90 degrees on startup.

### Key Features

- **Dual servo driver** — switch between direct Arduino PWM and PCA9685 I2C from the dashboard at runtime
- **Unified serial** — one Web Serial connection handles telemetry, motor commands, calibration, and mode switching (no Python backend required)
- **3D digital twin** — real-time arm visualization with orbit camera, forward kinematics display
- **Workspace calibration** — Monte Carlo FK sampling, convex hull computation, and JSON export (all in-browser)
- **IK waypoints** — place/edit/delete waypoints inside the reachable workspace, execute sequentially
- **Motor jogging** — per-motor CW/CCW buttons with immediate serial feedback
- **Resizable UI** — draggable panel dividers, collapsible tabbed log footer (Serial / Calibration / Waypoint)

## Architecture

```
┌────────────────────────────────────┐
│  Browser (Chrome/Edge)             │
│  React + Three.js Dashboard        │
│    useSerial ←→ Web Serial API     │
│    useCalibration (FK, Hull, IK)   │
└──────────────┬─────────────────────┘
               │ USB Serial (115200 baud)
┌──────────────┴─────────────────────┐
│  Arduino Uno/Mega                  │
│    robotic_arm_5motor_.ino         │
│    ├─ Direct PWM (Servo.h)        │
│    └─ PCA9685 I2C (Adafruit lib)  │
│    USB Host Shield → Xbox 360     │
└────────────────────────────────────┘
```

All calibration math (DH-parameter forward kinematics, convex hull, IK solving) runs in the browser. The Python backend (`backend/`) is legacy and no longer used by the dashboard.

## Web Dashboard

### Features

| Panel | Content |
|-------|---------|
| **Left sidebar** | End-effector position (X, Y, Z), orientation (Roll, Pitch, Yaw), Xbox controller visualization, dashboard mode selector, calibration controls |
| **Center canvas** | 3D robotic arm, orbit camera, workspace hull overlay (Mode 3), waypoint spheres with transform gizmos |
| **Right sidebar** | Motor data cards (angle, velocity, sparkline), jog buttons (CW/CCW per motor), Test TX, Reset Arm, PWM/I2C driver toggle |
| **Bottom footer** | Tabbed logs (Serial, Calibration, Waypoint) — collapsible, drag-resizable |

### Dashboard Modes

1. **FK Telemetry** — live joint angles and end-effector display
2. **FK Head** — (planned) Cartesian jog / Jacobian resolved-rate control
3. **IK Reachable** — convex hull workspace visualization, waypoint placement and execution
4. **Dexterous Workspace** — (planned) dexterous workspace rendering

### How to Run

Prerequisites: [Node.js](https://nodejs.org/) LTS and npm.

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome or Edge. Click **Connect Serial** (top-right), select the Arduino COM port.

**Browser support:** Web Serial API requires Chrome or Edge on localhost or HTTPS.

## Hardware Requirements

| Component | Qty | Notes |
|-----------|-----|-------|
| Arduino Uno or Mega | 1 | Mega recommended for headroom |
| USB Host Shield | 1 | For Xbox controller |
| Xbox 360 Controller | 1 | Wired USB |
| MG996R Servo | 4 | Shoulder, Elbow, Wrist Pitch, Wrist Roll |
| SG90 Micro Servo | 1 | Gripper |
| External 5V PSU | 1 | 5V / 5A recommended |
| PCA9685 Board (optional) | 1 | 16-channel I2C PWM driver — eliminates timer conflicts |

### Power

Servos must be powered externally. Arduino 5V pin cannot source enough current for 5 motors.

- Recommended: 5V / 5A
- Minimum: 5V / 3A
- Common ground between Arduino and PSU is **required**

## Wiring

### Direct PWM Mode (default)

| Motor | Arduino Pin |
|-------|-------------|
| Shoulder | Pin 3 |
| Elbow | Pin 5 |
| Wrist Pitch | Pin 6 |
| Wrist Roll | Pin 7 |
| Gripper | Pin 9 |

Pins 10-13 are reserved for the USB Host Shield SPI bus.

### PCA9685 I2C Mode (optional)

| Connection | From | To |
|------------|------|----|
| SDA | Arduino A4 | PCA9685 SDA |
| SCL | Arduino A5 | PCA9685 SCL |
| V+ | External 5V | PCA9685 V+ |
| GND | Common GND | PCA9685 GND |

PCA9685 channel mapping: 0=Shoulder, 1=Elbow, 2=Wrist Pitch, 3=Wrist Roll, 4=Gripper.

The firmware auto-detects the PCA9685 at I2C address `0x40` on boot. If not found, it falls back to PWM-only and prints `PCA9685:NOT_FOUND`. Switch between modes at runtime via the dashboard toggle or the `MODE:PWM` / `MODE:I2C` serial commands.

## Arduino Firmware

Single file: `robotic_arm_5motor_/robotic_arm_5motor_.ino`

### Libraries Required

| Library | Install via Arduino Library Manager |
|---------|-------------------------------------|
| Servo | Built-in |
| USB Host Shield Library 2.0 | By Oleg Mazurov |
| Adafruit PWM Servo Driver Library | By Adafruit |

Or via `arduino-cli`:

```bash
arduino-cli lib install "USB Host Shield Library 2.0"
arduino-cli lib install "Servo"
arduino-cli lib install "Adafruit PWM Servo Driver Library"
```

### Compile and Upload

```bash
# For Arduino Mega
arduino-cli compile --fqbn arduino:avr:mega robotic_arm_5motor_/robotic_arm_5motor_.ino
arduino-cli upload -p COM3 --fqbn arduino:avr:mega robotic_arm_5motor_/robotic_arm_5motor_.ino

# For Arduino Uno
arduino-cli compile --fqbn arduino:avr:uno robotic_arm_5motor_/robotic_arm_5motor_.ino
arduino-cli upload -p COM3 --fqbn arduino:avr:uno robotic_arm_5motor_/robotic_arm_5motor_.ino
```

**Important:** Disconnect the dashboard serial connection before uploading — the browser holds the COM port lock.

## Serial Protocol

Baud rate: **115200**

### Commands (Dashboard to Arduino)

| Command | Response | Description |
|---------|----------|-------------|
| `A:s,e,wp,wr,g\n` | `OK:s,e,wp,wr,g` | Set all 5 servo angles (0-180) |
| `Q\n` | `POS:s,e,wp,wr,g` | Query current positions |
| `HOME\n` | `HOMED` | Move all servos to 90 degrees |
| `MODE:PWM\n` | `MODE:PWM` | Switch to direct PWM driver |
| `MODE:I2C\n` | `MODE:I2C` or `ERR:PCA9685_NOT_FOUND` | Switch to PCA9685 I2C driver |
| `MODE?\n` | `MODE:PWM` or `MODE:I2C` | Query current driver mode |

### Telemetry (Arduino to Dashboard, 20 Hz)

```
S:<shoulder>,E:<elbow>,WR:<wristRoll>,WP:<wristPitch>,G:<gripper>
```

When an Xbox controller is connected, an additional line is sent:

```
CTRL:LX:<val>,LY:<val>,RX:<val>,RY:<val>,LT:<val>,RT:<val>,A:<0|1>,B:<0|1>,X:<0|1>,Y:<0|1>
```

### Boot Messages

```
5DOF-ARM-READY
PCA9685:OK          (or PCA9685:NOT_FOUND)
MODE:PWM            (default mode)
HOMED
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/thecrazyphysicist369/robo_painter.git
cd robo_painter
```

### 2. Flash the Arduino

Install the required libraries (see [Arduino Firmware](#arduino-firmware)), then compile and upload.

### 3. Start the Dashboard

```bash
cd dashboard
npm install
npm run dev
```

### 4. Connect

1. Open `http://localhost:5173` in Chrome or Edge
2. Click **Connect Serial** and select the Arduino COM port
3. The 3D arm, motor cards, and telemetry update live
4. Use jog buttons, waypoints, or the Xbox controller to move the arm

## Controller Mapping

| Input | Motor | Direction |
|-------|-------|-----------|
| Left Stick Y | Shoulder | Up / Down |
| Left Stick X | Elbow | Extend / Retract |
| Right Stick Y | Wrist Pitch | Tilt Up / Down |
| Right Stick X | Wrist Roll | Rotate |
| Left Trigger (LT) | Gripper | Close |
| Right Trigger (RT) | Gripper | Open |

Movement speed: 2 deg/cycle (normal), 4 deg/cycle (triggers). Deadzone: 7500. Update rate: ~15ms.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Servos jitter/twitch | Check common ground. Add 100-470 uF capacitor across servo power. Use 5V/5A PSU. Try PCA9685 I2C mode to avoid Arduino timer conflicts. |
| Controller not detected | Ensure USB Host Shield is seated. Use wired Xbox 360 controller. Check serial output for `ERR:USB_HOST_FAIL`. |
| Servos not moving from dashboard | Check serial log for `[TX]` lines. Verify firmware is up to date. Use **Test TX** button to diagnose. |
| Jog buttons unresponsive | Ensure serial is connected (green indicator). Check browser console for `[Jog] sendAngles returned false`. |
| Upload fails | Disconnect dashboard serial first. Remove USB Host Shield during upload if needed. |
| M2 (Elbow) jittery under load | Pin 5 shares Timer 0 on Uno — can cause PWM conflicts. Switch to I2C mode with PCA9685 to resolve. |
| I2C toggle grayed out | PCA9685 not detected at boot. Check I2C wiring (A4/SDA, A5/SCL) and address `0x40`. |

## Project Structure

```
robo_painter/
├── robotic_arm_5motor_/
│   └── robotic_arm_5motor_.ino    # Arduino firmware (PWM + I2C dual mode)
├── dashboard/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx      # Main layout, state management, jog/reset/mode toggle
│   │   │   ├── MotorCard.jsx      # Per-motor card with angle, velocity, sparkline, jog buttons
│   │   │   ├── RoboticArm.jsx     # 3D arm model (Three.js)
│   │   │   ├── WorkspaceVisualizer.jsx  # Convex hull, waypoints, transform gizmos
│   │   │   ├── SerialConnector.jsx      # Connect/disconnect button
│   │   │   └── XboxControllerVisual.jsx # Live controller graphic
│   │   ├── hooks/
│   │   │   ├── useSerial.js       # Web Serial: telemetry, commands, sendAndWait, mode switching
│   │   │   └── useCalibration.js  # In-browser FK, convex hull, workspace generation
│   │   └── utils/
│   │       └── forwardKinematics.js
│   ├── package.json
│   └── vite.config.js
├── backend/                        # Legacy Python backend (deprecated, not used by dashboard)
├── robo_painter_project_context.md # Detailed project context and roadmap
├── start_dashboard.bat             # Quick-start script for Windows
└── README.md
```

## License

MIT License. See [LICENSE](LICENSE) or the license text below.

```
MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Acknowledgments

- **USB Host Shield Library 2.0** by Oleg Mazurov and Circuits@Home
- **Adafruit PWM Servo Driver Library** by Adafruit
- **Three.js**, **React Three Fiber**, **Drei** communities
- Arduino Community for extensive servo control resources
