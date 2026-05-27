let dailyCharts = []; // เก็บ object กราฟ Chart.js ที่สร้างไว้
let activeHousePage = 0; // เก็บหน้าปัจจุบันของการ์ดบ้าน
let activeDailyCalendarHouseId = null; // บอกว่าปฏิทินของบ้านไหนกำลังเปิด
let dailyHouseState = {
  // เป็นกองกลางเก็บข้อมูลของหน้า
  houses: [],
  latestReadings: [],
  readingGroups: {},
  chartDateKeys: {},
  chartCalendarMonths: {},
};

const HOUSE_PAGE_SIZE = 3;

/*
==============================
ตั้งค่าเริ่มต้นของหน้า
==============================
*/

window.addEventListener("load", initDashboard);

// โหลดข้อมูลหลักของหน้า daily แล้วสั่ง render ทุกส่วน
async function initDashboard() {
  const [houses, latestReadings, allReadings] = await Promise.all([
    fetchJson("/api/houses"),
    fetchJson("/api/readings/latest"),
    fetchJson("/api/readings"),
  ]);

  const activeHouses = houses.filter((house) => house.is_active == 1); // กรองเฉพาะบ้านที่เปิดใช้งาน
  const readingGroups = groupReadingsByHouse(allReadings);
  const readingWarnings = getReadingWarnings(allReadings); // รายการที่ควรเตือน
  dailyHouseState = {
    houses: activeHouses,
    latestReadings,
    readingGroups,
    chartDateKeys: buildInitialChartDateKeys(activeHouses, readingGroups), // ตั้งค่าวันเริ่มต้นของกราฟเป็นวันที่ล่าสุดที่มีข้อมูลของแต่ละบ้าน
    chartCalendarMonths: buildInitialCalendarMonths(
      // ตั้งค่าเดือนของปฏิทินตามวันที่ล่าสุด
      activeHouses,
      readingGroups,
    ),
  };

  setupHousePager();
  setupDailyChartDateControls();
  renderHouseCards();

  renderSummary(activeHouses, latestReadings, readingWarnings);
  renderDailyHouseCharts(activeHouses, readingGroups);
  renderRecentReadings(allReadings.slice(0, 8));
}

/*
==============================
ตัวช่วยจัดข้อมูล
==============================
*/

async function fetchJson(url) {
  // ตัวช่วยเรียก API ให้ทุกจุดจัดการ error แบบเดียวกัน
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

// แปลงรายการ readings แบบแถวเดียวให้กลายเป็นกลุ่มตาม houseId เพื่อเอาไปแสดงผลง่ายขึ้น
function groupReadingsByHouse(readings) {
  return readings.reduce((groups, reading) => {
    const key = String(reading.house_id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(reading);
    return groups;
  }, {});
}

// แปลงค่าวันเวลาจาก database/string ให้เป็น Date object
function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
    return new Date(text.replace(" ", "T"));
  }

  return new Date(text);
}

