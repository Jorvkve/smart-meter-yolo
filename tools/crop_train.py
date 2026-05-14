from ultralytics import YOLO
import cv2
import os

# โหลดโมเดล
model = YOLO("runs/detect/train-8/weights/best.pt")

input_folder = r"meter_dataset\images\train"
output_folder = "cropped_images"

# สร้างโฟลเดอร์ถ้ายังไม่มี
os.makedirs(output_folder, exist_ok=True)

for file in os.listdir(input_folder):

    if not file.endswith((".jpg", ".png")):
        continue

    path = os.path.join(input_folder, file)
    img = cv2.imread(path)

    if img is None:
        print("❌ โหลดไม่ได้:", file)
        continue

    results = model(img, conf=0.3)

    if results[0].boxes is None or len(results[0].boxes) == 0:
        print("❌ ไม่เจอเลข:", file)
        continue

    boxes = results[0].boxes.xyxy.cpu().numpy()

    # 🔥 กรองเฉพาะแถวเดียว
    centers_y = [(b[1] + b[3]) / 2 for b in boxes]
    avg_y = sum(centers_y) / len(centers_y)
    boxes = [b for b in boxes if abs(((b[1]+b[3])/2) - avg_y) < 40]

    # sort ตามแนวแกน X (ซ้าย → ขวา)  ✅ indent ให้ตรงกับบรรทัดอื่น
    boxes = sorted(boxes, key=lambda b: b[0])

    # รวม bounding box
    x1 = int(min(box[0] for box in boxes))
    y1 = int(min(box[1] for box in boxes))
    x2 = int(max(box[2] for box in boxes))
    y2 = int(max(box[3] for box in boxes))

    # margin
    margin = 40
    x1 = max(0, x1 - margin)
    y1 = max(0, y1 - margin)
    x2 = min(img.shape[1], x2 + margin)
    y2 = min(img.shape[0], y2 + margin)

    crop = img[y1:y2, x1:x2]

    if crop.size == 0:
        print("❌ crop พัง:", file)
        continue

    # ขยายภาพ (ช่วยให้คมขึ้น)
    crop = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

    # เซฟไฟล์
    save_path = os.path.join(output_folder, file)
    cv2.imwrite(save_path, crop)

    print("✅ saved:", save_path)

print("\n🎯 เสร็จแล้ว")