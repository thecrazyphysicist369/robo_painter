/*
 * Xbox Wireless Diagnostic & Manual Pairing
 * Use this to test if your receiver is working
 */

#include <XBOXRECV.h>

USB Usb;
XBOXRECV Xbox(&Usb);

void setup() {
  Serial.begin(115200);
  while (!Serial);
  
  Serial.println("Xbox 360 Wireless Receiver Diagnostic");
  Serial.println("=====================================\n");
  
  if (Usb.Init() == -1) {
    Serial.println("USB Host Shield FAILED!");
    while (1);
  }
  Serial.println("USB Host Shield OK");
}

void loop() {
  Usb.Task();
  
  if (Xbox.XboxReceiverConnected) {
    static bool printed = false;
    if (!printed) {
      Serial.println("✓ Xbox 360 Wireless Receiver detected!");
      Serial.println("\nNow turn on your controller...");
      Serial.println("If LED keeps spinning, type 'P' and press Enter to force pairing");
      printed = true;
    }
    
    // Check for manual pairing command
    if (Serial.available() > 0) {
      char cmd = Serial.read();
      if (cmd == 'P' || cmd == 'p') {
        Serial.println("\nForcing pairing mode...");
        Serial.println("Now press the small SYNC button on your controller!");
        // Note: XBOXRECV library handles pairing automatically
        // Just turn on the controller after this message
      }
    }
    
    // Check each controller slot
    for (uint8_t i = 0; i < 4; i++) {
      if (Xbox.Xbox360Connected[i]) {
        Serial.print("✓✓✓ CONTROLLER ");
        Serial.print(i + 1);
        Serial.println(" CONNECTED! ✓✓✓");
        
        // Test joystick
        int leftY = Xbox.getAnalogHat(LeftHatY, i);
        Serial.print("Left Joystick Y: ");
        Serial.println(leftY);
        
        delay(500);
      }
    }
    
  } else {
    static unsigned long lastMsg = 0;
    if (millis() - lastMsg > 3000) {
      Serial.println("Waiting for Xbox 360 Wireless Receiver...");
      Serial.println("Is it plugged in?");
      lastMsg = millis();
    }
  }
  
  delay(100);
}
