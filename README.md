# robo_painter
1 motor at shoulder
1 motor at elbow
2 motors at wrist
1 motor for clamp

So 5 motors total, NO base rotation motor. Let me redo it:Created a file, read a fileCreating corrected 5-servo robotic arm controller - shoulder, elbow, 2 wrist joints, and gripper (no base motor)robotic_arm_5motor_corrected.inoPresented fileDonePerfect! Now it's correct for your 5-motor setup! 🦾
Corrected 5-Motor Configuration:
MotorPinJointControlShoulderPin 3Joint 1Left Joystick UP/DOWNElbowPin 5Joint 2Left Joystick LEFT/RIGHTWrist PitchPin 6Joint 3Right Joystick UP/DOWNWrist RollPin 9Joint 4Right Joystick LEFT/RIGHTGripperPin 10ClampLT (close) / RT (open)
Controller Layout:
LEFT JOYSTICK:
  ↑ ↓ Shoulder joint (up/down)
  ← → Elbow joint (left/right)

RIGHT JOYSTICK:
  ↑ ↓ Wrist pitch (up/down)
  ← → Wrist roll (rotation)

TRIGGERS:
  LT (L2) → Close gripper
  RT (R2) → Open gripper
Serial Output (every 1 second):
========== SERVO POSITIONS ==========
Shoulder Joint:    90°
Elbow Joint:       75°
Wrist Pitch:       120°
Wrist Roll:        110°
Gripper/Clamp:     150° (CLOSED)
====================================
Wiring:
Pin 3  → Shoulder servo signal
Pin 5  → Elbow servo signal
Pin 6  → Wrist Pitch servo signal
Pin 9  → Wrist Roll servo signal
Pin 10 → Gripper servo signal

All servo power (RED) → External 5V (+)
All servo ground (BROWN/BLACK) → External 5V (-) AND Arduino GND
