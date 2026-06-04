# ESP32-CAM Scheduled Burst Sketch

โฟลเดอร์นี้เป็น sketch ทดลองสำหรับ scheduled burst โดยแยกจาก `wifi_pic_tune/` เพื่อไม่กระทบ sketch single-image ตัว stable

ไฟล์หลัก:

```text
wifi_pic_tune_burst.ino
```

แนวคิด:

- ส่ง heartbeat ไปที่ `/api/device-ping` ทุก 5 นาที เพื่อให้หน้า `/admin` เห็นว่า ESP32-CAM ยังออนไลน์อยู่
- เมื่อถึงรอบอ่านค่า ให้ถ่ายภาพเป็น burst แล้วส่งทุกภาพใน request เดียวด้วย multipart field ชื่อ `images`
- ค่าเริ่มต้นตอนนี้ใช้ 10 เฟรม ห่างกัน 5 นาที เพื่อให้ backend คัด selected frame จากช่วงเวลาประมาณ 45 นาที
- Backend `/api/upload` จะอ่านทุกเฟรม เลือกเฟรมที่ดีที่สุด และบันทึกเฉพาะ selected reading
- ถ้าต้องการทดสอบแบบ payload เบาลงชั่วคราว ค่อยลด `burstFrameCount` เป็น `5`

ค่าที่ควรแก้ก่อน upload ลงบอร์ด:

```cpp
const char* ssid = "YOUR_WIFI";
const char* password = "YOUR_PASSWORD";
const char* serverUrl = "http://YOUR_SERVER_IP:3000/api/upload";
const char* heartbeatUrl = "http://YOUR_SERVER_IP:3000/api/device-ping";
const char* houseId = "1";
const char* deviceId = "esp32cam-house-1";
```

ค่าควบคุม burst:

```cpp
const bool runBurstOnBoot = false;
const unsigned long scheduledIntervalMs = 60UL * 60UL * 1000UL;
const unsigned long heartbeatIntervalMs = 5UL * 60UL * 1000UL;
const int burstFrameCount = 10;
const unsigned long burstFrameIntervalMs = 5UL * 60UL * 1000UL;
```

หมายเหตุ:

- `runBurstOnBoot = true` เหมาะสำหรับทดสอบ เพราะเปิดบอร์ดแล้วเริ่ม burst ทันที
- `runBurstOnBoot = false` เหมาะกับการใช้งานจริง เพราะรอถึงรอบอ่านค่าถัดไปก่อน
- sketch นี้ยังใช้ schedule แบบนับเวลาจากตอนเปิดบอร์ดด้วย `millis()` ถ้าต้องการเวลาแบบกำหนดวัน/ชั่วโมงจริง ควรเพิ่ม NTP หรือ RTC ภายหลัง
- จากขนาดภาพที่ทดสอบจริงประมาณ 55-60 KB ต่อเฟรม payload 10 เฟรมจะอยู่ราว 550-650 KB
