const express = require("express");
const router = express.Router();
const db = require("../db");

/* GET READINGS */
router.get("/", (req, res) => {

  const sql = `
    SELECT m.*, h.house_name
    FROM meter_readings m
    JOIN houses h ON h.id = m.house_id
    ORDER BY reading_time DESC
  `;

  db.query(sql, (err, result) => {
    res.json(result);
  });
});

/* GET MONTHLY READINGS */
router.get("/monthly", (req, res) => {

const sql = `
SELECT
  h.house_name,
  DATE_FORMAT(m.reading_time,'%m/%Y') AS month,
  MAX(m.reading_value) - MIN(m.reading_value) AS total_unit
FROM meter_readings m
JOIN houses h ON m.house_id = h.id
GROUP BY h.id, month
ORDER BY month
`;

db.query(sql,(err,result)=>{
    if(err) return res.status(500).json(err);
    res.json(result);
});

});

/* DELETE WRONG READING */
router.delete("/:id", (req, res) => {

  db.query(
    "DELETE FROM meter_readings WHERE id=?",
    [req.params.id]
  );

  res.json({ message: "Reading deleted" });
});

/*
==============================
TODAY READINGS (Daily Chart)
==============================
*/
router.get("/today", (req, res) => {

  const sql = `
    SELECT 
      h.house_name,
      DATE_FORMAT(m.reading_time,'%H:%i') AS time,
      m.reading_value
    FROM meter_readings m
    JOIN houses h ON h.id = m.house_id
    WHERE DATE(m.reading_time) = CURDATE()
    ORDER BY m.reading_time ASC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json(err);
    }

    res.json(result);
  });

});

/*
==============================
Monthly Usage By House
==============================
*/
router.get("/monthly-by-house", (req, res) => {

  const sql = `
    SELECT
      h.id AS house_id,
      h.house_name,
      DATE_FORMAT(m.reading_time,'%m/%Y') AS month,
      MAX(m.reading_value) AS total_unit
    FROM meter_readings m
    JOIN houses h ON h.id = m.house_id
    WHERE h.is_active = 1
    GROUP BY h.id, month
    ORDER BY STR_TO_DATE(CONCAT('01/',month),'%d/%m/%Y')
  `;

  db.query(sql, (err, rows) => {

    if (err) {
      console.log(err);
      return res.status(500).json(err);
    }

    // ✅ ส่งข้อมูลตรง ๆ ไม่ต้องคำนวณลบแล้ว
    res.json(rows);

  });

});

// ===== Available Reading Months =====
router.get("/reading-months", (req, res) => {

  const houseId = req.query.house_id ? Number(req.query.house_id) : null;

  if (req.query.house_id && (!Number.isInteger(houseId) || houseId <= 0)) {
    return res.status(400).json({
      error: "house_id must be a positive integer"
    });
  }

  const params = [];
  let whereClause = "";

  if (houseId) {
    whereClause = "WHERE house_id = ?";
    params.push(houseId);
  }

  const sql = `
    SELECT DISTINCT
      DATE_FORMAT(reading_time, '%Y-%m') AS value,
      DATE_FORMAT(reading_time, '%m/%Y') AS label
    FROM meter_readings
    ${whereClause}
    ORDER BY value
  `;

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).json(err);
    }

    res.json(rows);
  });

});

/*
==============================
Monthly Bill By Selected Range
เลือกเดือนต้นทางและเดือนปลายทางเอง:
หน่วยที่ใช้ = เลขเดือนปลายทาง - เลขเดือนต้นทาง
ค่าไฟ = หน่วยที่ใช้ * ค่าไฟต่อหน่วย
==============================
*/
router.get("/bill-range", (req, res) => {

  const { start, end } = req.query;
  const houseId = Number(req.query.house_id);
  const unitRate = Number(req.query.rate);
  const monthPattern = /^\d{4}-\d{2}$/;

  if (!Number.isInteger(houseId) || houseId <= 0) {
    return res.status(400).json({
      error: "house_id must be a positive integer"
    });
  }

  if (!monthPattern.test(start || "") || !monthPattern.test(end || "")) {
    return res.status(400).json({
      error: "start and end must use YYYY-MM format"
    });
  }

  if (start === end) {
    return res.status(400).json({
      error: "start and end month must be different"
    });
  }

  if (start > end) {
    return res.status(400).json({
      error: "end month must be later than start month"
    });
  }

  if (!Number.isFinite(unitRate) || unitRate < 0) {
    return res.status(400).json({
      error: "rate must be a positive number"
    });
  }

  const sql = `
    WITH first_reading_each_month AS (
      SELECT
        h.id AS house_id,
        h.house_name,
        DATE_FORMAT(m.reading_time, '%Y-%m') AS month_key,
        DATE_FORMAT(m.reading_time, '%m/%Y') AS month_label,
        m.reading_value,
        m.reading_time,
        ROW_NUMBER() OVER (
          PARTITION BY h.id, DATE_FORMAT(m.reading_time, '%Y-%m')
          ORDER BY m.reading_time ASC, m.id ASC
        ) AS row_num
      FROM meter_readings m
      JOIN houses h ON h.id = m.house_id
      WHERE h.is_active = 1 AND h.id = ?
    ),
    start_readings AS (
      SELECT *
      FROM first_reading_each_month
      WHERE row_num = 1 AND month_key = ?
    ),
    end_readings AS (
      SELECT *
      FROM first_reading_each_month
      WHERE row_num = 1 AND month_key = ?
    )
    SELECT
      s.house_id,
      s.house_name,
      s.month_label AS start_month,
      e.month_label AS end_month,
      s.reading_value AS start_reading,
      e.reading_value AS end_reading,
      e.reading_value - s.reading_value AS usage_unit,
      ROUND((e.reading_value - s.reading_value) * ?, 2) AS bill_amount,
      s.reading_time AS start_reading_time,
      e.reading_time AS end_reading_time
    FROM start_readings s
    JOIN end_readings e ON e.house_id = s.house_id
    ORDER BY s.house_id
  `;

  db.query(sql, [houseId, start, end, unitRate], (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).json(err);
    }

    res.json({
      house_id: houseId,
      start,
      end,
      rate: unitRate,
      rows
    });
  });

});

/*
==============================
Monthly Bill By House
ใช้เลขอ่านค่าครั้งแรกของแต่ละเดือน แล้วคำนวณ:
หน่วยที่ใช้ = เลขต้นเดือนถัดไป - เลขต้นเดือนนี้
ค่าไฟ = หน่วยที่ใช้ * ค่าไฟต่อหน่วย
==============================
*/
router.get("/monthly-bills", (req, res) => {

  const unitRate = Number(req.query.rate);

  if (!Number.isFinite(unitRate) || unitRate < 0) {
    return res.status(400).json({
      error: "rate must be a positive number"
    });
  }

  const sql = `
    WITH first_reading_each_month AS (
      SELECT
        h.id AS house_id,
        h.house_name,
        DATE_FORMAT(m.reading_time, '%Y-%m-01') AS month_start,
        m.reading_value,
        ROW_NUMBER() OVER (
          PARTITION BY h.id, DATE_FORMAT(m.reading_time, '%Y-%m')
          ORDER BY m.reading_time ASC, m.id ASC
        ) AS row_num
      FROM meter_readings m
      JOIN houses h ON h.id = m.house_id
      WHERE h.is_active = 1
    ),
    month_start_readings AS (
      SELECT
        house_id,
        house_name,
        month_start,
        reading_value AS start_reading,
        LEAD(reading_value) OVER (
          PARTITION BY house_id
          ORDER BY month_start
        ) AS next_start_reading
      FROM first_reading_each_month
      WHERE row_num = 1
    )
    SELECT
      house_id,
      house_name,
      DATE_FORMAT(month_start, '%m/%Y') AS month,
      start_reading,
      next_start_reading,
      GREATEST(next_start_reading - start_reading, 0) AS usage_unit,
      ROUND(GREATEST(next_start_reading - start_reading, 0) * ?, 2) AS bill_amount
    FROM month_start_readings
    WHERE next_start_reading IS NOT NULL
    ORDER BY STR_TO_DATE(CONCAT('01/', DATE_FORMAT(month_start, '%m/%Y')), '%d/%m/%Y'), house_id
  `;

  db.query(sql, [unitRate], (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).json(err);
    }

    res.json({
      rate: unitRate,
      rows
    });
  });

});

// ===== Latest Meter Reading Per House =====
router.get("/latest", (req, res) => {

  const sql = `
    SELECT 
      h.id,
      h.house_name,
      r.reading_value,
      r.image_filename,
      r.reading_time
    FROM houses h
    LEFT JOIN meter_readings r 
      ON r.id = (
        SELECT id 
        FROM meter_readings
        WHERE house_id = h.id
        ORDER BY reading_time DESC
        LIMIT 1
      )
  `;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });

});

// ===== ALL READINGS (ADMIN) =====
router.get("/all", (req, res) => {

  const sql = `
    SELECT 
      m.id,
      h.house_name,
      m.reading_value,
      m.image_filename,
      m.reading_time
    FROM meter_readings m
    JOIN houses h ON h.id = m.house_id
    ORDER BY m.reading_time DESC
  `;

  db.query(sql,(err,result)=>{
    if(err) return res.status(500).json(err);
    res.json(result);
  });

});

module.exports = router;
