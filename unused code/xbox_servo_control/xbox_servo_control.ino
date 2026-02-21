/*
 * Xbox Controller Servo Control via USB Host Shield
 * 
 * Hardware Setup:
 * - Servo connected to Pin 3 (PWM)
 * - USB Host Shield connected to Arduino
 * - Xbox controller connected to USB Host Shield
 * 
 * Required Libraries:
 * - Servo library (built-in)
 * - USB Host Shield Library 2.0 (install from Library Manager)
 */

#include <Servo.h>
#include <XBOXUSB.h>

// USB and Xbox controller setup
USB Usb;
XBOXUSB Xbox(&Usb);

// Servo setup
Servo myServo;
const int servoPin = 3;

// Servo position variables
int servoPosition = 90;  // Start at center position (90 degrees)
const int minPosition = 0;
const int maxPosition = 180;

// Joystick deadzone to prevent drift
const int deadzone = 7500;  // Adjust if needed (range is -32768 to 32767)

void setup() {
  Serial.begin(115200);
  
  // Initialize USB Host Shield
  if (Usb.Init() == -1) {
    Serial.println("USB Host Shield initialization failed!");
    while (1); // Halt
  }
  Serial.println("USB Host Shield initialized");
  
  // Attach servo to pin 3
  myServo.attach(servoPin);
  myServo.write(servoPosition);  // Set to center position
  
  Serial.println("Waiting for Xbox controller...");
}

void loop() {
  Usb.Task();  // Process USB tasks
  
  if (Xbox.Xbox360Connected) {
    // Read left joystick Y-axis value (-32768 to 32767)
    int leftY = Xbox.getAnalogHat(LeftHatY);
    
    // Apply deadzone - ignore small movements
    if (abs(leftY) > deadzone) {
      // Map joystick value to servo movement
      // Joystick UP (negative values) -> Clockwise (increase angle)
      // Joystick DOWN (positive values) -> Counter-clockwise (decrease angle)
      
      // Invert the Y-axis (UP is negative in Xbox controller)
      int movement = map(leftY, -32768, 32767, 3, -3);
      
      // Update servo position
      servoPosition += movement;
      
      // Constrain to servo limits
      servoPosition = constrain(servoPosition, minPosition, maxPosition);
      
      // Move the servo
      myServo.write(servoPosition);
      
      // Debug output
      Serial.print("Joystick Y: ");
      Serial.print(leftY);
      Serial.print(" | Servo Position: ");
      Serial.println(servoPosition);
    }
    
    delay(15);  // Small delay for smooth movement
  }
}
