/*
 * USB Keyboard Servo Control
 * Control servo on Pin 3 using keyboard arrow keys
 * 
 * Hardware:
 * - USB Host Shield on Arduino
 * - USB Keyboard plugged into USB Host Shield
 * - Servo motor connected to Pin 3 (PWM)
 * 
 * Controls:
 * - UP ARROW: Rotate servo clockwise (increase angle)
 * - DOWN ARROW: Rotate servo counter-clockwise (decrease angle)
 * 
 * Library: USB Host Shield Library 2.0
 */

#include <Servo.h>
#include <hidboot.h>
#include <usbhub.h>

#ifdef dobogusinclude
#include <spi4teensy3.h>
#endif
#include <SPI.h>

// Servo setup
Servo myServo;
const int servoPin = 3;
int servoPosition = 90;  // Start at center (90 degrees)
const int minPosition = 0;
const int maxPosition = 180;
const int stepSize = 5;  // How many degrees to move per key press

class KbdRptParser : public KeyboardReportParser
{
  protected:
    void OnKeyDown(uint8_t mod, uint8_t key);
    void OnKeyUp(uint8_t mod, uint8_t key);
};

void KbdRptParser::OnKeyDown(uint8_t mod, uint8_t key)
{
  uint8_t c = OemToAscii(mod, key);

  // Print regular keys
  if (c) {
    Serial.print("Key Pressed: ");
    Serial.print((char)c);
    Serial.print(" (ASCII: ");
    Serial.print(c);
    Serial.println(")");
  }
  
  // Arrow keys control servo
  switch (key) {
    case 0x52: // UP ARROW
      Serial.println(">>> UP ARROW - Moving servo CLOCKWISE");
      servoPosition += stepSize;
      servoPosition = constrain(servoPosition, minPosition, maxPosition);
      myServo.write(servoPosition);
      Serial.print("Servo Position: ");
      Serial.print(servoPosition);
      Serial.println(" degrees");
      break;
      
    case 0x51: // DOWN ARROW
      Serial.println(">>> DOWN ARROW - Moving servo COUNTER-CLOCKWISE");
      servoPosition -= stepSize;
      servoPosition = constrain(servoPosition, minPosition, maxPosition);
      myServo.write(servoPosition);
      Serial.print("Servo Position: ");
      Serial.print(servoPosition);
      Serial.println(" degrees");
      break;
      
    case 0x4F: // RIGHT ARROW
      Serial.println("Key Pressed: RIGHT ARROW");
      break;
      
    case 0x50: // LEFT ARROW
      Serial.println("Key Pressed: LEFT ARROW");
      break;
      
    case 0x2A: 
      Serial.println("Key Pressed: BACKSPACE"); 
      break;
      
    case 0x2B: 
      Serial.println("Key Pressed: TAB"); 
      break;
      
    case 0x28: 
      Serial.println("Key Pressed: ENTER"); 
      break;
      
    case 0x29: 
      Serial.println("Key Pressed: ESC"); 
      break;
      
    case 0x2C: 
      Serial.println("Key Pressed: SPACE"); 
      break;
  }
}

void KbdRptParser::OnKeyUp(uint8_t mod, uint8_t key)
{
  // Optional: Print key release events
  // Uncomment if you want to see when keys are released
  /*
  uint8_t c = OemToAscii(mod, key);
  if (c) {
    Serial.print("Key Released: ");
    Serial.println((char)c);
  }
  */
}

USB Usb;
USBHub Hub(&Usb);
HIDBoot<USB_HID_PROTOCOL_KEYBOARD> HidKeyboard(&Usb);

KbdRptParser Prs;

void setup()
{
  Serial.begin(115200);
  #if !defined(__MIPSEL__)
    while (!Serial);
  #endif
  
  Serial.println("\n=====================================");
  Serial.println("Keyboard Servo Controller");
  Serial.println("=====================================");

  if (Usb.Init() == -1) {
    Serial.println("\nERROR: USB Host Shield failed!");
    while (1);
  }
  
  Serial.println("✓ USB Host Shield initialized");
  
  // Initialize servo
  myServo.attach(servoPin);
  myServo.write(servoPosition);
  Serial.print("✓ Servo initialized at ");
  Serial.print(servoPosition);
  Serial.println(" degrees (Pin 3)");
  
  Serial.println("\nControls:");
  Serial.println("  UP ARROW    → Servo clockwise (+5 degrees)");
  Serial.println("  DOWN ARROW  → Servo counter-clockwise (-5 degrees)");
  Serial.println("\nPlug in your USB keyboard and start pressing keys!\n");

  delay(200);

  HidKeyboard.SetReportParser(0, &Prs);
}

void loop()
{
  Usb.Task();
  
  static bool keyboardDetected = false;
  
  if (HidKeyboard.isReady() && !keyboardDetected) {
    Serial.println("\n*** KEYBOARD CONNECTED! ***");
    Serial.println("Use UP/DOWN arrows to control servo\n");
    keyboardDetected = true;
  }
  
  if (!HidKeyboard.isReady() && keyboardDetected) {
    Serial.println("\n*** KEYBOARD DISCONNECTED ***\n");
    keyboardDetected = false;
  }
}
