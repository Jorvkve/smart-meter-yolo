from pathlib import Path

import cv2
from ultralytics import YOLO


MODEL_PATH = Path("runs/detect/train-8/weights/best.pt")
SOURCE_DIR = Path("ESP32-CAM image")
OUTPUT_PROJECT = Path("esp32_outputs")
OUTPUT_NAME = "train8_clean"
MIN_CENTER_DISTANCE = 28


def summarize_digits(result):
    boxes = result.boxes

    if boxes is None or len(boxes) == 0:
        return "NO DETECTION", []

    detections = []
    for xyxy, cls, conf in zip(boxes.xyxy, boxes.cls, boxes.conf):
        x1, y1, x2, y2 = [int(v) for v in xyxy.tolist()]
        detections.append({
            "center_x": (x1 + x2) / 2,
            "digit": int(cls),
            "conf": float(conf),
            "box": (x1, y1, x2, y2),
        })

    detections.sort(key=lambda item: item["center_x"])
    detections = remove_close_duplicates(detections)
    meter_text = "".join(str(item["digit"]) for item in detections)
    return meter_text, detections


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


def draw_clean_result(result, detections, output_dir):
    image = result.orig_img.copy()
    colors = [
        (9, 60, 93),
        (59, 117, 151),
        (111, 209, 215),
        (93, 248, 216),
        (24, 134, 91),
    ]

    for index, item in enumerate(detections):
        x1, y1, x2, y2 = item["box"]
        color = colors[index % len(colors)]
        label = str(item["digit"])

        cv2.rectangle(image, (x1, y1), (x2, y2), color, 3)

        label_y = max(24, y1 - 10)
        cv2.putText(
            image,
            label,
            (x1, label_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            color,
            3,
            cv2.LINE_AA,
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_dir / Path(result.path).name), image)


def main():
    model = YOLO(str(MODEL_PATH))
    output_dir = Path("runs/detect") / OUTPUT_PROJECT / OUTPUT_NAME
    results = model.predict(
        source=str(SOURCE_DIR),
        save=False,
        conf=0.25,
        iou=0.35,
        agnostic_nms=True,
    )

    print(f"Output: {output_dir}")

    for result in results:
        meter_text, detections = summarize_digits(result)
        draw_clean_result(result, detections, output_dir)

        print(f"{Path(result.path).name} -> {meter_text} | boxes={len(detections)}")
        for item in detections:
            print(
                f"  digit={item['digit']} conf={item['conf']:.3f} "
                f"box={item['box']}"
            )


if __name__ == "__main__":
    main()
