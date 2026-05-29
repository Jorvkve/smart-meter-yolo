const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const db = require("../db");

const execFileAsync = promisify(execFile);
const EXPECTED_DIGIT_COUNT = 5;
const CLOSE_TRANSITION_UNIT_WINDOW = 20;
const KEEP_UNSELECTED_BURST_FRAMES = true; // เก็บภาพ burst

/*
==============================
การตั้งค่าการเก็บไฟล์อัปโหลด
==============================
*/

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName =
      "meter_" +
      Date.now() +
      "_" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

/*
==============================
ตัวช่วยเกี่ยวกับฐานข้อมูล
==============================
*/
//ใช้เก็บข้อมูลเกี่ยวกับ manual/single/burst และความมั่นใจของโมเดล
const readingMetadataColumns = [
  ["capture_mode", "VARCHAR(20) NULL DEFAULT 'single'"],
  ["selected_frame", "INT NULL"],
  ["selection_reason", "VARCHAR(80) NULL"],
  ["avg_conf", "FLOAT NULL"],
  ["frames_summary", "JSON NULL"],
];

// ตรวจและเพิ่มคอลัมน์ metadata ของ readings ที่ใช้เก็บข้อมูล burst/เฟรม/ความมั่นใจ
function ensureReadingMetadataColumns() {
  return new Promise((resolve) => {
    db.query("SHOW COLUMNS FROM meter_readings", (err, columns) => {
      if (err) {
        console.warn("Could not inspect meter_readings columns:", err.message);
        resolve();
        return;
      }

      const existingColumns = new Set(columns.map((column) => column.Field));
      const missingColumns = readingMetadataColumns.filter(
        ([column]) => !existingColumns.has(column),
      );

      if (!missingColumns.length) {
        resolve();
        return;
      }

      let pending = missingColumns.length;

      missingColumns.forEach(([column, definition]) => {
        db.query(
          `ALTER TABLE meter_readings ADD COLUMN ${column} ${definition}`,
          (alterErr) => {
            if (alterErr) {
              console.warn(
                `Could not add ${column} to meter_readings:`,
                alterErr.message,
              );
            }

            pending -= 1;
            if (pending === 0) resolve();
          },
        );
      });
    });
  });
}

/*
==============================
ตัวช่วยเรียกโมเดลทำนายเลขมิเตอร์
==============================
*/

// เลือก path ของ Python ที่จะใช้รันสคริปต์ YOLO
function getPythonPath() {
  const localPython = path.join(
    process.cwd(),
    ".venv",
    "Scripts",
    "python.exe",
  );
  return fs.existsSync(localPython) ? localPython : "python";
}

// ทำนายเลขมิเตอร์จากรูปเดียว โดยเรียกฟังก์ชันแบบ batch แล้วหยิบผลแรก
async function predictReadingValue(imagePath) {
  const predictions = await predictReadingValues([imagePath]);
  return predictions[0] || null;
}