// แปลง Date เป็น key รูปแบบ YYYY-MM-DD เพื่อใช้จัดกลุ่มข้อมูลรายวัน
function getDateKey(date) {
  if (!date || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// หา date key ของ reading ล่าสุดในชุดข้อมูลของบ้านนั้น
function getLatestReadingDateKey(readings) {
  const latest = readings
    .map((reading) => parseDateValue(reading.reading_time))
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0];

  return getDateKey(latest);
}

// สร้างรายการวันที่ทั้งหมดที่บ้านนี้มีข้อมูลอ่านมิเตอร์
function getHouseDateKeys(readings) {
  return [
    ...new Set(
      readings
        .map((reading) => parseDateValue(reading.reading_time))
        .filter((date) => date && !Number.isNaN(date.getTime()))
        .map(getDateKey)
        .filter(Boolean),
    ),
  ].sort();
}

// เตรียมวันที่เริ่มต้นของกราฟแต่ละบ้าน โดยเลือกวันล่าสุดที่มีข้อมูล
function buildInitialChartDateKeys(houses, readingGroups) {
  return houses.reduce((keys, house) => {
    const readings = readingGroups[String(house.id)] || [];
    keys[String(house.id)] = getLatestReadingDateKey(readings);
    return keys;
  }, {});
}

// อ่านวันที่ที่กำลังเลือกของกราฟ ถ้าวันเดิมไม่มีอยู่แล้วให้กลับไปวันล่าสุด
function getSelectedChartDateKey(houseId, readings) {
  const dateKeys = getHouseDateKeys(readings);
  const selected = dailyHouseState.chartDateKeys[String(houseId)];

  if (dateKeys.includes(selected)) return selected;
  return dateKeys[dateKeys.length - 1] || "";
}

// ตัด YYYY-MM ออกจาก date key เพื่อใช้กับปฏิทินรายเดือน
function getMonthKeyFromDateKey(dateKey) {
  return dateKey ? dateKey.slice(0, 7) : "";
}

// เตรียมเดือนเริ่มต้นของปฏิทินแต่ละบ้าน
function buildInitialCalendarMonths(houses, readingGroups) {
  return houses.reduce((months, house) => {
    const readings = readingGroups[String(house.id)] || [];
    months[String(house.id)] = getMonthKeyFromDateKey(
      getLatestReadingDateKey(readings),
    );
    return months;
  }, {});
}

// อ่านเดือนที่ปฏิทินกำลังแสดง ถ้ายังไม่มีให้ใช้เดือนของวันที่ที่เลือก
function getSelectedCalendarMonthKey(houseId, selectedDateKey) {
  const savedMonth = dailyHouseState.chartCalendarMonths[String(houseId)];
  return savedMonth || getMonthKeyFromDateKey(selectedDateKey);
}

// เลื่อนเดือนของปฏิทินไปข้างหน้าหรือย้อนหลัง
function shiftMonthKey(monthKey, amount) {
  if (!monthKey) return "";

  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// แสดงชื่อเดือนและปีแบบไทยสำหรับหัวปฏิทิน
function formatThaiMonthYear(monthKey) {
  if (!monthKey) return "-";
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });
}

/*
==============================
การแสดงผล dashboard
==============================
*/

function renderSummary(houses, latestReadings, warnings) {
  // อัปเดตตัวเลขสรุปด้านบนของหน้า daily
  document.getElementById("activeHouseCount").innerText =
    houses.length.toLocaleString("th-TH");
  document.getElementById("latestReadCount").innerText = latestReadings
    .filter((row) => row.reading_value != null)
    .length.toLocaleString("th-TH");
  document.getElementById("warningCount").innerText =
    warnings.length.toLocaleString("th-TH");
}

// รวมรายการ readings ที่ควรเตือนบน dashboard
function getReadingWarnings(readings) {
  const groups = groupReadingsByHouse(readings);
  const warnings = [];

  Object.values(groups).forEach((group) => {
    group
      .sort(
        (a, b) =>
          new Date(a.reading_time) - new Date(b.reading_time) ||
          Number(a.id) - Number(b.id),
      )
      .forEach((reading, index, list) => {
        const status = getReadingStatus(reading, list[index - 1]);
        if (status.level !== "ok") warnings.push({ reading, status });
      });
  });

  return warnings;
}

/*
==============================
ตัวควบคุม dashboard
==============================
*/

function setupHousePager() {
  // ผูกปุ่มเปลี่ยนหน้าการ์ดบ้านล่าสุด
  document.getElementById("prevHousePageBtn")?.addEventListener("click", () => {
    activeHousePage -= 1;
    renderHouseCards();
  });

  document.getElementById("nextHousePageBtn")?.addEventListener("click", () => {
    activeHousePage += 1;
    renderHouseCards();
  });
}

