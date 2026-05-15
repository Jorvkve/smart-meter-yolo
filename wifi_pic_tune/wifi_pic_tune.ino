/*
  ขั้นตอนการทำงานของ Smart Meter ESP32-CAM

  1. เชื่อมต่อ WiFi 2.4GHz
  2. เปิดกล้อง ESP32-CAM และปรับภาพให้เหมาะกับการถ่ายมิเตอร์
  3. ถ่ายรูปเป็นไฟล์ JPEG ตามช่วงเวลาที่กำหนด
  4. ส่งรูปพร้อม house_id ไปยัง Node.js backend แบบ multipart/form-data
  5. Backend รับรูป นำไปอ่านเลขด้วย YOLO และบันทึกผลลง MySQL
*/

/* ================= ไลบรารีที่ใช้ =================
   WiFi.h              : ใช้เชื่อมต่อ ESP32-CAM เข้ากับ router
   esp_camera.h        : ใช้ควบคุมโมดูลกล้อง
   HTTPClient/WiFiClient: ใช้ส่ง HTTP POST ไปยัง backend
   heap_caps           : ใช้จองหน่วยความจำก้อนใหญ่ โดยพยายามใช้ PSRAM ก่อน
   soc/rtc_cntl_reg    : header ระดับล่างของ ESP32 ที่มักใช้ร่วมกับกล้อง
*/
#include <WiFi.h>
#include "esp_camera.h"
#include <HTTPClient.h>
#include <WiFiClient.h>

#include "esp_heap_caps.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

/* ================= ตั้งค่า WiFi =================
   ESP32-CAM ต้องใช้ WiFi 2.4GHz
*/
const char* ssid = "Jorvkve_2.4G";
const char* password = "Tewit8123";

/* ================= ตั้งค่า Backend =================
   serverUrl คือ endpoint ของ backend บนเครื่อง PC
   ต้องใช้ IPv4 ของ PC ในวง LAN ห้ามใช้ localhost และห้ามใช้ IP ของ ESP32-CAM
   houseId คือรหัสบ้าน/มิเตอร์ที่กล้องตัวนี้ประจำอยู่
*/
const char* serverUrl =
// "https://smart-meter-render.onrender.com/upload";
  "http://192.168.1.129:3000/api/upload";
  const char* houseId = "3";

/* ================= ตั้งค่ารูปภาพและการอัปโหลด =================
   photoFrameSize และ jpegQuality ใช้ควบคุมความชัดและขนาดไฟล์รูป
   uploadResponseTimeoutMs ให้เวลา backend ประมวลผล YOLO ก่อน timeout
*/
const framesize_t photoFrameSize = FRAMESIZE_SXGA; // 1280x1024: สมดุลระหว่างความชัดกับขนาดไฟล์
const int jpegQuality = 12;         // เลขยิ่งน้อย ภาพยิ่งชัดและไฟล์ยิ่งใหญ่
const size_t maxUploadImageBytes = 260 * 1024;
const int staleFrameCount = 0;
const int exposureWarmupFrameCount = 3;
const uint16_t uploadResponseTimeoutMs = 45000;
const uint16_t wifiConnectTimeoutMs = 20000;

const int flashLedPin = 4;           // ขาไฟแฟลชบนบอร์ด ESP32-CAM
const bool useFlashLed = false;      // ปิดแฟลช
const int flashWarmupMs = 800;
const int ambientWarmupMs = 1200;

/* ================= ฟังก์ชันช่วยควบคุมไฟ LED =================
   RED_LED ใช้แสดงสถานะการเชื่อมต่อหรือการทำงาน
   flashLedPin ใช้เปิดแฟลชได้ แต่ตอนนี้ปิดไว้เพราะฝาครอบมิเตอร์สะท้อนแสง
*/
#define RED_LED 33

void setLED(bool state){
  digitalWrite(RED_LED, state ? LOW : HIGH);
}

void setFlashLed(bool state){
  if(useFlashLed){
    digitalWrite(flashLedPin, state ? HIGH : LOW);
  }
}

/* ================= ผังขากล้อง =================
   เป็น mapping ขาของบอร์ด AI Thinker ESP32-CAM
   ค่านี้ต้องตรงกับ hardware ของบอร์ด
*/
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

