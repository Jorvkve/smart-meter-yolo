const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

/* ===============================
   ตัวกลางของ Express
=============================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===============================
   ไฟล์ static
=============================== */

// เปิดให้หน้าเว็บเรียกรูปมิเตอร์ที่อัปโหลดไว้ในโฟลเดอร์ uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// เปิดไฟล์หน้าเว็บ CSS และ JavaScript ที่อยู่ใน public
app.use(express.static(path.join(__dirname, "public")));

/* ===============================
   เส้นทาง API
=============================== */
// ฝั่งหน้าเว็บจะเรียกเส้นทางเหล่านี้ผ่าน fetch()
app.use("/api/houses", require("./routes/houses"));
app.use("/api/readings", require("./routes/readings"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/device-ping", require("./routes/devicePing"));

/* ===============================
   เส้นทางหน้าเว็บ
=============================== */

// หน้าแรก
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/index.html"));
});

// หน้าดูมิเตอร์รายวัน
app.get("/daily", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/daily.html"));
});

// หน้าสรุปรายเดือน
app.get("/monthly", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/monthly.html"));
});

// หน้าคำนวณและจัดการบิล
app.get("/billing", (req, res) => {
  // ส่งไฟล์ HTML ของหน้า billing ส่วน logic อยู่ใน public/js/billing.js
  res.sendFile(path.join(__dirname, "public/html/billing.html"));
});

// หน้าผู้ดูแลระบบ
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/admin.html"));
});

/* ===============================
   redirect เส้นทาง .html เดิม
=============================== */

app.get("/index.html", (req, res) => res.redirect("/"));

app.get("/daily.html", (req, res) => res.redirect("/daily"));

app.get("/monthly.html", (req, res) => res.redirect("/monthly"));

app.get("/billing.html", (req, res) => res.redirect("/billing"));

app.get("/admin.html", (req, res) => res.redirect("/admin"));

/* ===============================
   เริ่มต้น server
=============================== */
const PORT = 3000;

app.listen(PORT, () => {
  console.log("=================================");
  console.log("Server running");
  console.log(`http://localhost:${PORT}`);
  console.log("=================================");
});