// ผูก event สำหรับเปิดปฏิทิน เลื่อนเดือน และเลือกวันที่ของกราฟรายวัน
function setupDailyChartDateControls() {
  const container = document.getElementById("dailyHouseCharts");
  if (!container) return;

  container.addEventListener("click", (event) => {
    const calendarButton = event.target.closest(".daily-chart-calendar-toggle"); // เช็คว่าคลิกปุ่มเปิด/ปิดปฏิทินไหม
    if (calendarButton) {
      const houseId = String(calendarButton.dataset.houseId);
      activeDailyCalendarHouseId =
        activeDailyCalendarHouseId === houseId ? null : houseId;
      renderDailyHouseCharts(
        dailyHouseState.houses,
        dailyHouseState.readingGroups,
      );
      return;
    }

    const calendarMonthButton = event.target.closest(
      ".daily-calendar-month-btn", // เช็คว่ากดปุ่มเลื่อนเดือนในปฏิทินไหม
    );
    if (calendarMonthButton) {
      const houseId = String(calendarMonthButton.dataset.houseId);
      const selectedDateKey = dailyHouseState.chartDateKeys[houseId] || "";
      const currentMonth = getSelectedCalendarMonthKey(
        houseId,
        selectedDateKey,
      );
      const step = calendarMonthButton.dataset.direction === "next" ? 1 : -1;
      dailyHouseState.chartCalendarMonths[houseId] = shiftMonthKey(
        currentMonth,
        step,
      );
      activeDailyCalendarHouseId = houseId;
      renderDailyHouseCharts(
        dailyHouseState.houses,
        dailyHouseState.readingGroups,
      );
      return;
    }

    const calendarDay = event.target.closest(".daily-calendar-day.has-data"); // เช็คว่ากดวันที่ที่มีข้อมูลไหม
    if (calendarDay) {
      const houseId = String(calendarDay.dataset.houseId);
      dailyHouseState.chartDateKeys[houseId] = calendarDay.dataset.dateKey;
      dailyHouseState.chartCalendarMonths[houseId] = getMonthKeyFromDateKey(
        calendarDay.dataset.dateKey,
      );
      activeDailyCalendarHouseId = null;
      renderDailyHouseCharts(
        dailyHouseState.houses,
        dailyHouseState.readingGroups,
      );
      return;
    }

    const button = event.target.closest(".daily-chart-day-btn"); // เช็คว่ากดปุ่มเปลี่ยนวัน prev/next ของกราฟไหม
    if (!button) return;

    changeDailyChartDate(button.dataset.houseId, button.dataset.direction);
  });
}

// เปลี่ยนวันที่ของกราฟบ้านที่เลือกไปวันก่อนหน้าหรือวันถัดไป
function changeDailyChartDate(houseId, direction) {
  const readings = dailyHouseState.readingGroups[String(houseId)] || [];
  const dateKeys = getHouseDateKeys(readings);
  const currentDateKey = getSelectedChartDateKey(houseId, readings);
  const currentIndex = dateKeys.indexOf(currentDateKey);
  const step = direction === "next" ? 1 : -1;
  const nextIndex = currentIndex + step;

  if (nextIndex < 0 || nextIndex >= dateKeys.length) return;

  const nextDateKey = dateKeys[nextIndex];
  dailyHouseState.chartDateKeys[String(houseId)] = nextDateKey;
  dailyHouseState.chartCalendarMonths[String(houseId)] =
    getMonthKeyFromDateKey(nextDateKey);
  renderDailyHouseCharts(dailyHouseState.houses, dailyHouseState.readingGroups);
}

