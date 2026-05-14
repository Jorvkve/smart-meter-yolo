# from ultralytics import YOLO

# def main():
#     model = YOLO("yolov8n.pt")

#     model.train(
#         data="data_digits.yaml",
#         epochs=100,
#         imgsz=640,
#         batch=4,
#         device=0
#     )

# if __name__ == "__main__":
#     main()

from ultralytics import YOLO

def main():
    model = YOLO("runs/detect/train-7/weights/best.pt")  # 👈 ใช้ของเดิม

    model.train(
        data="data_digits.yaml",
        epochs=150,     # 👈 เพิ่ม
        imgsz=640,
        batch=4,
        device=0,
        workers=0
    )

if __name__ == "__main__":
    main()