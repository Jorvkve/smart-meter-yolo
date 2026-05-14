# ESP32-CAM Sketch

โฟลเดอร์นี้เก็บไฟล์สำหรับบอร์ด ESP32-CAM

## ไฟล์หลัก

- `wifi_pic_tune.ino` - code ที่ upload เข้า ESP32-CAM

## หน้าที่ของ ESP32-CAM

1. เชื่อมต่อ WiFi 2.4GHz
2. ถ่ายรูปมิเตอร์เป็น JPEG
3. ส่ง `house_id` และ `image` ไปที่ backend
4. backend รับรูปแล้วอ่านเลขด้วย YOLO

## สิ่งที่ต้องแก้เมื่อติดตั้งกล้องแต่ละตัว

ใน `wifi_pic_tune.ino` ให้แก้:

```cpp
const char* serverUrl = "http://IP-PC:3000/api/upload";
const char* houseId = "1";
```

- `serverUrl` ต้องเป็น IP ของ PC/server ที่รัน backend
- `houseId` ต้องตรงกับบ้านที่กล้องตัวนั้นติดตั้งอยู่

ตัวอย่าง:

- กล้องบ้าน 1 ใช้ `houseId = "1"`
- กล้องบ้าน 2 ใช้ `houseId = "2"`
- กล้องบ้าน 3 ใช้ `houseId = "3"`

## หมายเหตุ

รูปตัวอย่างใน `ESP32-CAM image/` และ `iphone image/` ใช้สำหรับทดสอบโมเดล ไม่ใช่ code ที่ต้อง upload เข้า board
