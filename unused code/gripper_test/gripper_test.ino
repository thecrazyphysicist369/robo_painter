/*
 * Gripper Trigger Test - Simplified
 * 
 * This focuses only on testing the gripper with triggers
 * Other 4 servos work, so we isolate just the gripper control
 */

#include <Servo.h>
#include <XBOXUSB.h>

USB Usb;
XBOXUSB Xbox(&Usb);

Servo servoGripper;
const int pinGripper = 9;
int posGripper = 90;

void setup() {
  Serial.begin(115200);
  
  if (Usb.Init() == -1) {
    Serial.println("USB failed!");
    while (1);
  }
  
  servoGripper.attach(pinGripper);
  servoGripper.write(posGripper);
  
  Serial.println("Gripper Test Ready");
  Serial.println("LT = Close, RT = Open\n");
}

void loop() {
  Usb.Task();
  
  if (Xbox.Xbox360Connected) {
    
    // Read trigger values (0-255)
    uint8_t leftTrigger = Xbox.getButtonPress(L2);
    uint8_t rightTrigger = Xbox.getButtonPress(R2);
    
    // Print trigger values for debugging
    if (leftTrigger > 0 || rightTrigger > 0) {
      Serial.print("LT: ");
      Serial.print(leftTrigger);
      Serial.print(" | RT: ");
      Serial.print(rightTrigger);
      Serial.print(" | Gripper: ");
      Serial.println(posGripper);
    }
    
    // CLOSE gripper - Left Trigger (try lower threshold)
    if (leftTrigger > 10) {  // Reduced from 20 to 10
      posGripper += 2;
      posGripper = constrain(posGripper, 0, 180);
      servoGripper.write(posGripper);
      Serial.println(">>> CLOSING");
    }
    
    // OPEN gripper - Right Trigger
    if (rightTrigger > 10) {  // Reduced from 20 to 10
      posGripper -= 2;
      posGripper = constrain(posGripper, 0, 180);
      servoGripper.write(posGripper);
      Serial.println(">>> OPENING");
    }
    
    delay(50);
  }
}
