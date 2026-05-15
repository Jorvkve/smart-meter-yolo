from pathlib import Path

import cv2
from ultralytics import YOLO


MODEL_PATH = Path("runs/detect/train-8/weights/best.pt")
JOBS = [
    (Path("esp32-cam image/150569"), Path("runs/detect/esp32_outputs/train8_clean_esp32day150269")),
    #(Path("iphone image"), Path("runs/detect/esp32_outputs/train8_clean_iphone")),
]
MIN_CENTER_DISTANCE = 28
COLORS = [
    (9, 60, 93),
    (59, 117, 151),
    (111, 209, 215),
    (93, 248, 216),
    (24, 134, 91),
    (191, 107, 4),
]


def clean_detections(result):
    boxes = result.boxes

    if boxes is None or len(boxes) == 0:
        return []

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

    cleaned = []
    for item in detections:
        if cleaned and abs(item["center_x"] - cleaned[-1]["center_x"]) < MIN_CENTER_DISTANCE:
            if item["conf"] > cleaned[-1]["conf"]:
                cleaned[-1] = item
        else:
            cleaned.append(item)

    return cleaned


def draw_clean_result(result, detections, output_dir):
    image = result.orig_img.copy()

    for index, item in enumerate(detections):
        x1, y1, x2, y2 = item["box"]
        color = COLORS[index % len(COLORS)]
        label = str(item["digit"])

        cv2.rectangle(image, (x1, y1), (x2, y2), color, 3)
        cv2.putText(
            image,
            label,
            (x1, max(24, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            color,
            3,
            cv2.LINE_AA,
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_dir / Path(result.path).name), image)


def run_job(model, source_dir, output_dir):
    print(f"\n=== {source_dir} ===")
    results = model.predict(
        source=str(source_dir),
        save=False,
        conf=0.25,
        iou=0.35,
        agnostic_nms=True,
    )
    print(f"Output: {output_dir}")

    for result in results:
        detections = clean_detections(result)
        draw_clean_result(result, detections, output_dir)

        meter_text = "".join(str(item["digit"]) for item in detections) or "NO DETECTION"
        avg_conf = (
            sum(item["conf"] for item in detections) / len(detections)
            if detections
            else 0
        )
        status = "OK_5_DIGITS" if len(detections) == 5 else "CHECK"

        print(
            f"{Path(result.path).name} -> {meter_text} | "
            f"boxes={len(detections)} | avg_conf={avg_conf:.3f} | {status}"
        )

        for item in detections:
            print(
                f"  digit={item['digit']} conf={item['conf']:.3f} "
                f"box={item['box']}"
            )


def main():
    model = YOLO(str(MODEL_PATH))

    for source_dir, output_dir in JOBS:
        run_job(model, source_dir, output_dir)


if __name__ == "__main__":
    main()
