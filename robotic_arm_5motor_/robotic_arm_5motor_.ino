/*
 * 5-DOF Robotic Arm Controller with Xbox Controller
 * FIXED - Avoids USB Host Shield pin conflicts
 * 
 * Hardware Setup:
 * - 5 Servos connected to Arduino pins
 * - USB Host Shield connected to Arduino
 * - Xbox controller (wired) connected to USB Host Shield
 * - External 5V power supply for servos (with common ground!)
 * 
 * IMPORTANT: USB Host Shield uses pins 10, 11, 12, 13 for SPI
 * We use pins 3, 5, 6, 7, 9 to avoid conflicts
 * 
 * Servo Pin Assignments:
 * Pin 3  - Shoulder joint - LEFT JOYSTICK UP/DOWN
 * Pin 5  - Elbow joint - LEFT JOYSTICK LEFT/RIGHT
 * Pin 6  - Wrist Pitch (up/down) - RIGHT JOYSTICK UP/DOWN
 * Pin 7  - Wrist Roll (rotation) - RIGHT JOYSTICK LEFT/RIGHT
 * Pin 9  - Gripper/Clamp - LEFT TRIGGER (close) / RIGHT TRIGGER (open)
 * 
 * Controls:
 * - Left Joystick Y-axis (UP/DOWN): Shoulder joint
 * - Left Joystick X-axis (LEFT/RIGHT): Elbow joint
 * - Right Joystick Y-axis (UP/DOWN): Wrist pitch
 * - Right Joystick X-axis (LEFT/RIGHT): Wrist roll
 * - Left Trigger (LT): Close gripper
 * - Right Trigger (RT): Open gripper
 * 
 * Required Libraries:
 * - Servo library (built-in)
 * - USB Host Shield Library 2.0
 */

#include <Servo.h>
#include <XBOXUSB.h>

// USB and Xbox controller setup
USB Usb;
XBOXUSB Xbox(&Usb);

// Servo objects for 5 motors
Servo servoShoulder;   // Shoulder joint (joint 1)
Servo servoElbow;      // Elbow joint (joint 2)
Servo servoWristPitch; // Wrist pitch - up/down (joint 3)
Servo servoWristRoll;  // Wrist roll - rotation (joint 4)
Servo servoGripper;    // Gripper/clamp (joint 5)

// Servo pin assignments - AVOID pins 10, 11, 12, 13 (used by USB Host Shield)
const int pinShoulder = 3;
const int pinElbow = 5;
const int pinWristPitch = 6;
const int pinWristRoll = 7;
const int pinGripper = 9;

// Servo position variables (all start at center/neutral)
int posShoulder = 90;
int posElbow = 90;
int posWristPitch = 90;
int posWristRoll = 90;
int posGripper = 90;  // 90 = neutral

// Servo limits
const int minPos = 0;
const int maxPos = 180;

// Gripper limits (adjust based on your gripper mechanism)
const int gripperOpen = 0;
const int gripperClosed = 180;

// Joystick deadzone to prevent drift
const int deadzone = 7500;

// Speed control (degrees of movement per update)
const int normalSpeed = 2;
const int fastSpeed = 4;

// Timing for status display
unsigned long lastStatusPrint = 0;
const unsigned long statusInterval = 1000; // Print every 1 second

// Timing for Web Dashboard compact serial (S:,E:,WR:,WP:,G: format)
unsigned long lastCompactPrint = 0;
const unsigned long compactInterval = 50;  // 20 Hz for smooth 3D viz

