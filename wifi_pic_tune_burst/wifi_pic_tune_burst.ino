/*
  Smart Meter ESP32-CAM Burst Upload Sketch

  This sketch is separated from wifi_pic_tune/wifi_pic_tune.ino so the
  stable single-image version stays untouched.

  Flow:
  1. Wait for a scheduled reading interval.
  2. Capture a burst: 10 frames, 5 minutes apart.
  3. Upload all frames in one multipart request using field name "images".
  4. Backend selects the best reading and stores only that selected value.

  Note:
  - Without RTC/NTP, the schedule is interval-based from boot time.
  - Set runBurstOnBoot = true for quick testing.
*/

#include <WiFi.h>
#include "esp_camera.h"
#include <HTTPClient.h>
#include <WiFiClient.h>

#include "esp_heap_caps.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

/* ================= WiFi and Backend Config ================= */
const char* ssid = "Jorvkve_2.4G";
const char* password = "Tewit8123";

const char* serverUrl = "http://192.168.1.184:3000/api/upload";
const char* heartbeatUrl = "http://192.168.1.184:3000/api/device-ping";
const char* houseId = "4";
const char* deviceId = "esp32cam-house-4";

/* ================= Camera Config copied from stable sketch ================= */
const framesize_t photoFrameSize = FRAMESIZE_SXGA;
const int jpegQuality = 12;
const size_t maxUploadImageBytes = 260 * 1024;
const int exposureWarmupFrameCount = 3;
const uint16_t uploadResponseTimeoutMs = 60000;
const uint16_t wifiConnectTimeoutMs = 20000;

const int flashLedPin = 4;
const bool useFlashLed = false;
const int flashWarmupMs = 800;
const int ambientWarmupMs = 1200;

/* ================= Scheduled Burst Policy ================= */
const bool runBurstOnBoot = true;
const unsigned long scheduledIntervalMs = 60UL * 60UL * 1000UL; // every 1 hour
const unsigned long heartbeatIntervalMs = 5UL * 60UL * 1000UL; // every 5 minutes
const int burstFrameCount = 10;
const unsigned long burstFrameIntervalMs = 1UL * 60UL * 1000UL; // 5 minutes apart

#define RED_LED 33

struct CapturedFrame {
  uint8_t* data;
  size_t len;
  bool ok;
};

CapturedFrame burstFrames[burstFrameCount];
unsigned long lastBurstMillis = 0;
unsigned long lastHeartbeatMillis = 0;

void sendHeartbeat();

void setLED(bool state) {
  digitalWrite(RED_LED, state ? LOW : HIGH);
}

void setFlashLed(bool state) {
  if (useFlashLed) {
    digitalWrite(flashLedPin, state ? HIGH : LOW);
  }
}

/* ================= AI Thinker ESP32-CAM pins ================= */
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

void setupCamera() {
  camera_config_t config;

  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;

  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;

  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 10000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = photoFrameSize;
  config.jpeg_quality = jpegQuality;
  config.fb_count = 1;

  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("Camera Init Failed");
    ESP.restart();
  }

  sensor_t *s = esp_camera_sensor_get();

  s->set_special_effect(s, 0);
  s->set_contrast(s, 2);
  s->set_sharpness(s, 2);
  s->set_brightness(s, 2);
  s->set_saturation(s, -1);
  s->set_exposure_ctrl(s, 1);
  s->set_aec2(s, 1);
  s->set_ae_level(s, 2);
  s->set_denoise(s, 1);
  s->set_bpc(s, 1);
  s->set_wpc(s, 1);
  s->set_lenc(s, 1);
  s->set_gain_ctrl(s, 1);
  s->set_gainceiling(s, GAINCEILING_64X);
  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);
  s->set_vflip(s, 0);
  s->set_hmirror(s, 0);

  Serial.println("Burst meter camera ready");
}

bool connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");

  unsigned long startAttempt = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - startAttempt < wifiConnectTimeoutMs) {
    Serial.print(".");
    setLED(true);
    delay(200);
    setLED(false);
    delay(200);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi Connect Timeout");
    setLED(false);
    return false;
  }

  Serial.println("\nWiFi Connected");
  Serial.println(WiFi.localIP());
  setLED(true);
  return true;
}

