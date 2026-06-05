# Smart Meter YOLO Dashboard

ระบบอ่านมิเตอร์ไฟฟ้าด้วย ESP32-CAM + YOLO พร้อมเว็บ Dashboard สำหรับดูค่ามิเตอร์รายวัน รายเดือน จัดการข้อมูล และสร้างบิลค่าไฟแบบหอพัก

## ภาพรวมระบบ

- Backend: Express.js API server
- Database: MySQL/MariaDB
- Frontend: Static HTML/CSS/JavaScript ใน `public/`
- Upload: รับภาพมิเตอร์จาก ESP32-CAM หรือ Postman
- AI/OCR: ใช้ YOLO ผ่าน `tools/predict_meter_reading.py`
- Dashboard: ดูภาพรวมรายวัน รายเดือน สถานะอุปกรณ์ และประวัติการอ่าน
- Billing: คำนวณหน่วยไฟและบันทึกประวัติบิล

## หน้าหลัก

- `/` หน้าแรก
- `/daily` ภาพรวมรายวันและกราฟรายบ้าน
- `/monthly` กราฟภาพรวมรายเดือน
- `/billing` คำนวณบิลและดูประวัติบิล
- `/admin` จัดการบ้าน ข้อมูลมิเตอร์ รูปภาพ และการตรวจแก้

## ฟีเจอร์ล่าสุด

- กราฟรายวันเลือกช่วงเวลาได้ เช่น 05:00 ถึง 12:00
- แกน X ของกราฟแสดงช่วงเวลาเหมาะสมกับช่วงที่เลือก
- จุดข้อมูลบนกราฟใช้เวลาอ่านจริง เช่น 15:16 ไม่ปัดเป็น 15:00
- สรุปหน่วยไฟในช่วงที่เลือกจากค่าแรกและค่าสุดท้าย
- แสดงสถานะอุปกรณ์จากเวลา device ping ล่าสุด
- รองรับ burst upload หลายเฟรมจาก ESP32-CAM
- Backend เลือกเฟรมที่เหมาะสมที่สุดจาก burst และเก็บ metadata สำหรับตรวจสอบ
- หน้า Admin ใช้ตรวจรูป แก้ค่ามิเตอร์ และดู confidence/เฟรมที่ YOLO เลือก
- Billing ใช้ cutoff วันที่ 15 เวลา 12:00-12:59 สำหรับคำนวณรายเดือน

## โครงสร้างไฟล์สำคัญ

Backend:

- `server.js` ตั้งค่า Express, static files และ route หลัก
- `db.js` ตั้งค่าการเชื่อมต่อ MySQL/MariaDB
- `routes/houses.js` API จัดการบ้านและสถานะ
- `routes/readings.js` API ข้อมูลมิเตอร์ กราฟ และบิล
- `routes/upload.js` API รับรูปเดี่ยวและ burst upload
- `routes/devicePing.js` API รับ heartbeat จากอุปกรณ์

Frontend:

- `public/html/daily.html` หน้า Dashboard รายวัน
- `public/html/monthly.html` หน้า Dashboard รายเดือน
- `public/html/billing.html` หน้าคำนวณบิล
- `public/html/admin.html` หน้า Admin
- `public/js/daily.js` logic หน้า Daily และกราฟช่วงเวลา
- `public/js/admin.js` logic ตรวจแก้ข้อมูล/รูปภาพ
- `public/css/style.css` style หลักของ Dashboard

AI/Model:

- `tools/predict_meter_reading.py` อ่านเลขมิเตอร์ด้วย YOLO
- `tools/train.py` train model
- `tools/check_accuracy.py` ตรวจ accuracy
- `runs/detect/train-8/weights/best.pt` model ที่ backend ใช้ทำนาย
- `yolov8n.pt`, `yolo26n.pt` model artifacts

ESP32-CAM:

- `wifi_pic_tune/wifi_pic_tune.ino` sketch แบบถ่ายภาพเดี่ยว
- `wifi_pic_tune_burst/wifi_pic_tune_burst.ino` sketch ทดลองถ่าย burst หลายเฟรม

## การติดตั้งและรัน

ติดตั้ง Node dependencies:

```powershell
npm install
```

เปิด MySQL/MariaDB และใช้ database:

```text
database: smart_meter_db
host: localhost
port: 3306
user: root
password:
```

รัน server:

```powershell
node server.js
```

เปิดเว็บ:

```text
http://localhost:3000
```

## Upload API

อัปโหลดรูปเดี่ยว:

```text
POST /api/upload
multipart/form-data
image: File
house_id: Text
reading_value: Number (optional)
```

อัปโหลด burst หลายเฟรม:

```text
POST /api/upload
multipart/form-data
images: File
images: File
images: File
house_id: Text
reading_time: YYYY-MM-DD HH:mm:ss (optional)
burst_duration_ms: Number (optional)
keep_frames: true/false (optional)
```

หมายเหตุ: key ต้องเป็น `house_id` ตรงตัว ถ้ามีอักขระแปลกหรือช่องว่างซ่อนอยู่ backend จะไม่เห็นค่า house_id

## Logic สำคัญ

Daily usage:

```text
หน่วยที่ใช้ในช่วงที่เลือก = เลขมิเตอร์จุดสุดท้าย - เลขมิเตอร์จุดแรก
```

Monthly billing:

```text
หน่วยเดือนนี้ = เลขมิเตอร์ cutoff เดือนนี้ - เลขมิเตอร์ cutoff เดือนก่อน
ยอดเงิน = หน่วยที่ใช้ * อัตราค่าไฟ
```

Device status:

```text
สถานะอุปกรณ์ดูจากเวลาที่ device ping มาหา server ล่าสุด
```

Burst selection:

```text
YOLO อ่านทุกเฟรม แล้ว backend เลือกเฟรมที่เหมาะสมที่สุดจาก confidence, จำนวนกล่องตัวเลข, ค่าที่ใกล้เคียงกลุ่ม/median และความต่อเนื่องจากค่าก่อนหน้า
```

## คำสั่งตรวจโค้ด

```powershell
node --check server.js
node --check routes/houses.js
node --check routes/readings.js
node --check routes/upload.js
node --check routes/devicePing.js
node --check public/js/daily.js
node --check public/js/monthly.js
node --check public/js/billing.js
node --check public/js/admin.js
```

ตรวจ Python:

```powershell
.\.venv\Scripts\python.exe -m py_compile tools\predict_meter_reading.py
```

Smoke test:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/daily
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/readings
```

## หมายเหตุสำหรับการนำเสนอ

ระบบนี้ไม่ได้เชื่อว่า YOLO ถูกเสมอ จึงมีหน้า Admin สำหรับตรวจรูปและแก้ค่ามิเตอร์ก่อนนำไปใช้กับกราฟหรือบิลจริง โดยเฉพาะกรณีภาพเบลอ แสงสะท้อน ตัวเลขคล่อม หรือเลขอ่านกระโดด