// แสดงการ์ดเลขมิเตอร์ล่าสุดของบ้านที่อยู่ในหน้าปัจจุบัน
function renderHouseCards() {
  const container = document.getElementById("houseCards");
  if (!container) return [];

  const { houses, latestReadings, readingGroups } = dailyHouseState;
  const totalPages = Math.max(1, Math.ceil(houses.length / HOUSE_PAGE_SIZE)); // คำนวณจำนวนหน้าการ์ดบ้าน
  activeHousePage = (activeHousePage + totalPages) % totalPages;
  updateHousePager(totalPages);

  const warnings = [];
  houses.forEach((house) => {
    const latest = latestReadings.find(
      // หา latest reading ของบ้านนี้
      (reading) => String(reading.id) === String(house.id),
    );
    const history = readingGroups[String(house.id)] || [];
    const previous = history.find(
      // หา reading ก่อนหน้า เพื่อเทียบกับ latest
      (row) =>
        row.id !== latest?.reading_id &&
        row.reading_time !== latest?.reading_time,
    );
    const status = getReadingStatus(latest, previous); // ตรวจว่าค่าอ่านล่าสุดปกติไหม

    if (status.level !== "ok") warnings.push({ house, status });
  });

  // เลือกเฉพาะบ้านของหน้าปัจจุบัน เช่น page 0 เอา 0-2, page 1 เอา 3-5
  const pageHouses = houses.slice(
    activeHousePage * HOUSE_PAGE_SIZE,
    (activeHousePage + 1) * HOUSE_PAGE_SIZE,
  );

  container.innerHTML = pageHouses
    .map((house) => {
      const latest = latestReadings.find(
        (reading) => String(reading.id) === String(house.id),
      );
      const history = readingGroups[String(house.id)] || [];
      const previous = history.find(
        (row) =>
          row.id !== latest?.reading_id &&
          row.reading_time !== latest?.reading_time,
      );
      const status = getReadingStatus(latest, previous);

      return `
      <article class="daily-meter-card ${status.level !== "ok" ? "needs-review" : ""}">
        <div class="daily-meter-main">
          <div>
            <span class="daily-house-label">${house.house_name}</span>
            <h2>${formatMeter(latest?.reading_value)}</h2>
            <p>${latest?.reading_time ? formatThaiDate(latest.reading_time) : "ยังไม่มีเวลาอ่าน"}</p>
          </div>
          <span class="daily-status-pill ${status.level}">${status.label}</span>
        </div>
        <div class="daily-meter-body">
          <div class="daily-meter-photo">
            ${renderReadingImage(latest)}
          </div>
          <div class="daily-meter-detail">
            <dl>
              <div>
                <dt>ครั้งก่อน</dt>
                <dd>${previous ? formatMeter(previous.reading_value) : "-"}</dd>
              </div>
              <div>
                <dt>ส่วนต่าง</dt>
                <dd>${formatDelta(latest, previous)}</dd>
              </div>
              <div>
                <dt>รูปยืนยัน</dt>
                <dd>${latest?.image_filename ? "มีรูป" : "ไม่มีรูป"}</dd>
              </div>
            </dl>
            <a class="btn btn-sm btn-primary" href="/admin?reading_id=${latest?.reading_id || latest?.id || ""}">ตรวจ/แก้เลข</a>
          </div>
        </div>
      </article>
    `;
    })
    .join("");

  return warnings;
}

// อัปเดตเลขหน้าและสถานะปุ่มก่อนหน้า/ถัดไปของการ์ดบ้าน
function updateHousePager(totalPages) {
  const counter = document.getElementById("housePageCounter");
  const prev = document.getElementById("prevHousePageBtn");
  const next = document.getElementById("nextHousePageBtn");
  const shouldShowControls = totalPages > 1;

  if (counter) counter.innerText = `${activeHousePage + 1} / ${totalPages}`;
  if (prev) prev.disabled = !shouldShowControls;
  if (next) next.disabled = !shouldShowControls;
}

/*
==============================
ตรวจคุณภาพเลขมิเตอร์
==============================
*/

function getReadingStatus(latest, previous) {
  // ตรวจแบบพื้นฐานเพื่อแจ้งเตือนเลขหาย เลขลดลง เลขกระโดด หรือไม่มีรูป
  if (!latest?.reading_value)
    return { level: "empty", label: "ยังไม่มีข้อมูล" };
  if (
    previous &&
    Number(latest.reading_value) < Number(previous.reading_value)
  ) {
    return { level: "danger", label: "เลขลดลง" };
  }
  if (
    previous &&
    Number(latest.reading_value) - Number(previous.reading_value) > 2000
  ) {
    return { level: "warn", label: "เพิ่มสูง" };
  }
  if (!latest.image_filename) return { level: "warn", label: "ไม่มีรูป" };
  return { level: "ok", label: "ปกติ" };
}

/*
==============================
กราฟรายวัน
==============================
*/

function renderReadingImage(reading) {
  // แสดงรูปมิเตอร์ ถ้าไม่มีรูปจะแสดงกล่องข้อความแทน
  if (!reading?.image_filename) {
    return `<div class="daily-empty-photo">ไม่มีรูป</div>`;
  }

  return `
    <img
      src="/uploads/${reading.image_filename}"
      alt="รูปมิเตอร์ของ ${reading.house_name}"
      loading="lazy"
    />
  `;
}