// เรียก tools/predict_meter_reading.py เพื่อทำนายเลขมิเตอร์จากรูปหนึ่งรูปหรือหลายรูป
async function predictReadingValues(imagePaths) {
  const scriptPath = path.join(
    process.cwd(),
    "tools",
    "predict_meter_reading.py",
  );
  const { stdout } = await execFileAsync(
    getPythonPath(),
    [scriptPath, ...imagePaths],
    {
      cwd: process.cwd(),
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const jsonLine = stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  const payload = jsonLine ? JSON.parse(jsonLine) : null;

  if (!payload) return [];
  if (Array.isArray(payload.frames)) return payload.frames;
  return [payload];
}

// แปลงค่าที่โมเดลทำนายมาให้เป็นตัวเลข หรือ null ถ้าใช้ไม่ได้ admin ตรวจสอบย้อนหลัง
function normalizePredictedReading(value) {
  if (value === null || value === undefined || value === "") return null;

  const readingValue = Number(value);
  return Number.isFinite(readingValue) ? readingValue : null;
}

// บันทึกแถว reading หลังจากทำนายเลขหรือรับเลขที่กรอกเองเสร็จแล้ว
function insertReading({
  houseId,
  readingValue,
  filename,
  captureMode,
  selectedFrame,
  selectionReason,
  avgConf,
  framesSummary,
}) {
  return new Promise((resolve, reject) => {
    db.query(
      `INSERT INTO meter_readings
       (house_id, reading_value, image_filename, capture_mode, selected_frame, selection_reason, avg_conf, frames_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        houseId,
        readingValue,
        filename,
        captureMode,
        selectedFrame,
        selectionReason,
        avgConf,
        framesSummary ? JSON.stringify(framesSummary) : null,
      ],
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
  });
}

// ดึงค่าอ่านล่าสุด เพื่อช่วยเลือกเฟรม burst ที่เลขไม่ย้อนกลับจากประวัติเดิม
function getLatestReading(houseId) {
  return new Promise((resolve, reject) => {
    db.query(
      `SELECT reading_value
       FROM meter_readings
       WHERE house_id = ? AND reading_value IS NOT NULL
       ORDER BY reading_time DESC, id DESC
       LIMIT 1`,
      [houseId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows[0]?.reading_value ?? null);
      },
    );
  });
}

/*
==============================
การเลือกเฟรมที่ดีที่สุดจาก burst
==============================
*/

// หาค่ากลางของชุดตัวเลข ใช้ช่วยเลือกเฟรม burst ที่ไม่หลุดจากกลุ่มมากเกินไป
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

// เลือกเฟรมที่น่าเชื่อถือที่สุดจากชุด burst ก่อนบันทึกลงฐานข้อมูล
// ใช้ prediction, confidence, จำนวน digit, median และ reading ล่าสุดมาช่วย
function chooseBestFrame(frames, latestReading) {
  const validFrames = frames.filter((frame) =>
    Number.isInteger(frame.reading_value),
  );

  if (!validFrames.length) {
    return {
      selected: null,
      reason: "no_valid_prediction",
    };
  }

  const monotonicFrames =
    latestReading === null
      ? validFrames
      : validFrames.filter((frame) => frame.reading_value >= latestReading);
  const candidates = monotonicFrames.length ? monotonicFrames : validFrames;
  const values = candidates.map((frame) => frame.reading_value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  /*เงื่อนไขแรก: reading สูงกว่า ชนะ
  ถ้า reading เท่ากัน: จำนวนกล่อง digit มากกว่า ชนะ
  ถ้ายังเท่ากัน: confidence สูงกว่า ชนะ
  */
  if (maxValue - minValue <= CLOSE_TRANSITION_UNIT_WINDOW) {
    const selected = [...candidates].sort((a, b) => {
      if (b.reading_value !== a.reading_value)
        return b.reading_value - a.reading_value;
      if ((b.prediction?.boxes || 0) !== (a.prediction?.boxes || 0)) {
        return (b.prediction?.boxes || 0) - (a.prediction?.boxes || 0);
      }
      return (b.prediction?.avg_conf || 0) - (a.prediction?.avg_conf || 0);
    })[0];

    return {
      selected,
      reason: "close_transition_choose_highest",
    };
  }

  // กรณีค่าห่างกันมาก
  const middleValue = median(values);
  const groups = new Map();

  for (const frame of candidates) {
    const key = String(frame.reading_value);
    const current = groups.get(key) || {
      reading_value: frame.reading_value,
      count: 0,
      avg_conf_sum: 0,
      full_digit_count: 0,
      latest_index: -1,
      best_frame: frame,
    };

    // อัปเดตสถิติของกลุ่ม
    current.count += 1;
    current.avg_conf_sum += frame.prediction?.avg_conf || 0;
    current.full_digit_count +=
      frame.prediction?.boxes === EXPECTED_DIGIT_COUNT ? 1 : 0;
    current.latest_index = Math.max(current.latest_index, frame.index);

    // ถ้า frame นี้ confidence สูงกว่า best เดิม ให้เปลี่ยน best frame ของกลุ่ม
    if (
      (frame.prediction?.avg_conf || 0) >
      (current.best_frame.prediction?.avg_conf || 0)
    ) {
      current.best_frame = frame;
    }

    groups.set(key, current);
  }

  // เรียงกลุ่มเพื่อเลือกกลุ่มที่น่าเชื่อถือที่สุด
  const selectedGroup = [...groups.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.full_digit_count !== a.full_digit_count) {
      return b.full_digit_count - a.full_digit_count;
    }

    const aNearMedian = Math.abs(a.reading_value - middleValue);
    const bNearMedian = Math.abs(b.reading_value - middleValue);
    if (aNearMedian !== bNearMedian) return aNearMedian - bNearMedian;

    const aAvgConf = a.avg_conf_sum / a.count;
    const bAvgConf = b.avg_conf_sum / b.count;
    if (bAvgConf !== aAvgConf) return bAvgConf - aAvgConf;

    return b.latest_index - a.latest_index;
  })[0];

  return {
    selected: selectedGroup.best_frame,
    reason: "majority_confidence_median",
  };
}

// ลบไฟล์รูป burst ที่ไม่ได้ถูกเลือก เพื่อลดไฟล์รกใน uploads
function deleteUnselectedBurstFiles(files, selectedFile) {
  const selectedName = selectedFile?.filename;

  for (const file of files) {
    if (file.filename === selectedName) continue;

    fs.unlink(file.path, (err) => {
      if (err) {
        console.warn(
          `Could not delete unselected burst frame ${file.filename}:`,
          err.message,
        );
      }
    });
  }
}

// สรุปผลแต่ละเฟรมเพื่อส่งกลับไปให้หน้า admin ตรวจสอบย้อนหลังได้
function summarizeFrames(frames, selectedIndex) {
  return frames.map((frame) => ({
    index: frame.index,
    filename: frame.filename,
    reading_value: frame.reading_value,
    boxes: frame.prediction?.boxes ?? null,
    avg_conf: frame.prediction?.avg_conf ?? null,
    selected: frame.index === selectedIndex,
    prediction_error: frame.prediction_error,
  }));
}

const metadataColumnsReady = ensureReadingMetadataColumns();

/*
==============================
API อัปโหลดรูปมิเตอร์
==============================
*/

// ใช้โดย ESP32-CAM และเครื่องมือทดสอบ เช่น Postman เพื่ออัปโหลดรูปมิเตอร์เข้า backend
router.post("/", upload.any(), async (req, res) => {
  // รองรับทั้งการส่งรูปเดียวชื่อ field ว่า image และหลายรูปชื่อ field ว่า images
  const imageFiles = (req.files || []).filter(
    (file) => file.fieldname === "image" || file.fieldname === "images", // เอาเฉพาะไฟล์ที่ field name เป็น image หรือ images
  );

  if (!imageFiles.length) {
    return res.status(400).json({
      error: "No image uploaded",
    });
  }

  const house_id = String(req.body.house_id || "").trim(); // อ่าน house_id
  const houseIdNumber = Number(house_id);

  if (!Number.isInteger(houseIdNumber) || houseIdNumber <= 0) {
    return res.status(400).json({
      error: "house_id is required",
      received_fields: Object.keys(req.body),
    });
  }

  // แปลงเป็นตัวเลขแล้วใช้เป็น manual reading กรณีผู้ใช้/ESP32/Postman ส่งเลขมิเตอร์เอง
  const manualReading =
    req.body.reading_value !== undefined && req.body.reading_value !== ""
      ? Number(req.body.reading_value)
      : null;

  if (
    manualReading !== null &&
    (!Number.isFinite(manualReading) || manualReading < 0)
  ) {
    return res.status(400).json({
      error: "reading_value must be a positive number",
    });
  }

  // เตรียมตัวแปรสถานะสำหรับทั้ง manual, single, burst
  let prediction = null;
  let predictionError = null;
  let readingValue = manualReading;
  let selectedFile = imageFiles[0];
  let selectedFrame = null;
  let frames = [];
  let selectionReason = manualReading !== null ? "manual_reading" : null;
  let latestReading = null;
  const keepFrames =
    req.body.keep_frames === undefined
      ? KEEP_UNSELECTED_BURST_FRAMES
      : String(req.body.keep_frames).toLowerCase() === "true";

  // ถ้าไม่มี manual reading ค่อยเรียกโมเดล
  if (readingValue === null) {
    try {
      latestReading = await getLatestReading(houseIdNumber);
      const batchPredictions = await predictReadingValues(
        imageFiles.map((file) => file.path),
      );

      // จับคู่ไฟล์แต่ละรูปกับ prediction ตาม index
      frames = imageFiles.map((file, index) => {
        const framePrediction = batchPredictions[index] || null;

        return {
          index,
          filename: file.filename,
          reading_value: normalizePredictedReading(
            framePrediction?.reading_value,
          ),
          prediction: framePrediction,
          prediction_error: framePrediction ? null : "No prediction returned",
        };
      });

      // เลือก frame ที่ดีที่สุด เก็บเหตุผลที่เลือก
      const selection = chooseBestFrame(frames, latestReading);
      selectionReason = selection.reason;

      // ถ้าเลือก frame ได้ ให้ตั้งไฟล์ที่เลือก เอา prediction และ reading value ของ frame ที่เลือกมาใช้
      if (selection.selected) {
        selectedFile = imageFiles[selection.selected.index];
        selectedFrame = selection.selected.index;
        prediction = selection.selected.prediction;
        readingValue = selection.selected.reading_value;

        // ลบไฟล์ที่ไม่ถูกเลือก ถ้าปิดการเก็บ unselected burst frames
        if (imageFiles.length > 1 && !keepFrames) {
          deleteUnselectedBurstFiles(imageFiles, selectedFile);
        }
        // ถ้าเลือก frame ไม่ได้ ให้รวม error ของแต่ละ frame
      } else {
        predictionError =
          frames
            .map((frame) => frame.prediction_error)
            .filter(Boolean)
            .join(" | ") || "No valid prediction";
      }
    } catch (err) {
      predictionError = err.message;
    }
  }

  // ถ้าเป็น manual reading ให้หา index ของไฟล์ที่ถูกเลือก
  if (manualReading !== null) {
    selectedFrame = imageFiles.findIndex(
      (file) => file.filename === selectedFile.filename,
    );
  }

  // กำหนดโหมดการบันทึก
  const captureMode =
    manualReading !== null
      ? "manual" // ถ้ามี manual reading = manual
      : imageFiles.length > 1
        ? "burst" // ถ้าไม่มี manual และมีหลายรูป = burst
        : "single"; // ถ้าไม่มี manual และมีรูปเดียว = single
  const avgConf = prediction?.avg_conf ?? null; // เอาค่า confidence เฉลี่ยจาก prediction
  // ถ้าเป็น burst ให้สรุปทุก frame
  const framesSummary =
    imageFiles.length > 1 ? summarizeFrames(frames, selectedFrame) : null;

  try {
    await metadataColumnsReady;

    // บันทึก reading ลง meter_readings
    const result = await insertReading({
      houseId: houseIdNumber,
      readingValue,
      filename: selectedFile.filename,
      captureMode,
      selectedFrame,
      selectionReason,
      avgConf,
      framesSummary,
    });

    // ส่งกลับไป POSTMAN หลังจากอัพรูปสำเร็จ
    res.json({
      message: "Upload success",
      id: result.insertId,
      filename: selectedFile.filename,
      filenames: imageFiles.map((file) => file.filename),
      house_id: String(houseIdNumber),
      reading_value: readingValue,
      prediction,
      prediction_error: predictionError,
      burst: imageFiles.length > 1,
      selected_frame: selectedFrame,
      selection_reason: selectionReason,
      avg_conf: avgConf,
      previous_reading: latestReading,
      kept_all_frames: keepFrames,
      frames,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Database error",
    });
  }
});

module.exports = router;