/* ================= ตั้งค่ากล้อง =================
   เริ่มต้นกล้องและปรับ sensor ให้เหมาะกับตู้มิเตอร์ที่ค่อนข้างมืด
   เช่น contrast, sharpness, brightness, exposure, denoise และ gain
*/
void setupCamera() {

  camera_config_t config;

  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;

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

  config.pin_pwdn  = PWDN_GPIO_NUM;
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

  Serial.println("Camera Init Success");

  sensor_t *s = esp_camera_sensor_get();

  /* ปรับภาพให้เหมาะกับการนำไปอ่านเลขด้วย YOLO */
  s->set_special_effect(s, 0);

  s->set_contrast(s, 2);
  s->set_sharpness(s, 2);
  s->set_brightness(s, 2);
  s->set_saturation(s, -1);

  /* เพิ่ม auto exposure เพื่อช่วยในตู้มิเตอร์ที่แสงน้อย */
  s->set_exposure_ctrl(s, 1);
  s->set_aec2(s, 1);
  s->set_ae_level(s, 2);

  s->set_denoise(s, 1);
  s->set_bpc(s, 1);
  s->set_wpc(s, 1);
  s->set_lenc(s, 1);

  /* ให้ sensor เพิ่มความสว่างได้ แต่จำกัด noise ไม่ให้มากเกินไป */
  s->set_gain_ctrl(s, 1);
  s->set_gainceiling(s, GAINCEILING_64X);

  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);

  s->set_vflip(s, 0);
  s->set_hmirror(s, 0);

  Serial.println("Meter YOLO Mode Ready");
}

/* ================= การเชื่อมต่อ WiFi =================
   เชื่อมต่อ WiFi รอจนเชื่อมต่อสำเร็จ แสดง IP ของ ESP32-CAM
   ถ้าเชื่อมต่อไม่ทันเวลาจะคืนค่า false
*/
bool connectWiFi(){

  WiFi.begin(ssid,password);

  Serial.print("Connecting WiFi");

  unsigned long startAttempt = millis();

  while(WiFi.status()!=WL_CONNECTED &&
        millis() - startAttempt < wifiConnectTimeoutMs){
    Serial.print(".");
    setLED(true);
    delay(200);
    setLED(false);
    delay(200);
  }

  if(WiFi.status()!=WL_CONNECTED){
    Serial.println("\nWiFi Connect Timeout");
    setLED(false);
    return false;
  }

  Serial.println("\nWiFi Connected");
  Serial.println(WiFi.localIP());

  setLED(true);
  return true;
}