const char* frameSizeName(framesize_t frameSize) {
  switch (frameSize) {
    case FRAMESIZE_UXGA:
      return "UXGA";
    case FRAMESIZE_SXGA:
      return "SXGA";
    case FRAMESIZE_XGA:
      return "XGA";
    default:
      return "OTHER";
  }
}

void dropStaleFrames(int count) {
  for (int i = 0; i < count; i++) {
    camera_fb_t *tmp = esp_camera_fb_get();
    if (tmp) {
      esp_camera_fb_return(tmp);
    }
    delay(120);
  }
}

void* allocateBytes(size_t len) {
  void *data = heap_caps_malloc(len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!data) {
    data = heap_caps_malloc(len, MALLOC_CAP_8BIT);
  }
  return data;
}

uint8_t* allocatePayload(size_t totalLen) {
  return (uint8_t*)allocateBytes(totalLen);
}

CapturedFrame captureFrameCopy(int frameIndex) {
  CapturedFrame frame;
  frame.data = NULL;
  frame.len = 0;
  frame.ok = false;

  sensor_t *s = esp_camera_sensor_get();
  s->set_framesize(s, photoFrameSize);
  s->set_quality(s, jpegQuality);

  setFlashLed(true);
  delay(useFlashLed ? flashWarmupMs : ambientWarmupMs);
  dropStaleFrames(exposureWarmupFrameCount);

  camera_fb_t *fb = esp_camera_fb_get();
  setFlashLed(false);

  if (!fb) {
    Serial.printf("Frame %d capture failed\n", frameIndex + 1);
    return frame;
  }

  Serial.printf(
    "Frame %d/%d size: %u bytes (%s, jpeg quality %d)\n",
    frameIndex + 1,
    burstFrameCount,
    (unsigned)fb->len,
    frameSizeName(photoFrameSize),
    jpegQuality
  );

  if (fb->len > maxUploadImageBytes) {
    Serial.println("Warning: image above target size; try raising jpegQuality");
  }

  frame.data = (uint8_t*)allocateBytes(fb->len);

  if (!frame.data) {
    Serial.println("Frame memory alloc failed");
    esp_camera_fb_return(fb);
    return frame;
  }

  memcpy(frame.data, fb->buf, fb->len);
  frame.len = fb->len;
  frame.ok = true;

  esp_camera_fb_return(fb);
  return frame;
}

void freeBurstFrames() {
  for (int i = 0; i < burstFrameCount; i++) {
    if (burstFrames[i].data) {
      free(burstFrames[i].data);
    }
    burstFrames[i].data = NULL;
    burstFrames[i].len = 0;
    burstFrames[i].ok = false;
  }
}

void waitWithHeartbeat(unsigned long durationMs) {
  unsigned long start = millis();

  while (millis() - start < durationMs) {
    unsigned long now = millis();

    if (now - lastHeartbeatMillis >= heartbeatIntervalMs) {
      sendHeartbeat();
    }

    delay(1000);
  }
}

int captureBurstFrames() {
  freeBurstFrames();
  int captured = 0;

  for (int i = 0; i < burstFrameCount; i++) {
    burstFrames[i] = captureFrameCopy(i);

    if (burstFrames[i].ok) {
      captured++;
    }

    if (i < burstFrameCount - 1) {
      Serial.printf("Waiting %lu ms for next burst frame\n", burstFrameIntervalMs);
      waitWithHeartbeat(burstFrameIntervalMs);
    }
  }

  Serial.printf("Captured %d/%d burst frames\n", captured, burstFrameCount);
  return captured;
}

void appendString(uint8_t *payload, size_t &offset, const String &value) {
  memcpy(payload + offset, value.c_str(), value.length());
  offset += value.length();
}

void appendBytes(uint8_t *payload, size_t &offset, const uint8_t *data, size_t len) {
  memcpy(payload + offset, data, len);
  offset += len;
}

