# TODO

อัปเดตล่าสุด: 2026-05-26

## Done

- ESP32-CAM hourly burst sampling tested on real hardware.
- Burst upload works normally.
- Backend predicts every burst frame, selects the best frame, and saves only the selected reading.
- `/daily` updates normally after the hourly capture.
- `/admin` shows burst metadata and selected-frame information correctly.
- `/billing` can create bills and save bill history.
- Bill history can mark a bill as cancelled without deleting source meter readings.
- Bill history has search, house filter, billing-month filter, and status filter.
- Billing-month filter now matches the bill end month only. For example, filtering `2026-04` shows `2026-03 - 2026-04`, not `2026-04 - 2026-05`.
- Monthly billing cutoff now uses readings on day 15 from 12:00:00 to before 13:00:00.
- `/monthly` and `/billing` calculate usage from cutoff reading difference, not the first reading of each month.
- ESP32-CAM burst policy is now 1 scheduled burst per hour, 10 frames per burst, 5 minutes between frames.
- Burst scheduling now counts from the burst start time, so a burst that starts at 22:38 schedules the next burst for 23:38.
- Burst uploads now send `burst_duration_ms`; the backend stores `reading_time` as the approximate burst start time instead of the post-upload insert time.

## Remaining

### 1. Sampling Interval Decision

Current behavior:

- ESP32-CAM burst capture is set to run every 1 hour.
- Each burst captures 10 frames, 5 minutes apart.
- The backend selects one best frame and stores one `meter_readings` row per burst.

Needed:

- Monitor whether the 45-minute capture window leaves enough margin for upload and model prediction.
- Recommendation for demo and short-term testing: keep 1-hour sampling with 10 frames at 5-minute intervals.
- Recommendation for lower storage/network use: reduce burst frame count or switch to 3-hour sampling later.

## Later

### Model Training

Not urgent for the current system, but useful if there is time:

- Add more real ESP32-CAM images to the dataset, especially confusing digits such as `8`/`9` and `0`/`8`.
- Add wrongly predicted burst frames with correct labels.
- Train a new model, for example `train-9`.
- Compare the new model against `train-8` using ESP32-CAM and iPhone test images.
