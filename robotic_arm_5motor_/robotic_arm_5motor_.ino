/*
 * 5-DOF Robotic Arm Controller — Dual servo driver (PWM + PCA9685 I2C)
 * Dual input: Xbox Controller + Web Dashboard (Serial commands)
 *
 * Serial Commands (from dashboard):
 *   A:s,e,wp,wr,g\n   -> Set all 5 servos, responds OK:s,e,wp,wr,g
 *   Q\n                -> Query positions, responds POS:s,e,wp,wr,g
 *   HOME\n             -> All servos to 90, responds HOMED
 *   MODE:PWM\n         -> Switch to direct Arduino PWM, responds MODE:PWM
 *   MODE:I2C\n         -> Switch to PCA9685 I2C driver, responds MODE:I2C
 *   MODE?\n            -> Query current mode, responds MODE:PWM or MODE:I2C
 *
 * PCA9685 wiring (I2C mode):
 *   Arduino A4 (SDA) -> PCA9685 SDA
 *   Arduino A5 (SCL) -> PCA9685 SCL
 *   PCA9685 channels: 0=Shoulder, 1=Elbow, 2=WristPitch, 3=WristRoll, 4=Gripper
 *
 * Direct PWM pins (PWM mode):
 *   3=Shoulder, 5=Elbow, 6=WristPitch, 7=WristRoll, 9=Gripper
 */

#include <Servo.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <XBOXUSB.h>

USB Usb;
XBOXUSB Xbox(&Usb);

// --- Direct PWM ---
Servo servoShoulder, servoElbow, servoWristPitch, servoWristRoll, servoGripper;
const int pinShoulder = 3;
const int pinElbow = 5;
const int pinWristPitch = 6;
const int pinWristRoll = 7;
const int pinGripper = 9;

// --- PCA9685 I2C ---
Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(0x40);
const int PCA_CH_SHOULDER = 0;
const int PCA_CH_ELBOW    = 1;
const int PCA_CH_WPITCH   = 2;
const int PCA_CH_WROLL    = 3;
const int PCA_CH_GRIPPER  = 4;
const int PCA_SERVO_MIN   = 102;  // ~0.5ms at 50Hz -> 0 degrees
const int PCA_SERVO_MAX   = 512;  // ~2.5ms at 50Hz -> 180 degrees

// --- Servo mode flag ---
bool useI2C = false;
bool pcaReady = false;

// --- Positions ---
int posShoulder = 90;
int posElbow = 90;
int posWristPitch = 90;
int posWristRoll = 90;
int posGripper = 90;

const int deadzone = 7500;
const int normalSpeed = 2;
const int fastSpeed = 4;

unsigned long lastCompactPrint = 0;
const unsigned long compactInterval = 50;  // 20 Hz

int degreesToPCA(int deg) {
  return map(constrain(deg, 0, 180), 0, 180, PCA_SERVO_MIN, PCA_SERVO_MAX);
}

void writeSingleServo(int channel, int pinServo, Servo &srv, int deg) {
  if (useI2C && pcaReady) {
    pca.setPWM(channel, 0, degreesToPCA(deg));
  } else {
    srv.write(deg);
  }
}

void writeAllServos() {
  writeSingleServo(PCA_CH_SHOULDER, pinShoulder, servoShoulder, posShoulder);
  writeSingleServo(PCA_CH_ELBOW,    pinElbow,    servoElbow,    posElbow);
  writeSingleServo(PCA_CH_WPITCH,   pinWristPitch, servoWristPitch, posWristPitch);
  writeSingleServo(PCA_CH_WROLL,    pinWristRoll,  servoWristRoll,  posWristRoll);
  writeSingleServo(PCA_CH_GRIPPER,  pinGripper,  servoGripper,  posGripper);
}

void sendPositionResponse(const char* prefix) {
  Serial.print(prefix);
  Serial.print(posShoulder); Serial.print(",");
  Serial.print(posElbow); Serial.print(",");
  Serial.print(posWristPitch); Serial.print(",");
  Serial.print(posWristRoll); Serial.print(",");
  Serial.println(posGripper);
}

void printTelemetry() {
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
}

void setup() {
  Serial.begin(115200);
  Serial.println("5DOF-ARM-READY");

  if (Usb.Init() == -1) {
    Serial.println("ERR:USB_HOST_FAIL");
    while (1);
  }

  delay(200);

  // Init direct PWM servos (always, so we can switch at runtime)
  servoShoulder.attach(pinShoulder);
  servoElbow.attach(pinElbow);
  servoWristPitch.attach(pinWristPitch);
  servoWristRoll.attach(pinWristRoll);
  servoGripper.attach(pinGripper);

  // Try to init PCA9685 (non-fatal if not connected)
  Wire.begin();
  Wire.beginTransmission(0x40);
  if (Wire.endTransmission() == 0) {
    pca.begin();
    pca.setOscillatorFrequency(25000000);
    pca.setPWMFreq(50);
    pcaReady = true;
    Serial.println("PCA9685:OK");
  } else {
    pcaReady = false;
    Serial.println("PCA9685:NOT_FOUND");
  }

  writeAllServos();
  Serial.print("MODE:");
  Serial.println(useI2C ? "I2C" : "PWM");
  Serial.println("HOMED");
  delay(500);
}

