const express = require("express");
const router = express.Router();
const db = require("../db");

/*
==============================
API สถานะอุปกรณ์ ESP32-CAM
==============================
*/

// สร้างตาราง device_heartbeats ถ้ายังไม่มี เพื่อเก็บสถานะล่าสุดของอุปกรณ์แต่ละตัว
function ensureDevicePingTable(callback) {
  const sql = `
    CREATE TABLE IF NOT EXISTS device_heartbeats (
      id INT NOT NULL AUTO_INCREMENT,
      device_id VARCHAR(80) NOT NULL,
      house_id INT NULL,
      ip_address VARCHAR(45) NULL,
      uptime_ms BIGINT NULL,
      free_heap INT NULL,
      wifi_rssi INT NULL,
      status_message VARCHAR(80) NULL,
      last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY device_id (device_id),
      KEY house_id (house_id),
      KEY last_seen (last_seen)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;

  db.query(sql, callback);
}

// เตรียมตารางตั้งแต่ตอนโหลด route เพื่อให้ POST/GET ใช้งานได้ทันที
ensureDevicePingTable((err) => {
  if (err) {
    console.warn("Could not create device_heartbeats table:", err.message);
  }
});

// ใช้โดย ESP32-CAM เพื่อส่ง ping/heartbeat มาบอก backend ว่าอุปกรณ์ยังออนไลน์อยู่
router.post("/", (req, res) => {
  const deviceId = String(req.body.device_id || "").trim();
  const houseId = req.body.house_id ? Number(req.body.house_id) : null;
  const uptimeMs = req.body.uptime_ms ? Number(req.body.uptime_ms) : null;
  const freeHeap = req.body.free_heap ? Number(req.body.free_heap) : null;
  const wifiRssi = req.body.wifi_rssi ? Number(req.body.wifi_rssi) : null;
  const statusMessage = String(req.body.status || "alive").slice(0, 80);
  const ipAddress = req.ip?.replace("::ffff:", "") || null;

  if (!deviceId) {
    return res.status(400).json({
      error: "device_id is required",
    });
  }

  if (houseId !== null && (!Number.isInteger(houseId) || houseId <= 0)) {
    return res.status(400).json({
      error: "house_id must be a positive integer",
    });
  }

  const sql = `
    INSERT INTO device_heartbeats
      (device_id, house_id, ip_address, uptime_ms, free_heap, wifi_rssi, status_message, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      house_id = VALUES(house_id),
      ip_address = VALUES(ip_address),
      uptime_ms = VALUES(uptime_ms),
      free_heap = VALUES(free_heap),
      wifi_rssi = VALUES(wifi_rssi),
      status_message = VALUES(status_message),
      last_seen = NOW()
  `;

  db.query(
    sql,
    [deviceId, houseId, ipAddress, uptimeMs, freeHeap, wifiRssi, statusMessage],
    (err) => {
      if (err) {
        console.log(err);
        return res.status(500).json({
          error: "Database error",
        });
      }

      res.json({
        message: "Device ping received",
        device_id: deviceId,
        house_id: houseId,
        status: statusMessage,
      });
    },
  );
});

// ใช้ในหน้า /admin เพื่อดึงรายการอุปกรณ์ทั้งหมด พร้อมคำนวณว่า online หรือ offline จากเวลา last_seen
router.get("/", (req, res) => {
  const sql = `
    SELECT
      d.*,
      h.house_name,
      TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) AS seconds_since_seen,
      CASE
        WHEN TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) <= 600 THEN 1 -- ถ้า ping ล่าสุดไม่เกิน 10 นาที ถือว่า online
        ELSE 0 -- -- ถ้าเกิน 10 นาที ถือว่า offline
      END AS is_online
    FROM device_heartbeats d
    LEFT JOIN houses h ON h.id = d.house_id
    ORDER BY d.last_seen DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).json({
        error: "Database error",
      });
    }

    res.json(rows);
  });
});

module.exports = router;
