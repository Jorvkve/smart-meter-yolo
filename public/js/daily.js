let latestChart;
let activeHousePage = 0;
let dailyHouseState = {
  houses: [],
  latestReadings: [],
  readingGroups: {},
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
  };

  setupHousePager();
  renderHouseCards();

  renderSummary(activeHouses, latestReadings, readingWarnings);
  renderLatestChart(latestReadings);
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
            <a class="btn btn-sm btn-primary" href="/admin">ตรวจ/แก้เลข</a>
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

function renderLatestChart(latestReadings) {
  const canvas = document.getElementById("totalUsageChart");
  if (!canvas) return;

  if (latestChart) latestChart.destroy();

  latestChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: latestReadings.map(row => row.house_name),
      datasets: [{
        label: "เลขมิเตอร์สะสมล่าสุด (kWh)",
        data: latestReadings.map(row => Number(row.reading_value) || 0),
        backgroundColor: ["#093C5D", "#3B7597", "#6FD1D7", "#5DF8D8"],
        borderRadius: 8,
        maxBarThickness: 78,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            boxWidth: 12,
            color: "#17212f",
            font: { weight: "800" },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#344054", font: { weight: "800" } } },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.18)" },
          ticks: {
            color: "#093C5D",
            font: { weight: "800" },
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
      <a class="btn btn-sm btn-outline-primary" href="/admin">ตรวจ</a>
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
  return new Date(value).toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