const char* frameSizeName(framesize_t frameSize){
  switch(frameSize){
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

/* ================= เตรียมเฟรมก่อนถ่ายจริง =================
   ทิ้งเฟรมเก่า เพื่อให้รูปสุดท้ายใช้ค่าแสง/ความสว่างที่ใหม่กว่า
*/
void dropStaleFrames(int count){
  for(int i=0;i<count;i++){
    camera_fb_t *tmp = esp_camera_fb_get();
    if(tmp){
      esp_camera_fb_return(tmp);
    }
    delay(120);
  }
}

/* ================= ถ่ายรูป =================
   ตั้งขนาดและคุณภาพภาพ รอให้กล้องปรับแสง ถ่าย JPEG หนึ่งรูป
   แสดงขนาดไฟล์ แล้วคืนค่า frame buffer ของกล้อง
*/
camera_fb_t* captureSendablePhoto(){
  sensor_t *s = esp_camera_sensor_get();

  s->set_framesize(s, photoFrameSize);
  s->set_quality(s, jpegQuality);
  setFlashLed(true);
  delay(useFlashLed ? flashWarmupMs : ambientWarmupMs);
  dropStaleFrames(exposureWarmupFrameCount);

  camera_fb_t *fb = esp_camera_fb_get();
  setFlashLed(false);

  if(!fb){
    Serial.println("Capture failed");
    return NULL;
  }

  Serial.printf(
    "Image Size: %u bytes (%s, jpeg quality %d)\n",
    (unsigned)fb->len,
    frameSizeName(photoFrameSize),
    jpegQuality
  );

  if(fb->len > maxUploadImageBytes){
    Serial.println("Warning: image above target size; try raising jpegQuality");
  }

  return fb;
}

/* ================= หน่วยความจำสำหรับอัปโหลด =================
   จอง buffer สำหรับ multipart payload หนึ่งก้อน
   ใช้ PSRAM ก่อน เพราะรูปจากกล้องมีขนาดค่อนข้างใหญ่
*/
uint8_t* allocatePayload(size_t totalLen){
  uint8_t *payload = (uint8_t*)heap_caps_malloc(
    totalLen,
    MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT
  );

  if(!payload){
    payload = (uint8_t*)heap_caps_malloc(totalLen, MALLOC_CAP_8BIT);
  }

  return payload;
}

/* ================= ส่งรูปไป Backend =================
   ฟังก์ชันหลักสำหรับอัปโหลด:
   - เชื่อมต่อ WiFi ใหม่ถ้าหลุด
   - ถ่ายรูปจากกล้อง
   - สร้าง multipart/form-data ที่มี house_id และ image
   - ส่ง POST ไปที่ /api/upload
   - คืนหน่วยความจำและคืน frame buffer ให้กล้อง
*/
void sendPhoto(){

  if(WiFi.status()!=WL_CONNECTED){
    if(!connectWiFi()){
      return;
    }
  }

  dropStaleFrames(staleFrameCount);

  camera_fb_t *fb = captureSendablePhoto();

  if(!fb){
    Serial.println("Capture failed");
    return;
  }

  WiFiClient client;

  HTTPClient http;
  http.begin(client, serverUrl);
  http.setTimeout(uploadResponseTimeoutMs);
  http.setReuse(false);

  String boundary="----ESP32CAM";

  http.addHeader(
    "Content-Type",
    "multipart/form-data; boundary="+boundary
  );

  String head =
  "--"+boundary+"\r\n"
  "Content-Disposition: form-data; name=\"house_id\"\r\n\r\n"
  + String(houseId) + "\r\n"
  "--"+boundary+"\r\n"
  "Content-Disposition: form-data; name=\"image\"; filename=\"meter.jpg\"\r\n"
  "Content-Type: image/jpeg\r\n\r\n";

  String tail="\r\n--"+boundary+"--\r\n";

  size_t totalLen=head.length()+fb->len+tail.length();

  uint8_t *payload=allocatePayload(totalLen);

  if(!payload){
    Serial.println("Memory alloc failed");
    esp_camera_fb_return(fb);
    return;
  }

  memcpy(payload,head.c_str(),head.length());
  memcpy(payload+head.length(),fb->buf,fb->len);
  memcpy(payload+head.length()+fb->len,
  tail.c_str(),tail.length());

  Serial.print("Uploading to: ");
  Serial.println(serverUrl);
  Serial.print("house_id: ");
  Serial.println(houseId);

  int httpCode=http.POST(payload,totalLen);

  Serial.printf("HTTP Code: %d\n",httpCode);

  if(httpCode==200)
    Serial.println("Upload Success");
  else if(httpCode==-11){
    Serial.println("Upload sent, but server response timed out");
    Serial.println("Check gallery: if the image appears there, upload worked");
  }
  else{
    Serial.print("Upload Failed: ");
    Serial.println(http.errorToString(httpCode));
  }

  free(payload);
  http.end();
  esp_camera_fb_return(fb);
}

/* ================= ตัวจับเวลา =================
   กำหนดว่า ESP32-CAM จะถ่ายและอัปโหลดรูปบ่อยแค่ไหน
*/
unsigned long previousMillis = 0;

const unsigned long interval = 30000;

/* ================= setup =================
   ทำงานครั้งเดียวตอนเปิดบอร์ด:
   เปิด Serial Monitor, ตั้งค่า LED, เปิดกล้อง และเชื่อมต่อ WiFi
*/
void setup(){

  Serial.begin(115200);

  pinMode(RED_LED,OUTPUT);
  setLED(false);
  pinMode(flashLedPin,OUTPUT);
  setFlashLed(false);

  setupCamera();
  connectWiFi();
}

/* ================= loop =================
   ทำงานวนตลอดเวลา เมื่อครบ interval จะถ่ายและอัปโหลดรูปหนึ่งครั้ง
*/
void loop(){

  unsigned long now = millis();

  if(now - previousMillis >= interval){
    sendPhoto();
    previousMillis = millis();
  }
}
