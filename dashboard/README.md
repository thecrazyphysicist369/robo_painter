# Robotic Arm Control Dashboard

React + Three.js dashboard for real-time visualization and telemetry of the 5-DOF robotic arm. Uses the **Web Serial API** to read data from the Arduino (Chrome/Edge, HTTPS or localhost).

## Quick start

```bash
cd dashboard
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). Click **Connect Serial**, choose your Arduino COM port, and ensure the Arduino is sending the compact format at 115200 baud.

## Arduino output format

The dashboard parses lines in this format (one line per update):

```
S:<angle>,E:<angle>,WR:<angle>,WP:<angle>,G:<angle>
```

Example: `S:90,E:75,WR:110,WP:120,G:45`

This is printed by the sketch every 50 ms when the Xbox controller is connected. Re-flash `robotic_arm_5motor_.ino` if you don’t see this format.

## Stack

- **React** + **Vite** + **Tailwind CSS**
- **Three.js** via `@react-three/fiber` and `@react-three/drei`
- **Web Serial API** for COM port access
- **Lucide React** for icons

## Layout

- **Header:** System status (Online/Offline) with pulse, Serial connect/disconnect.
- **Left sidebar:** Forward kinematics — End Effector (X, Y, Z) and Orientation (Roll, Pitch, Yaw).
- **Center:** 3D view of the arm (Shoulder, Elbow, Wrist Rotation, Wrist Pitch, Gripper); drag to orbit.
- **Right sidebar:** Five motor cards with angle, angular velocity (ω), and sparkline.
- **Footer:** Terminal-style log of raw serial lines.

## Browser support

Web Serial is supported in **Chrome** and **Edge**. Use **HTTPS** or **localhost** for the API to be available.