// สร้างปฏิทินเล็กสำหรับเลือกวันที่ย้อนหลังของกราฟรายวัน
function renderDailyChartCalendar(
  houseId,
  dateKeys,
  selectedDateKey,
  monthKey,
) {
  if (!monthKey) {
    return `
      <div class="daily-calendar-popover">
        <p class="empty-note mb-0">ไม่มีข้อมูลวันที่สำหรับบ้านนี้</p>
      </div>
    `;
  }

  const availableDates = new Set(dateKeys); // ใช้เช็คว่าวันไหนมีข้อมูล
  const [year, month] = monthKey.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const firstDay = firstDate.getDay(); // หาว่าวันที่ 1 ของเดือนเป็นวันอะไร
  const daysInMonth = new Date(year, month, 0).getDate(); //หาว่าเดือนนี้มีกี่วัน
  const minMonthKey = getMonthKeyFromDateKey(dateKeys[0]);
  const maxMonthKey = getMonthKeyFromDateKey(dateKeys[dateKeys.length - 1]);
  const prevMonthDisabled = minMonthKey
    ? shiftMonthKey(monthKey, -1) < minMonthKey
    : true;
  const nextMonthDisabled = maxMonthKey
    ? shiftMonthKey(monthKey, 1) > maxMonthKey
    : true;
  const cells = [];

  for (let i = 0; i < firstDay; i += 1)
    cells.push(`<span class="daily-calendar-day blank"></span>`);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const hasData = availableDates.has(dateKey); // เช็คว่าวันนี้มี reading หรือไม่
    const isSelected = dateKey === selectedDateKey;

    cells.push(`
      <button
        class="daily-calendar-day ${hasData ? "has-data" : "no-data"} ${isSelected ? "selected" : ""}"
        type="button"
        data-house-id="${houseId}"
        data-date-key="${dateKey}"
        ${hasData ? "" : "disabled"} วันที่ไม่มีข้อมูลจะกดไม่ได้
        title="${hasData ? "มีข้อมูลมิเตอร์" : "ไม่มีข้อมูล"}"
      >
        ${day}
      </button>
    `);
  }

  return `
    <div class="daily-calendar-popover">
      <div class="daily-calendar-header">
        <button
          class="daily-calendar-month-btn"
          type="button"
          data-house-id="${houseId}"
          data-direction="prev"
          ${prevMonthDisabled ? "disabled" : ""}
          aria-label="เดือนก่อนหน้า"
        >&lt;</button>
        <strong>${formatThaiMonthYear(monthKey)}</strong>
        <button
          class="daily-calendar-month-btn"
          type="button"
          data-house-id="${houseId}"
          data-direction="next"
          ${nextMonthDisabled ? "disabled" : ""}
          aria-label="เดือนถัดไป"
        >&gt;</button>
      </div>
      <div class="daily-calendar-weekdays">
        <span>อา</span>
        <span>จ</span>
        <span>อ</span>
        <span>พ</span>
        <span>พฤ</span>
        <span>ศ</span>
        <span>ส</span>
      </div>
      <div class="daily-calendar-grid">
        ${cells.join("")}
      </div>
      <div class="daily-calendar-legend">
        <span><i class="has-data"></i>มีข้อมูล</span>
        <span><i class="no-data"></i>ไม่มีข้อมูล</span>
      </div>
    </div>
  `;
}