void setup() {
  Serial.begin(115200);
  
  Serial.println("\n========================================");
  Serial.println("5-Motor Robotic Arm Controller");
  Serial.println("========================================");
  
  // Initialize USB Host Shield FIRST, before servos
  if (Usb.Init() == -1) {
    Serial.println("ERROR: USB Host Shield initialization failed!");
    while (1); // Halt
  }
  Serial.println("✓ USB Host Shield initialized");
  
  delay(200);  // Small delay after USB init
  
  // Attach all 5 servos AFTER USB shield initialization
  servoShoulder.attach(pinShoulder);
  servoElbow.attach(pinElbow);
  servoWristPitch.attach(pinWristPitch);
  servoWristRoll.attach(pinWristRoll);
  servoGripper.attach(pinGripper);
  
  Serial.println("✓ All 5 servos attached");
  
  // Set all servos to neutral/center position
  servoShoulder.write(posShoulder);
  servoElbow.write(posElbow);
  servoWristPitch.write(posWristPitch);
  servoWristRoll.write(posWristRoll);
  servoGripper.write(posGripper);
  
  Serial.println("✓ All servos initialized to 90° (center position)");
  Serial.println("\nServo Pin Assignments:");
  Serial.println("  Pin 3 - Shoulder joint");
  Serial.println("  Pin 5 - Elbow joint");
  Serial.println("  Pin 6 - Wrist Pitch");
  Serial.println("  Pin 7 - Wrist Roll");
  Serial.println("  Pin 9 - Gripper/Clamp");
  Serial.println("\nController Mapping:");
  Serial.println("  Left Stick UP/DOWN    → Shoulder joint");
  Serial.println("  Left Stick LEFT/RIGHT → Elbow joint");
  Serial.println("  Right Stick UP/DOWN   → Wrist pitch");
  Serial.println("  Right Stick LEFT/RIGHT→ Wrist roll");
  Serial.println("  LT (Left Trigger)     → Close gripper");
  Serial.println("  RT (Right Trigger)    → Open gripper");
  Serial.println("\nWaiting for Xbox controller...\n");
  
  delay(500);
}