void handleSerial() {
  if (!Serial.available()) return;

  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return;

  if (line.startsWith("A:")) {
    String data = line.substring(2);
    int angles[5];
    int idx = 0;
    int start = 0;
    for (int i = 0; i <= (int)data.length() && idx < 5; i++) {
      if (i == (int)data.length() || data[i] == ',') {
        angles[idx] = constrain(data.substring(start, i).toInt(), 0, 180);
        idx++;
        start = i + 1;
      }
    }
    if (idx == 5) {
      posShoulder = angles[0];
      posElbow = angles[1];
      posWristPitch = angles[2];
      posWristRoll = angles[3];
      posGripper = angles[4];
      writeAllServos();
      sendPositionResponse("OK:");
    }
  } else if (line == "Q") {
    sendPositionResponse("POS:");
  } else if (line == "HOME") {
    posShoulder = 90;
    posElbow = 90;
    posWristPitch = 90;
    posWristRoll = 90;
    posGripper = 90;
    writeAllServos();
    Serial.println("HOMED");
  } else if (line == "MODE:PWM") {
    useI2C = false;
    writeAllServos();
    Serial.println("MODE:PWM");
  } else if (line == "MODE:I2C") {
    if (pcaReady) {
      useI2C = true;
      writeAllServos();
      Serial.println("MODE:I2C");
    } else {
      Serial.println("ERR:PCA9685_NOT_FOUND");
    }
  } else if (line == "MODE?") {
    Serial.print("MODE:");
    Serial.println(useI2C ? "I2C" : "PWM");
  }
}

void handleXbox() {
  if (!Xbox.Xbox360Connected) return;

  int leftX = Xbox.getAnalogHat(LeftHatX);
  int leftY = Xbox.getAnalogHat(LeftHatY);

  if (abs(leftY) > deadzone) {
    posShoulder += map(leftY, -32768, 32767, normalSpeed, -normalSpeed);
    posShoulder = constrain(posShoulder, 0, 180);
    writeSingleServo(PCA_CH_SHOULDER, pinShoulder, servoShoulder, posShoulder);
  }
  if (abs(leftX) > deadzone) {
    posElbow += map(leftX, -32768, 32767, -normalSpeed, normalSpeed);
    posElbow = constrain(posElbow, 0, 180);
    writeSingleServo(PCA_CH_ELBOW, pinElbow, servoElbow, posElbow);
  }

  int rightX = Xbox.getAnalogHat(RightHatX);
  int rightY = Xbox.getAnalogHat(RightHatY);

  if (abs(rightY) > deadzone) {
    posWristPitch += map(rightY, -32768, 32767, normalSpeed, -normalSpeed);
    posWristPitch = constrain(posWristPitch, 0, 180);
    writeSingleServo(PCA_CH_WPITCH, pinWristPitch, servoWristPitch, posWristPitch);
  }
  if (abs(rightX) > deadzone) {
    posWristRoll += map(rightX, -32768, 32767, -normalSpeed, normalSpeed);
    posWristRoll = constrain(posWristRoll, 0, 180);
    writeSingleServo(PCA_CH_WROLL, pinWristRoll, servoWristRoll, posWristRoll);
  }

  uint8_t lt = Xbox.getButtonPress(L2);
  if (lt > 20) {
    posGripper += map(lt, 0, 255, 0, fastSpeed);
    posGripper = constrain(posGripper, 0, 180);
    writeSingleServo(PCA_CH_GRIPPER, pinGripper, servoGripper, posGripper);
  }
  uint8_t rt = Xbox.getButtonPress(R2);
  if (rt > 20) {
    posGripper -= map(rt, 0, 255, 0, fastSpeed);
    posGripper = constrain(posGripper, 0, 180);
    writeSingleServo(PCA_CH_GRIPPER, pinGripper, servoGripper, posGripper);
  }
}

void loop() {
  Usb.Task();

  handleSerial();

  handleXbox();

  if (millis() - lastCompactPrint >= compactInterval) {
    printTelemetry();

    if (Xbox.Xbox360Connected) {
      int lx = map(Xbox.getAnalogHat(LeftHatX), -32768, 32767, -100, 100);
      int ly = map(Xbox.getAnalogHat(LeftHatY), -32768, 32767, -100, 100);
      int rx = map(Xbox.getAnalogHat(RightHatX), -32768, 32767, -100, 100);
      int ry = map(Xbox.getAnalogHat(RightHatY), -32768, 32767, -100, 100);
      int lt = map(Xbox.getButtonPress(L2), 0, 255, 0, 100);
      int rt = map(Xbox.getButtonPress(R2), 0, 255, 0, 100);
      Serial.print("CTRL:LX:"); Serial.print(lx);
      Serial.print(",LY:"); Serial.print(ly);
      Serial.print(",RX:"); Serial.print(rx);
      Serial.print(",RY:"); Serial.print(ry);
      Serial.print(",LT:"); Serial.print(lt);
      Serial.print(",RT:"); Serial.print(rt);
      Serial.print(",A:"); Serial.print(Xbox.getButtonPress(A) ? 1 : 0);
      Serial.print(",B:"); Serial.print(Xbox.getButtonPress(B) ? 1 : 0);
      Serial.print(",X:"); Serial.print(Xbox.getButtonPress(X) ? 1 : 0);
      Serial.print(",Y:"); Serial.println(Xbox.getButtonPress(Y) ? 1 : 0);
    }

    lastCompactPrint = millis();
  }

  delay(15);
}
