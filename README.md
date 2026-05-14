# Smart Meter Project

โปรเจกต์นี้เป็นระบบอ่านมิเตอร์ไฟฟ้าด้วย ESP32-CAM + YOLO และแสดงผลผ่านเว็บ Dashboard

## ส่วนหลักของระบบ

- `server.js` - เริ่ม Express server และ route หน้าเว็บ
- `db.js` - ตั้งค่าการเชื่อมต่อ MySQL/MariaDB
- `routes/` - API backend
  - `houses.js` จัดการข้อมูลบ้าน
  - `readings.js` จัดการข้อมูลมิเตอร์ กราฟรายเดือน และบิล
  - `upload.js` รับรูปจาก ESP32-CAM, เรียก YOLO, และบันทึกลง database
- `public/` - หน้าเว็บ static
  - `html/` หน้าเว็บแต่ละหน้า
  - `css/` styling
  - `js/` logic ฝั่ง browser
- `wifi_pic_tune/` - Arduino sketch สำหรับ ESP32-CAM
- `tools/` - script สำหรับเทรน/ทดสอบ YOLO และช่วยเตรียมข้อมูล

## โฟลเดอร์ข้อมูลและโมเดล

- `meter_dataset/` - dataset สำหรับเทรน YOLO
- `runs/` - ผลการ train/predict ของ YOLO
- `cropped_images/` - รูปตัวเลขที่ crop ไว้ใช้ทดสอบ/เทรน
- `test_images/`, `test_images_unseen/` - รูปทดสอบโมเดล
- `uploads/` - รูปที่ backend รับจาก ESP32-CAM หรือ Postman
- `ESP32-CAM image/`, `iphone image/` - รูปตัวอย่างสำหรับทดสอบโมเดล

## การรันระบบ

เปิด MySQL/MariaDB ก่อน แล้วรัน:

```powershell
node server.js
```

เปิดเว็บ:

```text
http://localhost:3000
```

## Flow ทดสอบจริง

1. ESP32-CAM ถ่ายรูปและส่ง `image` + `house_id` ไปที่ `/api/upload`
2. Backend เซฟรูปใน `uploads/`
3. Backend เรียก `tools/predict_meter_reading.py`
4. YOLO อ่านเลขมิเตอร์
5. Backend บันทึก `house_id`, `reading_value`, `image_filename` ลง `meter_readings`
6. ตรวจรูปและแก้เลขได้ที่ `/admin`
7. ดูภาพรวมล่าสุดที่ `/daily`
8. ดูกราฟรายเดือนที่ `/monthly`
9. คำนวณและสร้างบิลที่ `/billing`

## หมายเหตุสำหรับนำเสนอ

YOLO อาจอ่านเลขผิดได้เมื่อภาพเบลอ มืด หรือมีแสงสะท้อน ระบบจึงมีหน้า Admin สำหรับตรวจรูปและแก้เลขก่อนนำไปคำนวณกราฟหรือบิล
