from ultralytics import YOLO

model = YOLO("runs/detect/train-8/weights/best.pt")

model.predict(
    source=r"D:\CPE491 Project\smart-meter-backend\Project_The_End\cropped_images\20260415_095535.jpg",
    save=True,
    conf=0.25,
    line_width=3,
    show_conf=False
)