bool uploadBurstFrames(int captured, unsigned long burstDurationMs) {
  if (captured <= 0) {
    Serial.println("No burst frames to upload");
    return false;
  }

  if (WiFi.status() != WL_CONNECTED && !connectWiFi()) {
    return false;
  }

  String boundary = "----ESP32CAMBURST";
  String housePart =
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"house_id\"\r\n\r\n" +
    String(houseId) + "\r\n";
  String devicePart =
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"device_id\"\r\n\r\n" +
    String(deviceId) + "\r\n";
  String burstDurationPart =
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"burst_duration_ms\"\r\n\r\n" +
    String(burstDurationMs) + "\r\n";
  String keepFramesPart =
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"keep_frames\"\r\n\r\n"
    "true\r\n";

  String tail = "--" + boundary + "--\r\n";
  size_t totalLen =
    housePart.length() +
    devicePart.length() +
    burstDurationPart.length() +
    keepFramesPart.length() +
    tail.length();

  for (int i = 0; i < burstFrameCount; i++) {
    if (!burstFrames[i].ok) continue;

    String imageHead =
      "--" + boundary + "\r\n"
      "Content-Disposition: form-data; name=\"images\"; filename=\"frame_" +
      String(i + 1) + ".jpg\"\r\n"
      "Content-Type: image/jpeg\r\n\r\n";

    totalLen += imageHead.length() + burstFrames[i].len + 2;
  }

  Serial.printf("Burst payload size: %u bytes\n", (unsigned)totalLen);

  uint8_t *payload = allocatePayload(totalLen);

  if (!payload) {
    Serial.println("Burst payload memory alloc failed");
    return false;
  }

  size_t offset = 0;
  appendString(payload, offset, housePart);
  appendString(payload, offset, devicePart);
  appendString(payload, offset, burstDurationPart);
  appendString(payload, offset, keepFramesPart);

  for (int i = 0; i < burstFrameCount; i++) {
    if (!burstFrames[i].ok) continue;

    String imageHead =
      "--" + boundary + "\r\n"
      "Content-Disposition: form-data; name=\"images\"; filename=\"frame_" +
      String(i + 1) + ".jpg\"\r\n"
      "Content-Type: image/jpeg\r\n\r\n";

    appendString(payload, offset, imageHead);
    appendBytes(payload, offset, burstFrames[i].data, burstFrames[i].len);
    appendString(payload, offset, "\r\n");
  }

  appendString(payload, offset, tail);

  WiFiClient client;
  HTTPClient http;
  http.begin(client, serverUrl);
  http.setTimeout(uploadResponseTimeoutMs);
  http.setReuse(false);
  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);

  Serial.print("Uploading burst to: ");
  Serial.println(serverUrl);
  Serial.print("house_id: ");
  Serial.println(houseId);

  int httpCode = http.POST(payload, totalLen);

  Serial.printf("HTTP Code: %d\n", httpCode);

  if (httpCode == 200) {
    Serial.println("Burst Upload Success");
    Serial.println(http.getString());
  } else if (httpCode == -11) {
    Serial.println("Burst upload sent, but server response timed out");
    Serial.println("Check backend/admin page to confirm the selected reading");
  } else {
    Serial.print("Burst Upload Failed: ");
    Serial.println(http.errorToString(httpCode));
  }

  free(payload);
  http.end();
  return httpCode == 200 || httpCode == -11;
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED && !connectWiFi()) {
    return;
  }

  WiFiClient client;
  HTTPClient http;
  http.begin(client, heartbeatUrl);
  http.setTimeout(8000);
  http.setReuse(false);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  String body = "device_id=" + String(deviceId) +
                "&house_id=" + String(houseId);

  int httpCode = http.POST(body);
  Serial.printf("Heartbeat HTTP Code: %d\n", httpCode);

  http.end();
  lastHeartbeatMillis = millis();
}

void runScheduledBurst() {
  unsigned long burstStartMillis = millis();
  lastBurstMillis = burstStartMillis;

  sendHeartbeat();
  Serial.println("Starting scheduled burst");
  int captured = captureBurstFrames();
  unsigned long burstDurationMs = millis() - burstStartMillis;
  uploadBurstFrames(captured, burstDurationMs);
  freeBurstFrames();
  sendHeartbeat();
  Serial.println("Scheduled burst finished");
}

void setup() {
  Serial.begin(115200);

  pinMode(RED_LED, OUTPUT);
  setLED(false);
  pinMode(flashLedPin, OUTPUT);
  setFlashLed(false);

  setupCamera();
  connectWiFi();

  if (runBurstOnBoot) {
    lastBurstMillis = millis() - scheduledIntervalMs;
  } else {
    lastBurstMillis = millis();
  }

  sendHeartbeat();
}

void loop() {
  unsigned long now = millis();

  if (now - lastBurstMillis >= scheduledIntervalMs) {
    runScheduledBurst();
  }

  if (now - lastHeartbeatMillis >= heartbeatIntervalMs) {
    sendHeartbeat();
  }

  delay(1000);
}
