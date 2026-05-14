# Python Tools

โฟลเดอร์นี้เก็บสคริปต์ Python สำหรับ YOLO และการเตรียมข้อมูล ไม่ใช่ไฟล์หน้าเว็บหลัก

## ใช้ตอนระบบรันจริง

- `predict_meter_reading.py` - backend เรียกตอน `/api/upload` เพื่ออ่านเลขจากรูปด้วย model `runs/detect/train-8/weights/best.pt`

## ใช้สำหรับทดสอบ/นำเสนอโมเดล

- `check_esp32_train8.py` - ทดสอบ model กับรูปใน `ESP32-CAM image` และสร้างภาพตีกรอบ
- `check_train8_folders.py` - ทดสอบ model กับทั้งรูป ESP32-CAM และ iPhone
- `check_accuracy.py` - เช็คความแม่นกับรูปใน `cropped_images`
- `yolov8_image.py` - predict รูปเดี่ยวแบบเร็ว

## ใช้สำหรับเทรน/เตรียม dataset

- `train.py` - ตัวอย่างคำสั่ง train YOLO ด้วย `data_digits.yaml`
- `crop_train.py` - crop บริเวณตัวเลขจากรูป train ไปไว้ที่ `cropped_images`
- `test_meter_digits.py` - ทดสอบอ่านเลขจาก `cropped_images`
- `test_new_images.py` - ทดสอบอ่านเลขจาก dataset ใหม่
- `rename.py` - เปลี่ยนชื่อไฟล์รูปใน dataset จริง ควรใช้ด้วยความระวัง

## ใช้เตรียมข้อมูล demo

- `seed_esp32_demo_readings.js` - script ช่วย seed รูป ESP32-CAM เข้า database สำหรับ demo

## วิธีรัน

ให้รันจาก root โปรเจกต์ เช่น:

```powershell
.\.venv\Scripts\python.exe tools\check_esp32_train8.py
```

หรือ:

```powershell
.\.venv\Scripts\python.exe tools\predict_meter_reading.py uploads\some_meter.jpg
```
