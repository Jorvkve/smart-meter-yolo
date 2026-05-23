const express = require("express");
const router = express.Router();
const db = require("../db");

function ensureBillHistoryTable(callback) {
  const sql = `
    CREATE TABLE IF NOT EXISTS electric_bills (
      id INT NOT NULL AUTO_INCREMENT,
      bill_no VARCHAR(80) NOT NULL,
      house_id INT NOT NULL,
      start_month CHAR(7) NOT NULL,
      end_month CHAR(7) NOT NULL,
      start_reading FLOAT NOT NULL,
      end_reading FLOAT NOT NULL,
      usage_unit FLOAT NOT NULL,
      unit_rate DECIMAL(10,2) NOT NULL,
      total_amount DECIMAL(12,2) NOT NULL,
      start_reading_time DATETIME NULL,
      end_reading_time DATETIME NULL,
      issue_date DATETIME NOT NULL,
      due_date DATETIME NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY bill_no (bill_no),
      KEY house_id (house_id),
      CONSTRAINT electric_bills_ibfk_1 FOREIGN KEY (house_id) REFERENCES houses(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;

  db.query(sql, callback);
}

function normalizeReadingRows(rows) {
  return rows.map(row => {
    if (typeof row.frames_summary === "string") {
      try {
        row.frames_summary = JSON.parse(row.frames_summary);
      } catch (err) {
        row.frames_summary = null;
      }
    }

    return row;
  });
}

/* GET READINGS */
router.get("/", (req, res) => {

  const sql = `
    SELECT m.*, h.house_name
    FROM meter_readings m
    JOIN houses h ON h.id = m.house_id
    ORDER BY reading_time DESC
  `;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(normalizeReadingRows(result));
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

/* UPDATE WRONG READING VALUE */
router.put("/:id", (req, res) => {

  const readingId = Number(req.params.id);
  const readingValue = Number(req.body.reading_value);

  if (!Number.isInteger(readingId) || readingId <= 0) {
    return res.status(400).json({
      error: "reading id must be a positive integer"
    });
  }

  if (!Number.isFinite(readingValue) || readingValue < 0) {
    return res.status(400).json({
      error: "reading_value must be a positive number"
    });
  }

  db.query(
    "UPDATE meter_readings SET reading_value=? WHERE id=?",
    [readingValue, readingId],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: "reading not found"
        });
      }

      res.json({
        message: "Reading updated",
        id: readingId,
        reading_value: readingValue
      });
    }
  );
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

router.get("/bill-history", (req, res) => {

  const houseId = req.query.house_id ? Number(req.query.house_id) : null;

  if (req.query.house_id && (!Number.isInteger(houseId) || houseId <= 0)) {
    return res.status(400).json({
      error: "house_id must be a positive integer"
    });
  }

  ensureBillHistoryTable((tableErr) => {
    if (tableErr) {
      console.log(tableErr);
      return res.status(500).json({
        error: "Cannot prepare bill history table"
      });
    }

    const params = [];
    let whereClause = "";

    if (houseId) {
      whereClause = "WHERE b.house_id = ?";
      params.push(houseId);
    }

    const sql = `
      SELECT
        b.id,
        b.bill_no,
        b.house_id,
        h.house_name,
        b.start_month,
        b.end_month,
        b.start_reading,
        b.end_reading,
        b.usage_unit,
        b.unit_rate,
        b.total_amount,
        b.start_reading_time,
        b.end_reading_time,
        b.issue_date,
        b.due_date,
        b.created_at
      FROM electric_bills b
      JOIN houses h ON h.id = b.house_id
      ${whereClause}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT 30
    `;

    db.query(sql, params, (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      res.json(rows);
    });
  });

});

router.post("/bill-history", (req, res) => {

  const {
    bill_no: billNo,
    start_month: startMonth,
    end_month: endMonth,
    start_reading_time: startReadingTime,
    end_reading_time: endReadingTime,
    issue_date: issueDate,
    due_date: dueDate
  } = req.body;

  const houseId = Number(req.body.house_id);
  const startReading = Number(req.body.start_reading);
  const endReading = Number(req.body.end_reading);
  const usageUnit = Number(req.body.usage_unit);
  const unitRate = Number(req.body.unit_rate);
  const totalAmount = Number(req.body.total_amount);
  const monthPattern = /^\d{4}-\d{2}$/;

  if (!billNo || String(billNo).length > 80) {
    return res.status(400).json({
      error: "bill_no is required"
    });
  }

  if (!Number.isInteger(houseId) || houseId <= 0) {
    return res.status(400).json({
      error: "house_id must be a positive integer"
    });
  }

  if (!monthPattern.test(startMonth || "") || !monthPattern.test(endMonth || "")) {
    return res.status(400).json({
      error: "start_month and end_month must use YYYY-MM format"
    });
  }

  if (
    !Number.isFinite(startReading) ||
    !Number.isFinite(endReading) ||
    !Number.isFinite(usageUnit) ||
    !Number.isFinite(unitRate) ||
    !Number.isFinite(totalAmount)
  ) {
    return res.status(400).json({
      error: "bill numeric values are required"
    });
  }

  ensureBillHistoryTable((tableErr) => {
    if (tableErr) {
      console.log(tableErr);
      return res.status(500).json({
        error: "Cannot prepare bill history table"
      });
    }

    const sql = `
      INSERT INTO electric_bills (
        bill_no,
        house_id,
        start_month,
        end_month,
        start_reading,
        end_reading,
        usage_unit,
        unit_rate,
        total_amount,
        start_reading_time,
        end_reading_time,
        issue_date,
        due_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      billNo,
      houseId,
      startMonth,
      endMonth,
      startReading,
      endReading,
      usageUnit,
      unitRate,
      totalAmount,
      startReadingTime || null,
      endReadingTime || null,
      issueDate,
      dueDate
    ];

    db.query(sql, params, (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      res.status(201).json({
        message: "Bill history saved",
        id: result.insertId,
        bill_no: billNo
      });
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
    month_readings AS (
      SELECT
        house_id,
        house_name,
        month_start,
        reading_value AS current_reading,
        LAG(reading_value) OVER (
          PARTITION BY house_id
          ORDER BY month_start
        ) AS previous_reading
      FROM first_reading_each_month
      WHERE row_num = 1
    )
    SELECT
      house_id,
      house_name,
      DATE_FORMAT(month_start, '%m/%Y') AS month,
      previous_reading AS start_reading,
      current_reading AS end_reading,
      previous_reading,
      current_reading,
      GREATEST(current_reading - previous_reading, 0) AS usage_unit,
      ROUND(GREATEST(current_reading - previous_reading, 0) * ?, 2) AS bill_amount
    FROM month_readings
    WHERE previous_reading IS NOT NULL
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
      r.id AS reading_id,
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
    ORDER BY h.id ASC
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
