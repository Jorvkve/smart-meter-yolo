# AGENTS.md

## Project Overview

This is a Smart Meter backend and static dashboard project. It combines:

- Express.js API server
- MySQL/MariaDB database
- Static HTML/CSS/JS frontend under `public/`
- Upload handling for meter images
- YOLO/OCR-related Python scripts and model artifacts for meter/digit detection
- Monthly electricity usage and billing calculations

The current app routes are:

- `/` landing page
- `/daily` daily/latest meter overview
- `/monthly` monthly overview charts for a selected house
- `/billing` bill calculation workflow for a selected house and date range
- `/admin` house and meter-reading administration

## Run Commands

Install Node dependencies:

```powershell
npm install
```

Start the server:

```powershell
node server.js
```

The server listens on:

```text
http://localhost:3000
```

MySQL/MariaDB must be running on:

```text
host: localhost
port: 3306
database: smart_meter_db
user: root
password: ""
```

Database connection settings are in `db.js`.

## Important Files

Backend:

- `server.js` - Express app, static files, API route mounting, page routes
- `db.js` - MySQL connection
- `routes/houses.js` - house CRUD/status API
- `routes/readings.js` - meter readings, monthly usage, billing calculations
- `routes/upload.js` - meter image upload endpoint

Frontend:

- `public/html/index.html` - landing page
- `public/html/daily.html` - daily dashboard
- `public/html/monthly.html` - monthly overview charts
- `public/html/billing.html` - bill calculation page
- `public/html/admin.html` - admin page
- `public/css/style.css` - shared dashboard styling
- `public/css/index.css` - landing page styling
- `public/js/daily.js`
- `public/js/monthly.js`
- `public/js/billing.js`
- `public/js/admin.js`

Database:

- `smart_meter_db.sql` - baseline schema/data dump

Python/model files:

- `tools/train.py`, `tools/crop_train.py`, `tools/check_accuracy.py`, `tools/test_meter_digits.py`, `tools/test_new_images.py`, `tools/yolov8_image.py`
- `tools/check_esp32_train8.py` - demo script for testing `train-8` against ESP32-CAM images and saving bounding-box output
- `tools/README.md` - notes for Python training/testing scripts
- `yolov8n.pt`, `yolo26n.pt`
- `meter_dataset/`, `runs/`, `test_images/`, `test_images_unseen/`

## API Notes

Mounted routes:

```text
/api/houses
/api/readings
/api/upload
```

Upload endpoint:

```text
POST /api/upload
multipart/form-data:
  image: File
  house_id: Text
  reading_value: Text/Number (optional manual override)
```

Important upload detail: Postman field key must be exactly `house_id`. Hidden Thai/Unicode marks before the key will make the backend receive a different field name.

The upload route saves the image, tries to run `tools/predict_meter_reading.py` with `runs/detect/train-8/weights/best.pt`, then inserts a row into `meter_readings`. If `reading_value` is sent, it is used as a manual override and YOLO is skipped. If YOLO cannot read a value, the row is still saved with `reading_value = NULL` so it can be reviewed in `/admin`.

Reading/billing endpoints in `routes/readings.js`:

- `GET /api/readings`
- `GET /api/readings/latest`
- `GET /api/readings/monthly-by-house`
- `GET /api/readings/reading-months?house_id=1`
- `GET /api/readings/bill-range?house_id=1&start=2026-03&end=2026-05&rate=4.2`
- `GET /api/readings/monthly-bills?rate=4.2`

## Billing Logic

Billing is based on cumulative meter values. To calculate usage for a month, use the current month reading minus the previous month reading.

Example:

```text
May bill usage = May meter reading - April meter reading
May bill amount = usage * unit rate
```

If readings are collected on the 10th of every month, this still works:

```text
May usage = reading on May 10 - reading on April 10
```

Implementation details:

- `monthly-bills` uses the first reading found in each month per house.
- It uses SQL `ROW_NUMBER()` to select the first reading of each month.
- It uses SQL `LAG()` to get the previous month reading.
- A house needs at least two months of readings to produce one monthly bill point.
- `/billing` is for manual bill-range calculation and client-side bill generation.
- `/monthly` is only for viewing charts/overview for a selected house.

## Frontend UX Separation

Keep these page responsibilities separate:

- `/monthly`: dashboard/overview only. It should let users select a house and view monthly graphs.
- `/billing`: calculation workflow. Put month range selection, unit rate, formula display, bill preview, and print/PDF export features here.
- `/admin`: data management only.

Avoid moving bill-generation UI back into `/monthly` unless explicitly requested.

## Styling Guidance

The app uses static HTML/CSS and Bootstrap. No frontend build step is used.

Shared dashboard styling lives in:

```text
public/css/style.css
```

Landing page styling lives in:

```text
public/css/index.css
```

Current chart palette:

```text
Navy: #093C5D
Blue: #3B7597
Teal: #6FD1D7
Mint: #5DF8D8
```

Use the same palette for related charts unless the user asks for a different visual grouping.

## Encoding Warning

Some Thai text in older files has previously appeared mojibake/garbled. When editing Thai UI text, preserve UTF-8 and verify the rendered page or file contents. If a file already contains garbled Thai, prefer replacing the affected page or section with clean UTF-8 Thai text rather than copying the corrupted text forward.

## Database/Test Data Notes

The app expects meter readings like:

```text
meter_readings.house_id
meter_readings.reading_value
meter_readings.image_filename
meter_readings.reading_time
```

For visible monthly/billing charts, each selected house must have readings in at least two different months.

Example test data pattern:

```sql
INSERT INTO meter_readings (house_id, reading_value, image_filename, reading_time)
VALUES
(1, 12000, NULL, '2026-03-01 08:00:00'),
(1, 14000, NULL, '2026-04-01 08:00:00'),
(1, 15648, NULL, '2026-05-01 08:00:00');
```

## Verification Checklist

After backend edits:

```powershell
node --check server.js
node --check routes\readings.js
node --check routes\upload.js
```

After frontend JS edits:

```powershell
node --check public\js\monthly.js
node --check public\js\billing.js
node --check public\js\daily.js
node --check public\js\admin.js
```

Smoke-test pages:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/ | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest -UseBasicParsing http://localhost:3000/monthly | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest -UseBasicParsing http://localhost:3000/billing | Select-Object -ExpandProperty StatusCode
```

Smoke-test billing API:

```powershell
Invoke-WebRequest -UseBasicParsing "http://localhost:3000/api/readings/bill-range?house_id=1&start=2026-03&end=2026-05&rate=4.2" | Select-Object -ExpandProperty Content
```

If API calls fail with MySQL connection errors, start MySQL/XAMPP first.

## Editing Rules For Future Agents

- Do not delete or reset dataset/model files unless explicitly asked.
- Do not revert unrelated dirty worktree changes.
- Keep `/monthly` and `/billing` responsibilities separate.
- Prefer small scoped edits over broad rewrites, except when fixing corrupted Thai encoding in a page.
- For manual code edits, use patches and keep formatting consistent with the surrounding files.
- When changing billing logic, update both API behavior and this document.