// วาดกราฟเลขมิเตอร์ 24 ชั่วโมงให้แต่ละบ้านที่เปิดใช้งาน
function renderDailyHouseCharts(houses, readingGroups) {
  const container = document.getElementById("dailyHouseCharts");
  if (!container) return;

  // ทำลายกราฟ Chart.js เก่าก่อนสร้างใหม่ ไม่ทำลายจะทำให้กราฟซ้อน
  dailyCharts.forEach((chart) => chart.destroy());
  dailyCharts = [];

  if (!houses.length) {
    container.innerHTML = `<p class="empty-note">ยังไม่มีบ้านที่เปิดใช้งาน</p>`;
    return;
  }

  // สร้าง label 24 ชั่วโมง
  const hourLabels = Array.from(
    { length: 24 },
    (_, hour) => `${String(hour).padStart(2, "0")}:00`,
  );

  // สร้าง card กราฟให้บ้านแต่ละหลัง
  // แต่ละ card มีปุ่ม prev/next วัน, ปุ่มเลือกวันที่, canvas สำหรับ Chart.js
  container.innerHTML = houses
    .map((house) => {
      const readings = readingGroups[String(house.id)] || [];
      const dateKeys = getHouseDateKeys(readings);
      const dateKey = getSelectedChartDateKey(house.id, readings);
      const dateIndex = dateKeys.indexOf(dateKey);
      const displayDate = dateKey
        ? formatThaiDateOnly(`${dateKey} 00:00:00`)
        : "-";
      const prevDisabled = dateIndex <= 0;
      const nextDisabled = dateIndex < 0 || dateIndex >= dateKeys.length - 1;
      const houseId = String(house.id);
      const calendarMonthKey = getSelectedCalendarMonthKey(houseId, dateKey);
      const isCalendarOpen = activeDailyCalendarHouseId === houseId;

      return `
      <article class="daily-house-chart-card">
        <div class="daily-house-chart-header">
          <div>
            <span>${house.house_name}</span>
            <strong>ค่ามิเตอร์รายชั่วโมง</strong>
          </div>
          <div class="daily-chart-day-nav" aria-label="เลือกวันที่ของกราฟ ${house.house_name}">
            <button
              class="chart-nav-btn daily-chart-day-btn"
              type="button"
              data-house-id="${house.id}"
              data-direction="prev"
              ${prevDisabled ? "disabled" : ""}
              aria-label="วันก่อนหน้าของ ${house.house_name}"
            >&lt;</button>
            <div>
              <p>${displayDate}</p>
              <button
                class="daily-chart-calendar-toggle"
                type="button"
                data-house-id="${house.id}"
                aria-label="เลือกวันที่ย้อนหลังของ ${house.house_name}"
                ${dateKeys.length === 0 ? "disabled" : ""}
              >
                เลือกวันที่
              </button>
              ${isCalendarOpen ? renderDailyChartCalendar(house.id, dateKeys, dateKey, calendarMonthKey) : ""}
            </div>
            <button
              class="chart-nav-btn daily-chart-day-btn"
              type="button"
              data-house-id="${house.id}"
              data-direction="next"
              ${nextDisabled ? "disabled" : ""}
              aria-label="วันถัดไปของ ${house.house_name}"
            >&gt;</button>
          </div>
        </div>
        <div class="chart-frame daily-chart-frame">
          <canvas id="dailyHouseChart-${house.id}"></canvas>
        </div>
      </article>
    `;
    })
    .join("");

  // วนลูปสร้างกราฟรายวันให้กับบ้านแต่ละหลัง
  houses.forEach((house, index) => {
    const readings = readingGroups[String(house.id)] || []; // ดึงข้อมูลการอ่านมิเตอร์ของบ้านหลังนี้จาก readingGroups
    const dateKey = getSelectedChartDateKey(house.id, readings); // หา dateKey ของวันที่ต้องการแสดงบนกราฟ
    const hourlyValues = buildHourlyMeterSeries(readings, dateKey); // สร้างชุดข้อมูลรายชั่วโมงของวันที่เลือก
    const canvas = document.getElementById(`dailyHouseChart-${house.id}`); // หา canvas ของกราฟบ้านหลังนี้จาก id ที่ผูกกับ house.id

    if (!canvas) return;

    // สร้างกราฟ Chart.js
    dailyCharts.push(
      createDailyMeterChart(
        canvas,
        house.house_name,
        hourLabels,
        hourlyValues,
        index,
      ),
    );
  });
}

// นำ reading_value ไปวางในช่องชั่วโมงที่ตรงกับ reading_time
function buildHourlyMeterSeries(readings, dateKey) {
  const hourly = Array(24).fill(null); // สร้าง array 24 ช่อง สำหรับ 24 ชั่วโมง ถ้า reading เวลา 13:20 จะเอาค่าไปใส่ hourly[13]

  readings
    .filter((reading) => reading.reading_value != null) // ใช้เฉพาะ readings ที่มีค่าเลขมิเตอร์จริง
    .map((reading) => ({
      ...reading, // เพิ่ม parsedDate เข้าไปใน reading เพื่อใช้ดึงวัน/ชั่วโมง
      parsedDate: parseDateValue(reading.reading_time),
    }))
    .filter(
      (reading) =>
        reading.parsedDate &&
        !Number.isNaN(reading.parsedDate.getTime()) &&
        getDateKey(reading.parsedDate) === dateKey,
    ) // เอาเฉพาะ reading ที่วันที่ตรงกับวันที่เลือก
    .sort((a, b) => a.parsedDate - b.parsedDate || Number(a.id) - Number(b.id)) // เรียงตามเวลา ถ้าเวลาเท่ากัน ใช้ id เป็นตัวช่วยเรียง
    .forEach((reading) => {
      hourly[reading.parsedDate.getHours()] = Number(reading.reading_value);
    }); // เอาค่า reading ไปใส่ช่องชั่วโมงนั้น

  return hourly;
}

