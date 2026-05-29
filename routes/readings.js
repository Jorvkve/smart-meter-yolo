const express = require("express");
const router = express.Router();
const db = require("../db");

const BILLING_CUTOFF_DAY = 15;
const BILLING_CUTOFF_START_TIME = "12:00:00";
const BILLING_CUTOFF_END_TIME = "13:00:00";

// รอบตัดบิลปัจจุบัน: ใช้ readings วันที่ 15 ตั้งแต่ 12:00:00 ถึงก่อน 13:00:00
// ถ้าเดือนหนึ่งมีหลายรายการในช่วงนี้ ระบบเลือกเวลาที่เจอก่อนสุดเป็นตัวแทนเดือนนั้น

/*
==============================
ตัวช่วยของไฟล์นี้
==============================
*/

// ตรวจให้แน่ใจว่าตารางประวัติบิลมีอยู่ก่อนที่ API ประวัติบิลจะใช้งาน
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
      unit_rate DECIMAL(12,4) NOT NULL,
      total_amount DECIMAL(12,2) NOT NULL,
      start_reading_time DATETIME NULL,
      end_reading_time DATETIME NULL,
      issue_date DATETIME NOT NULL,
      due_date DATETIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      cancelled_at DATETIME NULL,
      cancel_reason VARCHAR(255) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY bill_no (bill_no),
      KEY house_id (house_id),
      CONSTRAINT electric_bills_ibfk_1 FOREIGN KEY (house_id) REFERENCES houses(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;

  db.query(sql, (err) => {
    if (err) return callback(err);
    ensureBillHistoryColumns((columnErr) => {
      if (columnErr) return callback(columnErr);
      ensureBillHistoryRatePrecision(callback);
    });
  });
}

// เพิ่มคอลัมน์ใหม่ของประวัติบิลให้อัตโนมัติ สำหรับฐานข้อมูลเครื่องเก่าที่ยังไม่มีคอลัมน์เหล่านี้
function ensureBillHistoryColumns(callback) {
  const billColumns = [
    ["status", "VARCHAR(20) NOT NULL DEFAULT 'active'"],
    ["cancelled_at", "DATETIME NULL"],
    ["cancel_reason", "VARCHAR(255) NULL"],
  ];

  db.query("SHOW COLUMNS FROM electric_bills", (err, columns) => {
    if (err) return callback(err);

    const existingColumns = new Set(columns.map((column) => column.Field));
    const missingColumns = billColumns.filter(
      ([column]) => !existingColumns.has(column)
    );

    if (!missingColumns.length) {
      callback();
      return;
    }

    // เพิ่มคอลัมน์ที่ขาดทีละตัว เพื่อไม่ให้ query หลายตัวชนกัน
    function addNextColumn(index) {
      if (index >= missingColumns.length) {
        callback();
        return;
      }

      const [column, definition] = missingColumns[index];

      db.query(
        `ALTER TABLE electric_bills ADD COLUMN ${column} ${definition}`,
        (alterErr) => {
          if (alterErr) return callback(alterErr);
          addNextColumn(index + 1);
        }
      );
    }

    addNextColumn(0);
  });
}

// ปรับชนิดข้อมูล unit_rate ให้เก็บค่าอย่าง 3.2484 ได้ ไม่ถูกปัดเหลือ 3.25 ตอนบันทึกบิล
function ensureBillHistoryRatePrecision(callback) {
  db.query("SHOW COLUMNS FROM electric_bills LIKE 'unit_rate'", (err, rows) => {
    if (err) return callback(err);

    const columnType = String(rows[0]?.Type || "").toLowerCase();
    const decimalMatch = columnType.match(/^decimal\((\d+),(\d+)\)$/);
    const decimalScale = decimalMatch ? Number(decimalMatch[2]) : 0;

    if (decimalScale >= 4) {
      callback();
      return;
    }

    db.query(
      "ALTER TABLE electric_bills MODIFY COLUMN unit_rate DECIMAL(12,4) NOT NULL",
      callback
    );
  });
}

