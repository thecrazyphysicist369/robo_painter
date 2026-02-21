/*
 * Universal USB Controller Diagnostic Tool
 * Works with Xbox-style controllers, clones, and generic USB gamepads
 * 
 * This will detect your Red Gear controller and show all inputs
 * 
 * Hardware:
 * - USB Host Shield on Arduino
 * - Red Gear controller dongle plugged into USB Host Shield
 * 
 * Library: USB Host Shield Library 2.0
 */

#include <hidboot.h>
#include <usbhub.h>
#include <hiduniversal.h>

// USB and HID setup for generic controllers
USB Usb;
USBHub Hub(&Usb);
HIDUniversal Hid(&Usb);

class JoystickEvents : public HIDReportParser {
  protected:
    void Parse(USBHID *hid, bool is_rpt_id, uint8_t len, uint8_t *buf);
};

void JoystickEvents::Parse(USBHID *hid, bool is_rpt_id, uint8_t len, uint8_t *buf) {
  // Print raw data from controller
  Serial.print("Data[");
  Serial.print(len);
  Serial.print("]: ");
  
  for (uint8_t i = 0; i < len; i++) {
    if (buf[i] < 16) Serial.print("0");
    Serial.print(buf[i], HEX);
    Serial.print(" ");
  }
  Serial.println();
  
  // Decode common button patterns
  if (len >= 6) {
    // Byte 0-1: Usually buttons
    uint16_t buttons = buf[0] | (buf[1] << 8);
    
    // Byte 2-5: Usually joystick axes
    uint8_t leftX = buf[2];
    uint8_t leftY = buf[3];
    uint8_t rightX = buf[4];
    uint8_t rightY = buf[5];
    
    // Print decoded values
    Serial.print("Buttons: ");
    Serial.print(buttons, BIN);
    Serial.print(" | LX: ");
    Serial.print(leftX);
    Serial.print(" LY: ");
    Serial.print(leftY);
    Serial.print(" | RX: ");
    Serial.print(rightX);
    Serial.print(" RY: ");
    Serial.println(rightY);
    
    // Detect joystick movements
    if (leftY < 100) Serial.println(">>> LEFT STICK UP");
    if (leftY > 150) Serial.println(">>> LEFT STICK DOWN");
    if (leftX < 100) Serial.println(">>> LEFT STICK LEFT");
    if (leftX > 150) Serial.println(">>> LEFT STICK RIGHT");
    
    if (rightY < 100) Serial.println(">>> RIGHT STICK UP");
    if (rightY > 150) Serial.println(">>> RIGHT STICK DOWN");
    if (rightX < 100) Serial.println(">>> RIGHT STICK LEFT");
    if (rightX > 150) Serial.println(">>> RIGHT STICK RIGHT");
    
    // Detect button presses (common bit positions)
    if (buttons & 0x0001) Serial.println(">>> BUTTON A (or 1)");
    if (buttons & 0x0002) Serial.println(">>> BUTTON B (or 2)");
    if (buttons & 0x0004) Serial.println(">>> BUTTON X (or 3)");
    if (buttons & 0x0008) Serial.println(">>> BUTTON Y (or 4)");
    if (buttons & 0x0010) Serial.println(">>> LEFT BUMPER");
    if (buttons & 0x0020) Serial.println(">>> RIGHT BUMPER");
    if (buttons & 0x0040) Serial.println(">>> BACK/SELECT");
    if (buttons & 0x0080) Serial.println(">>> START");
    if (buttons & 0x0100) Serial.println(">>> LEFT STICK PRESS");
    if (buttons & 0x0200) Serial.println(">>> RIGHT STICK PRESS");
    
    Serial.println("---");
  }
}

JoystickEvents JoyEvents;

void setup() {
  Serial.begin(115200);
  while (!Serial);
  
  Serial.println("===========================================");
  Serial.println("Universal USB Controller Detector");
  Serial.println("Red Gear & Clone Controller Compatible");
  Serial.println("===========================================\n");
  
  if (Usb.Init() == -1) {
    Serial.println("ERROR: USB Host Shield not working!");
    Serial.println("Check connections and restart.");
    while (1);
  }
  
  Serial.println("✓ USB Host Shield initialized");
  Serial.println("\nPlug in your Red Gear dongle now...");
  Serial.println("Then turn on your controller.\n");
  
  delay(200);
}

void loop() {
  Usb.Task();
  
  // Check if a HID device is connected
  if (Hid.isReady()) {
    static bool setupDone = false;
    
    if (!setupDone) {
      Serial.println("\n✓✓✓ CONTROLLER DETECTED! ✓✓✓");
      Serial.println("Press buttons and move joysticks...\n");
      
      // Set up the report parser
      Hid.SetReportParser(0, &JoyEvents);
      setupDone = true;
    }
  } else {
    static unsigned long lastMsg = 0;
    if (millis() - lastMsg > 3000) {
      Serial.println("Waiting for controller dongle...");
      lastMsg = millis();
    }
  }
}
