/*
 * USB Keyboard Reader
 * Reads all key presses from a USB keyboard connected to USB Host Shield
 * 
 * Hardware:
 * - USB Host Shield on Arduino
 * - USB Keyboard plugged into USB Host Shield
 * 
 * Library: USB Host Shield Library 2.0
 * 
 * This will print every key you press on the Serial Monitor
 */

#include <hidboot.h>
#include <usbhub.h>

// Satisfy the IDE, which needs to see the include statement in the ino too.
#ifdef dobogusinclude
#include <spi4teensy3.h>
#endif
#include <SPI.h>

class KbdRptParser : public KeyboardReportParser
{
  protected:
    void OnKeyDown(uint8_t mod, uint8_t key);
    void OnKeyUp(uint8_t mod, uint8_t key);
};

void KbdRptParser::OnKeyDown(uint8_t mod, uint8_t key)
{
  uint8_t c = OemToAscii(mod, key);

  if (c) {
    Serial.print("Key Pressed: ");
    Serial.print((char)c);
    Serial.print(" (ASCII: ");
    Serial.print(c);
    Serial.print(", HID Code: ");
    Serial.print(key, HEX);
    Serial.println(")");
  }
  
  // Special keys that don't have ASCII
  switch (key) {
    case 0x2A: Serial.println("Key Pressed: BACKSPACE"); break;
    case 0x2B: Serial.println("Key Pressed: TAB"); break;
    case 0x28: Serial.println("Key Pressed: ENTER"); break;
    case 0x29: Serial.println("Key Pressed: ESC"); break;
    case 0x4F: Serial.println("Key Pressed: RIGHT ARROW"); break;
    case 0x50: Serial.println("Key Pressed: LEFT ARROW"); break;
    case 0x51: Serial.println("Key Pressed: DOWN ARROW"); break;
    case 0x52: Serial.println("Key Pressed: UP ARROW"); break;
    case 0x3A: Serial.println("Key Pressed: F1"); break;
    case 0x3B: Serial.println("Key Pressed: F2"); break;
    case 0x3C: Serial.println("Key Pressed: F3"); break;
    case 0x3D: Serial.println("Key Pressed: F4"); break;
    case 0x3E: Serial.println("Key Pressed: F5"); break;
    case 0x3F: Serial.println("Key Pressed: F6"); break;
    case 0x40: Serial.println("Key Pressed: F7"); break;
    case 0x41: Serial.println("Key Pressed: F8"); break;
    case 0x42: Serial.println("Key Pressed: F9"); break;
    case 0x43: Serial.println("Key Pressed: F10"); break;
    case 0x44: Serial.println("Key Pressed: F11"); break;
    case 0x45: Serial.println("Key Pressed: F12"); break;
  }
  
  // Modifier keys
  if (mod & 0x01) Serial.println("Modifier: LEFT CTRL");
  if (mod & 0x02) Serial.println("Modifier: LEFT SHIFT");
  if (mod & 0x04) Serial.println("Modifier: LEFT ALT");
  if (mod & 0x08) Serial.println("Modifier: LEFT GUI (Windows key)");
  if (mod & 0x10) Serial.println("Modifier: RIGHT CTRL");
  if (mod & 0x20) Serial.println("Modifier: RIGHT SHIFT");
  if (mod & 0x40) Serial.println("Modifier: RIGHT ALT");
  if (mod & 0x80) Serial.println("Modifier: RIGHT GUI");
}

void KbdRptParser::OnKeyUp(uint8_t mod, uint8_t key)
{
  uint8_t c = OemToAscii(mod, key);

  if (c) {
    Serial.print("Key Released: ");
    Serial.println((char)c);
  }
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
  Serial.println("USB Keyboard Reader");
  Serial.println("=====================================");

  if (Usb.Init() == -1) {
    Serial.println("\nERROR: USB Host Shield failed to initialize!");
    Serial.println("Check your connections.");
    while (1);
  }
  
  Serial.println("USB Host Shield initialized");
  Serial.println("\nPlug in your USB keyboard now...");
  Serial.println("Then start typing!\n");

  delay(200);

  HidKeyboard.SetReportParser(0, &Prs);
}

void loop()
{
  Usb.Task();
  
  static bool keyboardDetected = false;
  
  if (HidKeyboard.isReady() && !keyboardDetected) {
    Serial.println("\n*** KEYBOARD CONNECTED! ***");
    Serial.println("Start typing to see key codes...\n");
    keyboardDetected = true;
  }
  
  if (!HidKeyboard.isReady() && keyboardDetected) {
    Serial.println("\n*** KEYBOARD DISCONNECTED ***\n");
    keyboardDetected = false;
  }
}
