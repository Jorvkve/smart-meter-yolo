const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const db = require("../db");

const execFileAsync = promisify(execFile);

// ===== Storage =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = "meter_" + Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

function getPythonPath() {
  const localPython = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
  return fs.existsSync(localPython) ? localPython : "python";
}

async function predictReadingValue(imagePath) {
  const scriptPath = path.join(process.cwd(), "tools", "predict_meter_reading.py");
  const { stdout } = await execFileAsync(
    getPythonPath(),
    [scriptPath, imagePath],
    {
      cwd: process.cwd(),
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    }
  );
  const jsonLine = stdout.trim().split(/\r?\n/).reverse().find(line => line.trim().startsWith("{"));
  return jsonLine ? JSON.parse(jsonLine) : null;
}

function insertReading({ houseId, readingValue, filename }) {
  return new Promise((resolve, reject) => {
    db.query(
      "INSERT INTO meter_readings (house_id, reading_value, image_filename) VALUES (?, ?, ?)",
      [houseId, readingValue, filename],
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });
}

// ===== Upload Image Only =====
router.post("/", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No image uploaded",
    });
  }

  const house_id = String(req.body.house_id || "").trim();
  const houseIdNumber = Number(house_id);

  if (!Number.isInteger(houseIdNumber) || houseIdNumber <= 0) {
    return res.status(400).json({
      error: "house_id is required",
      received_fields: Object.keys(req.body),
    });
  }

  const manualReading = req.body.reading_value !== undefined && req.body.reading_value !== ""
    ? Number(req.body.reading_value)
    : null;

  if (manualReading !== null && (!Number.isFinite(manualReading) || manualReading < 0)) {
    return res.status(400).json({
      error: "reading_value must be a positive number",
    });
  }

  let prediction = null;
  let predictionError = null;
  let readingValue = manualReading;

  if (readingValue === null) {
    try {
      prediction = await predictReadingValue(req.file.path);
      readingValue = Number.isFinite(Number(prediction?.reading_value))
        ? Number(prediction.reading_value)
        : null;
    } catch (err) {
      predictionError = err.message;
    }
  }

  try {
    const result = await insertReading({
      houseId: houseIdNumber,
      readingValue,
      filename: req.file.filename,
    });

    res.json({
      message: "Upload success",
      id: result.insertId,
      filename: req.file.filename,
      house_id: String(houseIdNumber),
      reading_value: readingValue,
      prediction,
      prediction_error: predictionError,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Database error",
    });
  }
});

module.exports = router;