// สร้างกราฟเส้น Chart.js สำหรับเลขมิเตอร์รายชั่วโมงของบ้านหนึ่งหลัง
function createDailyMeterChart(canvas, houseName, labels, data, index) {
  const palette = ["#093C5D", "#3B7597", "#0F9F9A", "#5DF8D8"];
  const color = palette[index % palette.length];

  return new Chart(canvas.getContext("2d"), {
    // สร้างกราฟเส้นด้วย Chart.js
    type: "line",
    data: {
      labels, // labels คือ 24 ชั่วโมง
      datasets: [
        // data คือค่า reading ของแต่ละชั่วโมง
        {
          label: houseName,
          data,
          borderColor: color,
          backgroundColor: "rgba(111, 209, 215, 0.18)",
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: color,
          pointBorderWidth: 2,
          tension: 0.35,
          spanGaps: false, // ถ้าข้อมูลเป็น null จะไม่ลากเส้นข้ามช่องว่าง
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // ให้กราฟปรับตามขนาด container ที่ CSS กำหนด
      interaction: {
        mode: "nearest",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) =>
              `เลขมิเตอร์: ${formatMeter(context.parsed.y)} kWh`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: {
            color: "#344054",
            font: { size: 10, weight: "800" },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero: false,
          grid: { color: "rgba(148, 163, 184, 0.18)" },
          ticks: {
            color: "#093C5D",
            font: { size: 10, weight: "800" },
            maxTicksLimit: 5,
            callback: (value) => Number(value).toLocaleString("th-TH"),
          },
        },
      },
    },
  });
}

/*
==============================
รายการอ่านล่าสุด
==============================
*/

// แสดงรายการอ่านมิเตอร์ล่าสุดใต้กราฟ
function renderRecentReadings(readings) {
  const container = document.getElementById("recentReadings");
  if (!container) return;

  if (!readings.length) {
    container.innerHTML = `<p class="empty-note mb-0">ยังไม่มีประวัติการอ่านมิเตอร์</p>`; // ถ้าไม่มีข้อมูล แสดง empty state
    return;
  }

  container.innerHTML = readings
    .map(
      (reading) => `
    <article class="recent-reading-item">
      <div class="recent-reading-thumb">
        ${renderReadingImage(reading)}
      </div>
      <div>
        <span>${reading.house_name}</span>
        <strong>${formatMeter(reading.reading_value)} kWh</strong>
        <p>${formatThaiDate(reading.reading_time)}</p>
      </div>
      <a class="btn btn-sm btn-outline-primary" href="/admin?reading_id=${reading.id}">ตรวจ</a>
    </article>
  `,
    )
    .join("");
}

// แสดงเลขมิเตอร์ ถ้าไม่มีค่าให้แสดง "-"
// ถ้ามีค่า แปลงเป็นตัวเลขแบบอ่านง่าย
function formatMeter(value) {
  if (value == null || value === "") return "-";
  return Number(value).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

// แสดงผลต่างระหว่างเลขล่าสุดกับเลขก่อนหน้า
// ถ้าเป็นบวกเติม +
function formatDelta(latest, previous) {
  if (!latest?.reading_value || !previous?.reading_value) return "-";
  const delta = Number(latest.reading_value) - Number(previous.reading_value);
  return `${delta >= 0 ? "+" : ""}${delta.toLocaleString("th-TH")} kWh`;
}

// แสดงวันที่และเวลาแบบไทย
function formatThaiDate(value) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// แสดงเฉพาะวันที่แบบไทย ไม่รวมเวลา
function formatThaiDateOnly(value) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
