# ESP32-CAM Scheduled Burst Sketch

โฟลเดอร์นี้เป็น sketch แยกจาก `wifi_pic_tune/` เพื่อทดลองแนวทาง scheduled burst โดยไม่กระทบไฟล์ ESP32-CAM ตัวเดิมที่ใช้งานได้อยู่แล้ว

ไฟล์หลัก:

```text
wifi_pic_tune_burst.ino
```

แนวคิด:

- ไม่ส่งรูปทุก 30 วินาทีตลอดเวลา
- กำหนดช่วงเวลาที่ต้องการเก็บค่า เช่น ทุก 1 ชั่วโมง หรือทุก 3 ชั่วโมง
- เมื่อถึงเวลา ให้ถ่าย burst 5 นาที
- ถ่ายทุก 30 วินาที รวมประมาณ 10 รูป
- ส่งรูปทั้งหมดใน request เดียวด้วย multipart field ชื่อ `images`
- backend `/api/upload` จะเลือกค่าที่ดีที่สุดและบันทึกเฉพาะ selected reading

ค่าที่ควรแก้ก่อน upload ลงบอร์ด:

```cpp
const char* ssid = "Jorvkve_2.4G";
const char* password = "Tewit8123";
const char* serverUrl = "http://192.168.1.129:3000/api/upload";
const char* houseId = "3";
```

ค่าควบคุม burst:

```cpp
const bool runBurstOnBoot = true;
const unsigned long scheduledIntervalMs = 60UL * 60UL * 1000UL;
const int burstFrameCount = 10;
const unsigned long burstFrameIntervalMs = 30000;
```

หมายเหตุ:

- `runBurstOnBoot = true` เหมาะสำหรับทดสอบ เพราะเปิดบอร์ดแล้วเริ่ม burst ทันที
- ถ้าใช้งานจริงและไม่อยากให้เริ่มทันทีหลังเปิดเครื่อง ให้เปลี่ยนเป็น `false`
- sketch นี้ยังเป็น schedule แบบนับเวลาจากตอนเปิดบอร์ดด้วย `millis()` ถ้าต้องการเวลาจริง เช่น ทุกวันที่ 10 เวลา 18:00 ควรเพิ่ม NTP/RTC ต่อในอนาคต
