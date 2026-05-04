from ultralytics import YOLO
import cv2
import os

model = YOLO("runs/detect/train-8/weights/best.pt")

folder = "cropped_images"

for file in os.listdir(folder):

    if not file.endswith((".jpg", ".png")):
        continue

    path = os.path.join(folder, file)
    img = cv2.imread(path)

    if img is None:
        print(file, "-> ❌ load error")
        continue

    results = model(img, conf=0.25)

    if results[0].boxes is None or len(results[0].boxes) == 0:
        print(file, "-> ❌ no detection")
        continue

    digits = []

    for box, cls, conf in zip(
        results[0].boxes.xyxy,
        results[0].boxes.cls,
        results[0].boxes.conf):

        if conf < 0.4:
            continue

        x1 = int(box[0])
        x2 = int(box[2])
        center_x = (x1 + x2) // 2

        digits.append((center_x, int(cls), float(conf)))

    if len(digits) == 0:
        print(file, "-> ❌ no valid digits")
        continue

    # เอา top 5 confidence
    digits = sorted(digits, key=lambda x: x[2], reverse=True)[:5]

    # เรียงซ้าย → ขวา
    digits = sorted(digits, key=lambda x: x[0])

    if len(digits) < 5:
        print(file, "-> ❌ incomplete:", digits)
        continue

    meter = "".join(str(d[1]) for d in digits)

    print(file, "->", meter)