// MySQL อาจคืนค่า JSON เป็น string จึงแปลง frames_summary กลับเป็น object/array
function normalizeReadingRows(rows) {
  return rows.map((row) => {
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

/*
==============================
API การอ่านค่ามิเตอร์
==============================
*/

// ใช้ในหน้า /daily และ /admin เพื่อดึง readings ทั้งหมดพร้อมชื่อบ้าน
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

// route เก่า/สำรองสำหรับข้อมูลรายเดือนแบบ max-min; หน้า /monthly ปัจจุบันใช้ /monthly-bills แทน
router.get("/monthly", (req, res) => {
  const sql = `
    SELECT
      h.house_name,
      DATE_FORMAT(m.reading_time, '%m/%Y') AS month,
      MAX(m.reading_value) - MIN(m.reading_value) AS total_unit
    FROM meter_readings m
    JOIN houses h ON m.house_id = h.id
    GROUP BY h.id, month
    ORDER BY month
  `;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
});

// ใช้ในหน้า /admin เมื่อต้องลบ reading ที่ผิดและไม่ควรอยู่ในประวัติ
router.delete("/:id", (req, res) => {
  db.query("DELETE FROM meter_readings WHERE id=?", [req.params.id]);
  res.json({ message: "Reading deleted" });
});

// ใช้ในหน้า /admin สำหรับแก้ไขเลข reading_value ของ reading หนึ่งรายการ
router.put("/:id", (req, res) => {
  const readingId = Number(req.params.id);
  const rawReadingValue = req.body.reading_value;
  const readingValueText =
    typeof rawReadingValue === "string" ? rawReadingValue.trim() : rawReadingValue;
  const readingValue = Number(readingValueText);

  if (!Number.isInteger(readingId) || readingId <= 0) {
    return res.status(400).json({
      error: "reading id must be a positive integer",
    });
  }

  if (
    readingValueText === undefined ||
    readingValueText === null ||
    readingValueText === "" ||
    !Number.isFinite(readingValue) ||
    readingValue < 0
  ) {
    return res.status(400).json({
      error: "reading_value must be a non-negative number",
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
          error: "reading not found",
        });
      }

      res.json({
        message: "Reading updated",
        id: readingId,
        reading_value: readingValue,
      });
    }
  );
});

/*
==============================
API สำหรับ dashboard
==============================
*/

// route สำรองสำหรับ dashboard รายวัน; หน้า /daily ปัจจุบันใช้ /latest และ /api/readings เป็นหลัก
router.get("/today", (req, res) => {
  const sql = `
    SELECT 
      h.house_name,
      DATE_FORMAT(m.reading_time, '%H:%i') AS time,
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

// route สำรองสำหรับภาพรวมรายเดือนหลายบ้าน; หน้า /monthly ปัจจุบันใช้ /monthly-bills เป็นหลัก
router.get("/monthly-by-house", (req, res) => {
  const sql = `
    SELECT
      h.id AS house_id,
      h.house_name,
      DATE_FORMAT(m.reading_time, '%m/%Y') AS month,
      MAX(m.reading_value) AS total_unit
    FROM meter_readings m
    JOIN houses h ON h.id = m.house_id
    WHERE h.is_active = 1
    GROUP BY h.id, month
    ORDER BY STR_TO_DATE(CONCAT('01/', month), '%d/%m/%Y')
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).json(err);
    }

    // ส่งค่าอ่านมิเตอร์รายเดือนตรง ๆ ให้ dashboard นำไปแสดงผล
    res.json(rows);
  });
});

