# โครงสร้างโปรเจกต์

ไฟล์นี้ใช้ดูว่าแต่ละส่วนของโปรเจกต์ทำหน้าที่อะไร และส่วนไหนไม่ควรลบก่อนนำเสนอ

## Runtime ที่จำเป็น

| Path | หน้าที่ |
| --- | --- |
| `server.js` | เริ่ม Express server |
| `db.js` | ตั้งค่า MySQL/MariaDB |
| `routes/` | API backend |
| `public/` | หน้าเว็บ dashboard |
| `uploads/` | เก็บรูปที่รับจาก ESP32-CAM/Postman |
| `tools/predict_meter_reading.py` | script ที่ backend ใช้เรียก YOLO ตอน upload |
| `runs/detect/train-8/weights/best.pt` | model YOLO ที่ใช้ predict |
| `.venv/` | Python environment สำหรับ ultralytics |

## ใช้กับ ESP32-CAM

| Path | หน้าที่ |
| --- | --- |
| `wifi_pic_tune/wifi_pic_tune.ino` | code ที่ upload เข้า ESP32-CAM |
| `wifi_pic_tune/ESP32-CAM image/` | รูปตัวอย่างจาก ESP32-CAM |
| `wifi_pic_tune/iphone image/` | รูปตัวอย่างจาก iPhone สำหรับเทียบคุณภาพ |

## ใช้เทรน/ทดสอบ YOLO

| Path | หน้าที่ |
| --- | --- |
| `meter_dataset/` | dataset หลักสำหรับเทรน YOLO |
| `data_digits.yaml` | config dataset สำหรับ YOLO |
| `runs/` | ผล train/predict ของ YOLO |
| `cropped_images/` | รูปตัวเลขที่ crop แล้ว |
| `test_images/` | รูปทดสอบ |
| `test_images_unseen/` | รูปทดสอบที่แยกไว้ |
| `tools/train.py` | train YOLO |
| `tools/check_esp32_train8.py` | test model กับรูป ESP32-CAM |
| `tools/check_train8_folders.py` | test model กับ ESP32-CAM และ iPhone |
| `tools/check_accuracy.py` | เช็คความแม่นกับรูป cropped |
| `tools/crop_train.py` | crop รูปสำหรับเตรียม dataset |

## ไฟล์ที่ไม่ควร commit เพิ่ม

โฟลเดอร์เหล่านี้เป็น output, cache, dependency หรือรูปทดลอง:

- `.venv/`
- `.ultralytics/`
- `node_modules/`
- `uploads/`
- `Ultralytics/`
- `ESP32-CAM image/`
- `iphone image/`
- `wifi_pic_tune/ESP32-CAM image/`
- `wifi_pic_tune/iphone image/`
- `runs/detect/predict*/`
- `runs/detect/esp32_outputs/`

## สิ่งที่ควรระวัง

- อย่าลบ `runs/detect/train-8/weights/best.pt` เพราะ backend ใช้ model นี้ตอน upload
- อย่าลบ `meter_dataset/`, `cropped_images/`, `test_images/` ถ้ายังต้องอธิบายเรื่องการเทรนโมเดล
- ถ้า MySQL เปิดหลังจาก server แล้ว ให้ restart `node server.js`
- ถ้า ESP32-CAM ยิงเข้า PC ไม่ได้ ให้เช็ค IP ของ PC, firewall port 3000 และว่าอยู่ network เดียวกัน
