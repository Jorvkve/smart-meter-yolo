import os

image_folder = r"D:\CPE491 Project\smart-meter-backend\Project_The_End\meter_dataset\images\train"
label_folder = r"D:\CPE491 Project\smart-meter-backend\Project_The_End\meter_dataset\labels\train"

for file in os.listdir(image_folder):

    if not file.endswith((".jpg", ".png")):
        continue

    name = os.path.splitext(file)[0]
    label_path = os.path.join(label_folder, name + ".txt")
    image_path = os.path.join(image_folder, file)

    if not os.path.exists(label_path):
        print("❌ ไม่มี label:", file)
        continue

    digits = []

    with open(label_path) as f:
        for line in f:
            parts = line.split()
            cls = int(parts[0])
            x_center = float(parts[1])

            digits.append((x_center, cls))

    if len(digits) == 0:
        print("❌ ไม่มี digit:", file)
        continue

    # เรียงซ้าย → ขวา
    digits = sorted(digits, key=lambda x: x[0])

    # รวมเป็นเลข
    meter = "".join(str(d[1]) for d in digits)

    # 👉 ชื่อใหม่
    new_name = meter + os.path.splitext(file)[1]
    new_path = os.path.join(image_folder, new_name)

    # กันชื่อซ้ำ
    counter = 1
    while os.path.exists(new_path):
        new_name = f"{meter}_{counter}" + os.path.splitext(file)[1]
        new_path = os.path.join(image_folder, new_name)
        counter += 1

    os.rename(image_path, new_path)

    print(f"✅ {file} → {new_name}")

print("\n🎯 เปลี่ยนชื่อเสร็จแล้ว")