// ใช้ในหน้า /billing เพื่อดึงเฉพาะเดือนที่มี readings ตรงรอบตัดบิลให้เลือก start/end month
router.get("/reading-months", (req, res) => {
  const houseId = req.query.house_id ? Number(req.query.house_id) : null;

  if (req.query.house_id && (!Number.isInteger(houseId) || houseId <= 0)) {
    return res.status(400).json({
      error: "house_id must be a positive integer",
    });
  }

  const params = [
    BILLING_CUTOFF_DAY,
    BILLING_CUTOFF_START_TIME,
    BILLING_CUTOFF_END_TIME,
  ];
  // เงื่อนไขนี้ทำให้ dropdown เดือนแสดงเฉพาะเดือนที่มีข้อมูลวันที่ 15 ช่วง 12:00-12:59
  const conditions = [
    "reading_value IS NOT NULL",
    "DAY(reading_time) = ?",
    "TIME(reading_time) >= ?",
    "TIME(reading_time) < ?",
  ];

  if (houseId) {
    conditions.push("house_id = ?");
    params.push(houseId);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

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
API สำหรับ billing
==============================
*/

// ใช้ในหน้า /billing เพื่อคำนวณบิลจากช่วงเดือนที่เลือก
// สูตรคือ reading รอบตัดบิลเดือนปลายทาง - reading รอบตัดบิลเดือนต้นทาง
router.get("/bill-range", (req, res) => {
  const { start, end } = req.query;
  const houseId = Number(req.query.house_id);
  const unitRate = Number(req.query.rate);
  const monthPattern = /^\d{4}-\d{2}$/;

  if (!Number.isInteger(houseId) || houseId <= 0) {
    return res.status(400).json({
      error: "house_id must be a positive integer",
    });
  }

  if (!monthPattern.test(start || "") || !monthPattern.test(end || "")) {
    return res.status(400).json({
      error: "start and end must use YYYY-MM format",
    });
  }

  if (start === end) {
    return res.status(400).json({
      error: "start and end month must be different",
    });
  }

  if (start > end) {
    return res.status(400).json({
      error: "end month must be later than start month",
    });
  }

  if (!Number.isFinite(unitRate) || unitRate < 0) {
    return res.status(400).json({
      error: "rate must be a positive number",
    });
  }

  const sql = `
    WITH cutoff_reading_each_month AS (
      -- กรองเฉพาะ readings ที่อยู่ในรอบตัดบิล แล้วเรียงเพื่อเลือกตัวแรกของแต่ละเดือน
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
      WHERE h.is_active = 1
        AND h.id = ?
        AND m.reading_value IS NOT NULL
        AND DAY(m.reading_time) = ?
        AND TIME(m.reading_time) >= ?
        AND TIME(m.reading_time) < ?
    ),
    start_readings AS (
      -- ค่าอ่านมิเตอร์เดือนต้นทาง เช่น เลือก 2026-04 จะใช้รายการวันที่ 15 เม.ย. ช่วงเที่ยง
      SELECT *
      FROM cutoff_reading_each_month
      WHERE row_num = 1 AND month_key = ?
    ),
    end_readings AS (
      -- ค่าอ่านมิเตอร์เดือนปลายทาง เช่น เลือก 2026-05 จะใช้รายการวันที่ 15 พ.ค. ช่วงเที่ยง
      SELECT *
      FROM cutoff_reading_each_month
      WHERE row_num = 1 AND month_key = ?
    )
    SELECT
      s.house_id,
      s.house_name,
      s.month_label AS start_month,
      e.month_label AS end_month,
      s.reading_value AS start_reading,
      e.reading_value AS end_reading,
      -- มิเตอร์เป็นเลขสะสม ดังนั้นหน่วยที่ใช้คือเลขปลายทางลบเลขต้นทาง
      e.reading_value - s.reading_value AS usage_unit,
      ROUND((e.reading_value - s.reading_value) * ?, 2) AS bill_amount,
      s.reading_time AS start_reading_time,
      e.reading_time AS end_reading_time
    FROM start_readings s
    JOIN end_readings e ON e.house_id = s.house_id
    ORDER BY s.house_id
  `;

  db.query(
    sql,
    [
      houseId,
      BILLING_CUTOFF_DAY,
      BILLING_CUTOFF_START_TIME,
      BILLING_CUTOFF_END_TIME,
      start,
      end,
      unitRate,
    ],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      res.json({
        house_id: houseId,
        start,
        end,
        rate: unitRate,
        rows,
      });
    }
  );
});

// ใช้ในหน้า /billing เพื่อดึงประวัติบิลที่เคยสร้างไว้จากตาราง electric_bills
router.get("/bill-history", (req, res) => {
  const houseId = req.query.house_id ? Number(req.query.house_id) : null;

  if (req.query.house_id && (!Number.isInteger(houseId) || houseId <= 0)) {
    return res.status(400).json({
      error: "house_id must be a positive integer",
    });
  }

  ensureBillHistoryTable((tableErr) => {
    if (tableErr) {
      console.log(tableErr);
      return res.status(500).json({
        error: "Cannot prepare bill history table",
      });
    }

    const params = [];
    let whereClause = "";

    if (houseId) {
      whereClause = "WHERE b.house_id = ?";
      params.push(houseId);
    }

    // ดึงบิลที่บันทึกไว้มาให้ดูย้อนหลัง พิมพ์ซ้ำ หรือยกเลิกบิล
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
        b.status,
        b.cancelled_at,
        b.cancel_reason,
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

// ใช้ในหน้า /billing ตอนผู้ใช้กดสร้างบิล เพื่อบันทึกบิลลงประวัติบิล
router.post("/bill-history", (req, res) => {
  const {
    bill_no: billNo,
    start_month: startMonth,
    end_month: endMonth,
    start_reading_time: startReadingTime,
    end_reading_time: endReadingTime,
    issue_date: issueDate,
    due_date: dueDate,
  } = req.body;

  const houseId = Number(req.body.house_id);
  const startReading = Number(req.body.start_reading);
  const endReading = Number(req.body.end_reading);
  const usageUnit = Number(req.body.usage_unit);
  const rawUnitRate = String(req.body.unit_rate ?? "").trim() || "0";
  const unitRate = Number(rawUnitRate);
  const totalAmount = Number(req.body.total_amount);
  const monthPattern = /^\d{4}-\d{2}$/;

  if (!billNo || String(billNo).length > 80) {
    return res.status(400).json({
      error: "bill_no is required",
    });
  }

  if (!Number.isInteger(houseId) || houseId <= 0) {
    return res.status(400).json({
      error: "house_id must be a positive integer",
    });
  }

  if (
    !monthPattern.test(startMonth || "") ||
    !monthPattern.test(endMonth || "")
  ) {
    return res.status(400).json({
      error: "start_month and end_month must use YYYY-MM format",
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
      error: "bill numeric values are required",
    });
  }

  ensureBillHistoryTable((tableErr) => {
    if (tableErr) {
      console.log(tableErr);
      return res.status(500).json({
        error: "Cannot prepare bill history table",
      });
    }

    // บันทึกข้อมูลบิลเป็น snapshot เพื่อให้ประวัติบิลไม่เปลี่ยนตามข้อมูลมิเตอร์ภายหลัง
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
      rawUnitRate,
      totalAmount,
      startReadingTime || null,
      endReadingTime || null,
      issueDate,
      dueDate,
    ];

    db.query(sql, params, (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      res.status(201).json({
        message: "Bill history saved",
        id: result.insertId,
        bill_no: billNo,
      });
    });
  });
});

// ใช้ในหน้า /billing ตอนยกเลิกบิลที่สร้างผิด โดยเปลี่ยนสถานะเป็น cancelled แต่ไม่ลบ readings
router.patch("/bill-history/:id/cancel", (req, res) => {
  const billId = Number(req.params.id);
  const cancelReason = String(req.body.reason || "").trim();

  if (!Number.isInteger(billId) || billId <= 0) {
    return res.status(400).json({
      error: "bill id must be a positive integer",
    });
  }

  if (cancelReason.length > 255) {
    return res.status(400).json({
      error: "cancel reason must be 255 characters or fewer",
    });
  }

  ensureBillHistoryTable((tableErr) => {
    if (tableErr) {
      console.log(tableErr);
      return res.status(500).json({
        error: "Cannot prepare bill history table",
      });
    }

    // ยกเลิกเฉพาะรายการบิล โดยไม่ลบข้อมูลต้นทางใน meter_readings
    const sql = `
      UPDATE electric_bills
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancel_reason = ?
      WHERE id = ? AND status <> 'cancelled'
    `;

    db.query(sql, [cancelReason || null, billId], (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: "active bill not found",
        });
      }

      res.json({
        message: "Bill cancelled",
        id: billId,
        status: "cancelled",
      });
    });
  });
});

// ใช้ในหน้า /monthly เพื่อดึงค่าไฟรายเดือนของทุกบ้าน แล้ว frontend จะกรองเฉพาะบ้านที่เลือก
// หน้านี้เป็น dashboard เท่านั้น จึงใช้ logic รอบตัดบิลเดียวกับ /billing แต่ไม่บันทึกบิล
router.get("/monthly-bills", (req, res) => {
  const unitRate = Number(req.query.rate);

  if (!Number.isFinite(unitRate) || unitRate < 0) {
    return res.status(400).json({
      error: "rate must be a positive number",
    });
  }

  const sql = `
    WITH cutoff_reading_each_month AS (
      -- เลือกค่าอ่านตัวแทนหนึ่งค่าต่อบ้านต่อเดือน เฉพาะวันที่ 15 เวลา 12:00-12:59
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
        AND m.reading_value IS NOT NULL
        AND DAY(m.reading_time) = ?
        AND TIME(m.reading_time) >= ?
        AND TIME(m.reading_time) < ?
    ),
    month_readings AS (
      SELECT
        house_id,
        house_name,
        month_start,
        reading_value AS current_reading,
        -- LAG ดึงค่าเดือนก่อนหน้าของบ้านเดียวกัน เพื่อคำนวณเดือนนี้ - เดือนก่อนหน้า
        LAG(reading_value) OVER (
          PARTITION BY house_id
          ORDER BY month_start
        ) AS previous_reading
      FROM cutoff_reading_each_month
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

  db.query(
    sql,
    [
      BILLING_CUTOFF_DAY,
      BILLING_CUTOFF_START_TIME,
      BILLING_CUTOFF_END_TIME,
      unitRate,
    ],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      res.json({
        rate: unitRate,
        rows,
      });
    }
  );
});

// ใช้ในหน้า /daily เพื่อดึง reading ล่าสุดของแต่ละบ้านไปแสดงในการ์ดด้านบน
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

// route เก่า/สำรองสำหรับ /admin เพื่อดึง readings ทั้งหมดแบบย่อ
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

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
});

module.exports = router;
