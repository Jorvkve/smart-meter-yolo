let dailyCharts = [];
let activeHousePage = 0;
let activeDailyCalendarHouseId = null;
let dailyHouseState = {
  houses: [],
  latestReadings: [],
  readingGroups: {},
  chartDateKeys: {},
  chartCalendarMonths: {},
};

const HOUSE_PAGE_SIZE = 3;

window.addEventListener("load", initDashboard);

async function initDashboard() {
  const [houses, latestReadings, allReadings] = await Promise.all([
    fetchJson("/api/houses"),
    fetchJson("/api/readings/latest"),
    fetchJson("/api/readings"),
  ]);

  const activeHouses = houses.filter(house => house.is_active == 1);
  const readingGroups = groupReadingsByHouse(allReadings);
  const readingWarnings = getReadingWarnings(allReadings);
  dailyHouseState = {
    houses: activeHouses,
    latestReadings,
    readingGroups,
    chartDateKeys: buildInitialChartDateKeys(activeHouses, readingGroups),
    chartCalendarMonths: buildInitialCalendarMonths(activeHouses, readingGroups),
  };

  setupHousePager();
  setupDailyChartDateControls();
  renderHouseCards();

  renderSummary(activeHouses, latestReadings, readingWarnings);
  renderDailyHouseCharts(activeHouses, readingGroups);
  renderRecentReadings(allReadings.slice(0, 8));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

function groupReadingsByHouse(readings) {
  return readings.reduce((groups, reading) => {
    const key = String(reading.house_id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(reading);
    return groups;
  }, {});
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
    return new Date(text.replace(" ", "T"));
  }

  return new Date(text);
}

function getDateKey(date) {
  if (!date || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getLatestReadingDateKey(readings) {
  const latest = readings
    .map(reading => parseDateValue(reading.reading_time))
    .filter(date => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0];

  return getDateKey(latest);
}

function getHouseDateKeys(readings) {
  return [
    ...new Set(
      readings
        .map(reading => parseDateValue(reading.reading_time))
        .filter(date => date && !Number.isNaN(date.getTime()))
        .map(getDateKey)
        .filter(Boolean),
    ),
  ].sort();
}

function buildInitialChartDateKeys(houses, readingGroups) {
  return houses.reduce((keys, house) => {
    const readings = readingGroups[String(house.id)] || [];
    keys[String(house.id)] = getLatestReadingDateKey(readings);
    return keys;
  }, {});
}

function getSelectedChartDateKey(houseId, readings) {
  const dateKeys = getHouseDateKeys(readings);
  const selected = dailyHouseState.chartDateKeys[String(houseId)];

  if (dateKeys.includes(selected)) return selected;
  return dateKeys[dateKeys.length - 1] || "";
}

function getMonthKeyFromDateKey(dateKey) {
  return dateKey ? dateKey.slice(0, 7) : "";
}

function buildInitialCalendarMonths(houses, readingGroups) {
  return houses.reduce((months, house) => {
    const readings = readingGroups[String(house.id)] || [];
    months[String(house.id)] = getMonthKeyFromDateKey(getLatestReadingDateKey(readings));
    return months;
  }, {});
}

function getSelectedCalendarMonthKey(houseId, selectedDateKey) {
  const savedMonth = dailyHouseState.chartCalendarMonths[String(houseId)];
  return savedMonth || getMonthKeyFromDateKey(selectedDateKey);
}

function shiftMonthKey(monthKey, amount) {
  if (!monthKey) return "";

  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatThaiMonthYear(monthKey) {
  if (!monthKey) return "-";
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });
}

function renderSummary(houses, latestReadings, warnings) {
  document.getElementById("activeHouseCount").innerText = houses.length.toLocaleString("th-TH");
  document.getElementById("latestReadCount").innerText = latestReadings.filter(row => row.reading_value != null).length.toLocaleString("th-TH");
  document.getElementById("warningCount").innerText = warnings.length.toLocaleString("th-TH");
}

function getReadingWarnings(readings) {
  const groups = groupReadingsByHouse(readings);
  const warnings = [];

  Object.values(groups).forEach(group => {
    group
      .sort((a, b) => new Date(a.reading_time) - new Date(b.reading_time) || Number(a.id) - Number(b.id))
      .forEach((reading, index, list) => {
        const status = getReadingStatus(reading, list[index - 1]);
        if (status.level !== "ok") warnings.push({ reading, status });
      });
  });

  return warnings;
}

function setupHousePager() {
  document.getElementById("prevHousePageBtn")?.addEventListener("click", () => {
    activeHousePage -= 1;
    renderHouseCards();
  });

  document.getElementById("nextHousePageBtn")?.addEventListener("click", () => {
    activeHousePage += 1;
    renderHouseCards();
  });
}

function setupDailyChartDateControls() {
  const container = document.getElementById("dailyHouseCharts");
  if (!container) return;

  container.addEventListener("click", event => {
    const calendarButton = event.target.closest(".daily-chart-calendar-toggle");
    if (calendarButton) {
      const houseId = String(calendarButton.dataset.houseId);
      activeDailyCalendarHouseId =
        activeDailyCalendarHouseId === houseId ? null : houseId;
      renderDailyHouseCharts(dailyHouseState.houses, dailyHouseState.readingGroups);
      return;
    }

    const calendarMonthButton = event.target.closest(".daily-calendar-month-btn");
    if (calendarMonthButton) {
      const houseId = String(calendarMonthButton.dataset.houseId);
      const selectedDateKey = dailyHouseState.chartDateKeys[houseId] || "";
      const currentMonth = getSelectedCalendarMonthKey(houseId, selectedDateKey);
      const step = calendarMonthButton.dataset.direction === "next" ? 1 : -1;
      dailyHouseState.chartCalendarMonths[houseId] = shiftMonthKey(currentMonth, step);
      activeDailyCalendarHouseId = houseId;
      renderDailyHouseCharts(dailyHouseState.houses, dailyHouseState.readingGroups);
      return;
    }

    const calendarDay = event.target.closest(".daily-calendar-day.has-data");
    if (calendarDay) {
      const houseId = String(calendarDay.dataset.houseId);
      dailyHouseState.chartDateKeys[houseId] = calendarDay.dataset.dateKey;
      dailyHouseState.chartCalendarMonths[houseId] = getMonthKeyFromDateKey(calendarDay.dataset.dateKey);
      activeDailyCalendarHouseId = null;
      renderDailyHouseCharts(dailyHouseState.houses, dailyHouseState.readingGroups);
      return;
    }

    const button = event.target.closest(".daily-chart-day-btn");
    if (!button) return;

    changeDailyChartDate(button.dataset.houseId, button.dataset.direction);
  });
}

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
  dailyHouseState.chartCalendarMonths[String(houseId)] = getMonthKeyFromDateKey(nextDateKey);
  renderDailyHouseCharts(dailyHouseState.houses, dailyHouseState.readingGroups);
}

function renderHouseCards() {
  const container = document.getElementById("houseCards");
  if (!container) return [];

  const { houses, latestReadings, readingGroups } = dailyHouseState;
  const totalPages = Math.max(1, Math.ceil(houses.length / HOUSE_PAGE_SIZE));
  activeHousePage = (activeHousePage + totalPages) % totalPages;
  updateHousePager(totalPages);

  const warnings = [];
  houses.forEach(house => {
    const latest = latestReadings.find(reading => String(reading.id) === String(house.id));
    const history = readingGroups[String(house.id)] || [];
    const previous = history.find(row => row.id !== latest?.reading_id && row.reading_time !== latest?.reading_time);
    const status = getReadingStatus(latest, previous);

    if (status.level !== "ok") warnings.push({ house, status });
  });

  const pageHouses = houses.slice(activeHousePage * HOUSE_PAGE_SIZE, (activeHousePage + 1) * HOUSE_PAGE_SIZE);

  container.innerHTML = pageHouses.map(house => {
    const latest = latestReadings.find(reading => String(reading.id) === String(house.id));
    const history = readingGroups[String(house.id)] || [];
    const previous = history.find(row => row.id !== latest?.reading_id && row.reading_time !== latest?.reading_time);
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
  }).join("");

  return warnings;
}

function updateHousePager(totalPages) {
  const counter = document.getElementById("housePageCounter");
  const prev = document.getElementById("prevHousePageBtn");
  const next = document.getElementById("nextHousePageBtn");
  const shouldShowControls = totalPages > 1;

  if (counter) counter.innerText = `${activeHousePage + 1} / ${totalPages}`;
  if (prev) prev.disabled = !shouldShowControls;
  if (next) next.disabled = !shouldShowControls;
}

function getReadingStatus(latest, previous) {
  if (!latest?.reading_value) return { level: "empty", label: "ยังไม่มีข้อมูล" };
  if (previous && Number(latest.reading_value) < Number(previous.reading_value)) {
    return { level: "danger", label: "เลขลดลง" };
  }
  if (previous && Number(latest.reading_value) - Number(previous.reading_value) > 2000) {
    return { level: "warn", label: "เพิ่มสูง" };
  }
  if (!latest.image_filename) return { level: "warn", label: "ไม่มีรูป" };
  return { level: "ok", label: "ปกติ" };
}

function renderReadingImage(reading) {
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

function renderDailyChartCalendar(houseId, dateKeys, selectedDateKey, monthKey) {
  if (!monthKey) {
    return `
      <div class="daily-calendar-popover">
        <p class="empty-note mb-0">ไม่มีข้อมูลวันที่สำหรับบ้านนี้</p>
      </div>
    `;
  }

  const availableDates = new Set(dateKeys);
  const [year, month] = monthKey.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const firstDay = firstDate.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const minMonthKey = getMonthKeyFromDateKey(dateKeys[0]);
  const maxMonthKey = getMonthKeyFromDateKey(dateKeys[dateKeys.length - 1]);
  const prevMonthDisabled = minMonthKey ? shiftMonthKey(monthKey, -1) < minMonthKey : true;
  const nextMonthDisabled = maxMonthKey ? shiftMonthKey(monthKey, 1) > maxMonthKey : true;
  const cells = [];

  for (let i = 0; i < firstDay; i += 1) cells.push(`<span class="daily-calendar-day blank"></span>`);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const hasData = availableDates.has(dateKey);
    const isSelected = dateKey === selectedDateKey;

    cells.push(`
      <button
        class="daily-calendar-day ${hasData ? "has-data" : "no-data"} ${isSelected ? "selected" : ""}"
        type="button"
        data-house-id="${houseId}"
        data-date-key="${dateKey}"
        ${hasData ? "" : "disabled"}
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

function renderDailyHouseCharts(houses, readingGroups) {
  const container = document.getElementById("dailyHouseCharts");
  if (!container) return;

  dailyCharts.forEach(chart => chart.destroy());
  dailyCharts = [];

  if (!houses.length) {
    container.innerHTML = `<p class="empty-note">ยังไม่มีบ้านที่เปิดใช้งาน</p>`;
    return;
  }

  const hourLabels = Array.from({ length: 24 }, (_, hour) =>
    `${String(hour).padStart(2, "0")}:00`,
  );

  container.innerHTML = houses.map(house => {
    const readings = readingGroups[String(house.id)] || [];
    const dateKeys = getHouseDateKeys(readings);
    const dateKey = getSelectedChartDateKey(house.id, readings);
    const dateIndex = dateKeys.indexOf(dateKey);
    const displayDate = dateKey ? formatThaiDateOnly(`${dateKey} 00:00:00`) : "-";
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
  }).join("");

  houses.forEach((house, index) => {
    const readings = readingGroups[String(house.id)] || [];
    const dateKey = getSelectedChartDateKey(house.id, readings);
    const hourlyValues = buildHourlyMeterSeries(readings, dateKey);
    const canvas = document.getElementById(`dailyHouseChart-${house.id}`);

    if (!canvas) return;

    dailyCharts.push(createDailyMeterChart(
      canvas,
      house.house_name,
      hourLabels,
      hourlyValues,
      index,
    ));
  });
}

function buildHourlyMeterSeries(readings, dateKey) {
  const hourly = Array(24).fill(null);

  readings
    .filter(reading => reading.reading_value != null)
    .map(reading => ({
      ...reading,
      parsedDate: parseDateValue(reading.reading_time),
    }))
    .filter(reading =>
      reading.parsedDate &&
      !Number.isNaN(reading.parsedDate.getTime()) &&
      getDateKey(reading.parsedDate) === dateKey
    )
    .sort((a, b) => a.parsedDate - b.parsedDate || Number(a.id) - Number(b.id))
    .forEach(reading => {
      hourly[reading.parsedDate.getHours()] = Number(reading.reading_value);
    });

  return hourly;
}

function createDailyMeterChart(canvas, houseName, labels, data, index) {
  const palette = ["#093C5D", "#3B7597", "#0F9F9A", "#5DF8D8"];
  const color = palette[index % palette.length];

  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
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
        spanGaps: false,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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
            label: context => `เลขมิเตอร์: ${formatMeter(context.parsed.y)} kWh`,
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
            callback: value => Number(value).toLocaleString("th-TH"),
          },
        },
      },
    },
  });
}

function renderRecentReadings(readings) {
  const container = document.getElementById("recentReadings");
  if (!container) return;

  if (!readings.length) {
    container.innerHTML = `<p class="empty-note mb-0">ยังไม่มีประวัติการอ่านมิเตอร์</p>`;
    return;
  }

  container.innerHTML = readings.map(reading => `
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
  `).join("");
}

function formatMeter(value) {
  if (value == null || value === "") return "-";
  return Number(value).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function formatDelta(latest, previous) {
  if (!latest?.reading_value || !previous?.reading_value) return "-";
  const delta = Number(latest.reading_value) - Number(previous.reading_value);
  return `${delta >= 0 ? "+" : ""}${delta.toLocaleString("th-TH")} kWh`;
}

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
