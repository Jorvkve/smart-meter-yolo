const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

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

// ===== Upload Image Only =====
router.post("/", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No image uploaded",
    });
  }

  const house_id = String(req.body.house_id || "").trim();

  if (!house_id) {
    return res.status(400).json({
      error: "house_id is required",
      received_fields: Object.keys(req.body),
    });
  }

  res.json({
    message: "Upload success",
    filename: req.file.filename,
    house_id,
  });
});

module.exports = router;