void loop() {
  Usb.Task();  // Process USB tasks
  
  if (Xbox.Xbox360Connected) {
    
    // ===== LEFT JOYSTICK - Shoulder & Elbow =====
    int leftX = Xbox.getAnalogHat(LeftHatX);
    int leftY = Xbox.getAnalogHat(LeftHatY);
    
    // Shoulder joint (up/down) - Left joystick Y-axis
    if (abs(leftY) > deadzone) {
      int movement = map(leftY, -32768, 32767, normalSpeed, -normalSpeed);
      posShoulder += movement;
      posShoulder = constrain(posShoulder, minPos, maxPos);
      servoShoulder.write(posShoulder);
    }
    
    // Elbow joint (left/right) - Left joystick X-axis
    if (abs(leftX) > deadzone) {
      int movement = map(leftX, -32768, 32767, -normalSpeed, normalSpeed);
      posElbow += movement;
      posElbow = constrain(posElbow, minPos, maxPos);
      servoElbow.write(posElbow);
    }
    
    // ===== RIGHT JOYSTICK - Wrist Pitch & Wrist Roll =====
    int rightX = Xbox.getAnalogHat(RightHatX);
    int rightY = Xbox.getAnalogHat(RightHatY);
    
    // Wrist pitch (up/down) - Right joystick Y-axis
    if (abs(rightY) > deadzone) {
      int movement = map(rightY, -32768, 32767, normalSpeed, -normalSpeed);
      posWristPitch += movement;
      posWristPitch = constrain(posWristPitch, minPos, maxPos);
      servoWristPitch.write(posWristPitch);
    }
    
    // Wrist roll (rotation) - Right joystick X-axis
    if (abs(rightX) > deadzone) {
      int movement = map(rightX, -32768, 32767, -normalSpeed, normalSpeed);
      posWristRoll += movement;
      posWristRoll = constrain(posWristRoll, minPos, maxPos);
      servoWristRoll.write(posWristRoll);
    }
    
    // ===== TRIGGERS - Gripper Control =====
    // Left Trigger (LT) - Close gripper
    uint8_t leftTrigger = Xbox.getButtonPress(L2);
    if (leftTrigger > 20) {  // Threshold to avoid noise
      int movement = map(leftTrigger, 0, 255, 0, fastSpeed);
      posGripper += movement;
      posGripper = constrain(posGripper, gripperOpen, gripperClosed);
      servoGripper.write(posGripper);
    }
    
    // Right Trigger (RT) - Open gripper
    uint8_t rightTrigger = Xbox.getButtonPress(R2);
    if (rightTrigger > 20) {  // Threshold to avoid noise
      int movement = map(rightTrigger, 0, 255, 0, fastSpeed);
      posGripper -= movement;
      posGripper = constrain(posGripper, gripperOpen, gripperClosed);
      servoGripper.write(posGripper);
    }
    
    // ===== COMPACT SERIAL FOR WEB DASHBOARD - High rate (20 Hz) =====
    // Format: S:<angle>,E:<angle>,WR:<angle>,WP:<angle>,G:<angle>\n
    //         CTRL:LX:<val>,LY:<val>,RX:<val>,RY:<val>,LT:<val>,RT:<val>,A:<0|1>,B:<0|1>,X:<0|1>,Y:<0|1>\n
    if (millis() - lastCompactPrint >= compactInterval) {
      Serial.print("S:");
      Serial.print(posShoulder);
      Serial.print(",E:");
      Serial.print(posElbow);
      Serial.print(",WR:");
      Serial.print(posWristRoll);
      Serial.print(",WP:");
      Serial.print(posWristPitch);
      Serial.print(",G:");
      Serial.println(posGripper);

      // Controller state for dashboard (sticks -100..100, triggers 0..100, buttons 0/1)
      int lx = map(Xbox.getAnalogHat(LeftHatX), -32768, 32767, -100, 100);
      int ly = map(Xbox.getAnalogHat(LeftHatY), -32768, 32767, -100, 100);
      int rx = map(Xbox.getAnalogHat(RightHatX), -32768, 32767, -100, 100);
      int ry = map(Xbox.getAnalogHat(RightHatY), -32768, 32767, -100, 100);
      int lt = map(Xbox.getButtonPress(L2), 0, 255, 0, 100);
      int rt = map(Xbox.getButtonPress(R2), 0, 255, 0, 100);
      int ba = Xbox.getButtonPress(A) ? 1 : 0;
      int bb = Xbox.getButtonPress(B) ? 1 : 0;
      int bx = Xbox.getButtonPress(X) ? 1 : 0;
      int by = Xbox.getButtonPress(Y) ? 1 : 0;
      Serial.print("CTRL:LX:");
      Serial.print(lx);
      Serial.print(",LY:");
      Serial.print(ly);
      Serial.print(",RX:");
      Serial.print(rx);
      Serial.print(",RY:");
      Serial.print(ry);
      Serial.print(",LT:");
      Serial.print(lt);
      Serial.print(",RT:");
      Serial.print(rt);
      Serial.print(",A:");
      Serial.print(ba);
      Serial.print(",B:");
      Serial.print(bb);
      Serial.print(",X:");
      Serial.print(bx);
      Serial.print(",Y:");
      Serial.println(by);

      lastCompactPrint = millis();
    }

    // ===== STATUS DISPLAY - Every 1 second =====
    if (millis() - lastStatusPrint >= statusInterval) {
      Serial.println("\n========== SERVO POSITIONS ==========");
      
      Serial.print("Shoulder Joint:    ");
      Serial.print(posShoulder);
      Serial.println("°");
      
      Serial.print("Elbow Joint:       ");
      Serial.print(posElbow);
      Serial.println("°");
      
      Serial.print("Wrist Pitch:       ");
      Serial.print(posWristPitch);
      Serial.println("°");
      
      Serial.print("Wrist Roll:        ");
      Serial.print(posWristRoll);
      Serial.println("°");
      
      Serial.print("Gripper/Clamp:     ");
      Serial.print(posGripper);
      Serial.print("° (");
      if (posGripper > 120) {
        Serial.print("CLOSED");
      } else if (posGripper < 60) {
        Serial.print("OPEN");
      } else {
        Serial.print("PARTIAL");
      }
      Serial.println(")");
      
      Serial.println("====================================\n");
      
      lastStatusPrint = millis();
    }
    
    delay(15);  // Small delay for smooth movement
    
  } else {
    // Controller not connected
    static unsigned long lastWaitMsg = 0;
    if (millis() - lastWaitMsg > 2000) {
      Serial.println("Waiting for Xbox controller connection...");
      lastWaitMsg = millis();
    }
  }
}
