/*
 * Red Gear Controller Diagnostic - Simplified Version
 * Works with clone controllers via USB HID
 * 
 * Hardware:
 * - USB Host Shield on Arduino
 * - Red Gear controller dongle in USB Host Shield
 * 
 * Library: USB Host Shield Library 2.0
 */

#include <usbhid.h>
#include <hiduniversal.h>
#include <usbhub.h>

USB Usb;
USBHub Hub(&Usb);
HIDUniversal Hid(&Usb);

class JoystickParser : public HIDReportParser {
  public:
    void Parse(USBHID *hid, bool is_rpt_id, uint8_t len, uint8_t *buf);
};

void JoystickParser::Parse(USBHID *hid, bool is_rpt_id, uint8_t len, uint8_t *buf) {
  // Print timestamp
  Serial.print(millis());
  Serial.print(" ms | ");
  
  // Print raw HEX data
  Serial.print("RAW[");
  Serial.print(len);
  Serial.print("]: ");
  for (uint8_t i = 0; i < len; i++) {
    if (buf[i] < 16) Serial.print("0");
    Serial.print(buf[i], HEX);
    Serial.print(" ");
  }
  Serial.print(" | ");
  
  // Try to decode assuming standard gamepad layout
  if (len >= 6) {
    // Buttons (usually first 2 bytes)
    uint16_t buttons = buf[0] | (buf[1] << 8);
    
    // Axes (usually bytes 2-5)
    uint8_t lx = buf[2];
    uint8_t ly = buf[3];
    uint8_t rx = buf[4];
    uint8_t ry = buf[5];
    
    // Print axes values
    Serial.print("LX:");
    Serial.print(lx);
    Serial.print(" LY:");
    Serial.print(ly);
    Serial.print(" RX:");
    Serial.print(rx);
    Serial.print(" RY:");
    Serial.print(ry);
    Serial.print(" BTN:");
    Serial.print(buttons, BIN);
    
    // Detect movements and button presses
    if (ly < 50) Serial.print(" [LEFT-UP]");
    if (ly > 200) Serial.print(" [LEFT-DOWN]");
    if (lx < 50) Serial.print(" [LEFT-LEFT]");
    if (lx > 200) Serial.print(" [LEFT-RIGHT]");
    
    if (ry < 50) Serial.print(" [RIGHT-UP]");
    if (ry > 200) Serial.print(" [RIGHT-DOWN]");
    if (rx < 50) Serial.print(" [RIGHT-LEFT]");
    if (rx > 200) Serial.print(" [RIGHT-RIGHT]");
    
    // Button detection
    for (int i = 0; i < 16; i++) {
      if (buttons & (1 << i)) {
        Serial.print(" [BTN");
        Serial.print(i);
        Serial.print("]");
      }
    }
  }
  
  Serial.println();
}

JoystickParser Joy;

void setup() {
  Serial.begin(115200);
  #if !defined(__MIPSEL__)
    while (!Serial);
  #endif
  
  Serial.println("\n========================================");
  Serial.println("Red Gear Controller Test");
  Serial.println("========================================");
  
  if (Usb.Init() == -1) {
    Serial.println("\nERROR: USB Host Shield Init Failed!");
    while (1);
  }
  
  Serial.println("USB Host Shield Ready");
  Serial.println("\n1. Plug Red Gear dongle into shield");
  Serial.println("2. Turn on controller");
  Serial.println("3. Move joysticks and press buttons\n");
  
  delay(200);
}

void loop() {
  Usb.Task();
  
  if (Hid.isReady()) {
    static bool first = true;
    if (first) {
      Serial.println("\n*** CONTROLLER CONNECTED! ***");
      Serial.println("Move joysticks and press buttons...\n");
      
      uint8_t rcode = Hid.SetReportParser(0, &Joy);
      if (rcode)
        ErrorMessage<uint8_t>(PSTR("SetReportParser"), rcode);
      
      first = false;
    }
  }
}
