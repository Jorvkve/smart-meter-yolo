import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_CONFIG_DIR = PROJECT_ROOT / ".ultralytics"
LOCAL_CONFIG_DIR.mkdir(exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", str(LOCAL_CONFIG_DIR))
os.environ.setdefault("MPLCONFIGDIR", str(LOCAL_CONFIG_DIR))

from ultralytics import YOLO


MODEL_PATH = Path("runs/detect/train-8/weights/best.pt")
MIN_CENTER_DISTANCE = 28


def remove_close_duplicates(detections):
    cleaned = []

    for item in detections:
        if not cleaned:
            cleaned.append(item)
            continue

        previous = cleaned[-1]
        if abs(item["center_x"] - previous["center_x"]) < MIN_CENTER_DISTANCE:
            if item["conf"] > previous["conf"]:
                cleaned[-1] = item
        else:
            cleaned.append(item)

    return cleaned


def summarize_digits(result):
    boxes = result.boxes

    if boxes is None or len(boxes) == 0:
        return "", []

    detections = []
    for xyxy, cls, conf in zip(boxes.xyxy, boxes.cls, boxes.conf):
        x1, y1, x2, y2 = [int(v) for v in xyxy.tolist()]
        detections.append({
            "center_x": (x1 + x2) / 2,
            "digit": int(cls),
            "conf": float(conf),
            "box": [x1, y1, x2, y2],
        })

    detections.sort(key=lambda item: item["center_x"])
    detections = remove_close_duplicates(detections)
    meter_text = "".join(str(item["digit"]) for item in detections)
    return meter_text, detections


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: predict_meter_reading.py <image_path>")

    image_path = Path(sys.argv[1])

    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")

    if not MODEL_PATH.exists():
        raise SystemExit(f"Model not found: {MODEL_PATH}")

    model = YOLO(str(MODEL_PATH))
    results = model.predict(
        source=str(image_path),
        save=False,
        conf=0.25,
        iou=0.35,
        agnostic_nms=True,
        verbose=False,
    )

    meter_text, detections = summarize_digits(results[0])
    reading_value = int(meter_text) if meter_text.isdigit() else None
    avg_conf = (
        sum(item["conf"] for item in detections) / len(detections)
        if detections else None
    )

    print(json.dumps({
        "reading_value": reading_value,
        "meter_text": meter_text,
        "boxes": len(detections),
        "avg_conf": avg_conf,
    }))


if __name__ == "__main__":
    main()
