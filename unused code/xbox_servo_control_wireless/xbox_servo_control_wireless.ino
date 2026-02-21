/*
 * Xbox Controller Servo Control via USB Host Shield - WITH PAIRING SUPPORT
 * 
 * Hardware Setup:
 * - Servo connected to Pin 3 (PWM)
 * - USB Host Shield connected to Arduino
 * - Xbox 360 Wireless Receiver connected to USB Host Shield
 * - Xbox 360 Wireless Controller
 * 
 * Required Libraries:
 * - Servo library (built-in)
 * - USB Host Shield Library 2.0 (install from Library Manager)
 * 
 * PAIRING INSTRUCTIONS:
 * 1. Upload this code
 * 2. Open Serial Monitor (115200 baud)
 * 3. Power on your Xbox controller (hold Xbox button)
 * 4. Wait for "Xbox Wireless Receiver Connected" message
 * 5. Controller should auto-pair (LED will go solid)
 */

#include <Servo.h>
#include <XBOXRECV.h>  // For wireless receiver instead of XBOXUSB

// USB and Xbox wireless receiver setup
USB Usb;
XBOXRECV Xbox(&Usb);  // Xbox 360 Wireless Receiver

// Servo setup
Servo myServo;
const int servoPin = 3;

// Servo position variables
int servoPosition = 90;  // Start at center position (90 degrees)
const int minPosition = 0;
const int maxPosition = 180;

// Joystick deadzone to prevent drift
const int deadzone = 7500;  // Adjust if needed (range is -32768 to 32767)

// Status tracking
bool wasConnected = false;

void setup() {
  Serial.begin(115200);
  while (!Serial); // Wait for serial port to connect
  delay(200);
  
  Serial.println("=================================");
  Serial.println("Xbox Wireless Servo Controller");
  Serial.println("=================================");
  
  // Initialize USB Host Shield
  if (Usb.Init() == -1) {
    Serial.println("ERROR: USB Host Shield initialization failed!");
    Serial.println("Check:");
    Serial.println("- Shield is properly seated on Arduino");
    Serial.println("- Power connections are good");
    while (1); // Halt
  }
  
  Serial.println("✓ USB Host Shield initialized");
  
  // Attach servo to pin 3
  myServo.attach(servoPin);
  myServo.write(servoPosition);  // Set to center position
  Serial.println("✓ Servo initialized at 90 degrees");
  
  Serial.println("\nWaiting for Xbox 360 Wireless Receiver...");
  Serial.println("If receiver is connected, power on your controller now.");
  Serial.println("(Hold Xbox button for 3 seconds)");
}

void loop() {
  Usb.Task();  // Process USB tasks
  
  // Check if receiver is connected
  if (Xbox.XboxReceiverConnected) {
    
    // Check if controller is connected (check controller 0)
    if (Xbox.Xbox360Connected[0]) {
      
      // Print connection message once
      if (!wasConnected) {
        Serial.println("\n✓✓✓ CONTROLLER PAIRED! ✓✓✓");
        Serial.println("Move left joystick UP/DOWN to control servo");
        Serial.println("------------------------------------------");
        wasConnected = true;
      }
      
      // Read left joystick Y-axis value (-32768 to 32767)
      int leftY = Xbox.getAnalogHat(LeftHatY, 0);  // 0 = controller #1
      
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
      
    } else {
      // Controller disconnected
      if (wasConnected) {
        Serial.println("\n✗ Controller disconnected");
        Serial.println("Power on controller to reconnect...");
        wasConnected = false;
      }
    }
    
  } else {
    // Receiver not detected
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint > 2000) {  // Print every 2 seconds
      Serial.println("Waiting for Xbox 360 Wireless Receiver...");
      Serial.println("Check: Is the receiver plugged into USB Host Shield?");
      lastPrint = millis();
    }
  }
}
