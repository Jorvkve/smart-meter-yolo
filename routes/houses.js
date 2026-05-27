const express = require("express");
const router = express.Router();
const db = require("../db");

/*
==============================
API จัดการข้อมูลบ้าน
==============================
*/

// ใช้ในหน้า /daily, /monthly, /billing และ /admin เพื่อดึงรายชื่อบ้านไปแสดงใน dropdown/รายการบ้าน
router.get("/", (req, res) => {
  const sql = "SELECT * FROM houses ORDER BY id ASC";

  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        error: "Database error",
      });
    }

    res.json(result);
  });
});

// ใช้ในหน้า /admin สำหรับเพิ่มบ้านใหม่ลงฐานข้อมูล
router.post("/", (req, res) => {
  const { house_name: houseName, owner_name: ownerName, address, phone } =
    req.body;

  if (!houseName) {
    return res.status(400).json({
      error: "house_name required",
    });
  }

  const sql = `
    INSERT INTO houses
      (house_name, owner_name, address, phone)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [houseName, ownerName, address, phone], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        error: "Insert failed",
      });
    }

    res.json({
      message: "House added successfully",
      house_id: result.insertId,
    });
  });
});

// ใช้ในหน้า /admin สำหรับแก้ไขข้อมูลบ้าน เช่น ชื่อบ้าน เจ้าของ ที่อยู่ และเบอร์โทร
router.put("/:id", (req, res) => {
  const { house_name: houseName, owner_name: ownerName, address, phone } =
    req.body;

  const sql = `
    UPDATE houses
    SET
      house_name = ?,
      owner_name = ?,
      address = ?,
      phone = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [houseName, ownerName, address, phone, req.params.id],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json(err);
      }

      res.json({
        message: "House updated",
      });
    }
  );
});

// route สำรองของ /admin สำหรับปิดใช้งานบ้านโดยไม่ลบข้อมูลจริงออกจากฐานข้อมูล
router.delete("/:id", (req, res) => {
  // ปิดใช้งานบ้านแทนการลบ เพื่อให้ข้อมูล readings และ bills เก่ายังอ้างอิงบ้านเดิมได้
  const sql = "UPDATE houses SET is_active = 0 WHERE id = ?";

  db.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({
      message: "House disabled",
    });
  });
});

// ใช้ในหน้า /admin สำหรับสลับสถานะบ้านระหว่างเปิดใช้งานกับปิดใช้งาน
router.put("/toggle/:id", (req, res) => {
  // admin ใช้เปิด/ปิดการแสดงบ้าน โดยไม่ลบประวัติเดิม
  const sql = `
    UPDATE houses
    SET is_active =
      CASE
        WHEN is_active = 1 THEN 0
        ELSE 1
      END
    WHERE id = ?
  `;

  db.query(sql, [req.params.id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        error: "Toggle failed",
      });
    }

    res.json({
      message: "House status updated",
    });
  });
});

module.exports = router;
