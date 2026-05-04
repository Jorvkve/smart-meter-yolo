from ultralytics import YOLO
import cv2
import os

model = YOLO("runs/detect/train-8/weights/best.pt")

folder = "cropped_images"

correct = 0
total = 0
wrong_list = []  # เก็บอันที่ผิด

for file in os.listdir(folder):

    if not file.endswith((".jpg", ".png")):
        continue

    real = os.path.splitext(file)[0].split("_")[0]

    path = os.path.join(folder, file)
    img = cv2.imread(path)

    if img is None:
        continue

    results = model(img, conf=0.25)

    if results[0].boxes is None:
        continue

    digits = []

    for box, cls, conf in zip(
        results[0].boxes.xyxy,
        results[0].boxes.cls,
        results[0].boxes.conf
    ):
        if conf < 0.4:
            continue

        x1 = int(box[0])
        x2 = int(box[2])
        center_x = (x1 + x2) // 2
        digits.append((center_x, int(cls)))

    if len(digits) == 0:
        continue

    digits = sorted(digits, key=lambda x: x[0])
    pred = "".join(str(d[1]) for d in digits)

    if pred == real:
        correct += 1
    else:
        wrong_list.append((file, pred, real))  # เก็บไว้แสดงทีหลัง

    total += 1

# ── แสดงผลตอนท้าย ──────────────────────────────
print(f"\n✅ ถูก: {correct}/{total}")
print(f"❌ ผิด: {len(wrong_list)}/{total}")
print(f"🎯 Accuracy: {round(correct/total*100, 2)}%")

if wrong_list:
    print("\n─── รายการที่อ่านผิด ───")
    for file, pred, real in wrong_list:
        print(f"  {file}  →  pred: {pred}  |  real: {real}")