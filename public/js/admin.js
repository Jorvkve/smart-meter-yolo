const API = "/api";

let allReadings = [];
let allHouses = [];
let deviceHeartbeats = [];
let editingReadingId = null;
let currentReadingPage = 1;
let lastReadingFilterSignature = "";
const HIGH_USAGE_WARNING = 2000;
const DEFAULT_READING_SORT = "house_time";
const DEFAULT_READING_STATUS = "";

window.addEventListener("load", async () => {
  await loadHouses();
  await Promise.all([
    loadMeterReadings(),
    loadDeviceHeartbeats(),
  ]);
});

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
    return new Date(text.replace(" ", "T"));
  }

  return new Date(text);
}

function formatReadingTime(value) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH");
}

function formatRelativeAge(seconds) {
  const totalSeconds = Number(seconds);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "-";
  if (totalSeconds < 60) return `${Math.round(totalSeconds)} วินาทีที่แล้ว`;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes.toLocaleString("th-TH")} นาทีที่แล้ว`;

  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours.toLocaleString("th-TH")} ชั่วโมงที่แล้ว`;

  const totalDays = Math.round(totalHours / 24);
  return `${totalDays.toLocaleString("th-TH")} วันที่แล้ว`;
}

function formatUptime(value) {
  const uptimeMs = Number(value);
  if (!Number.isFinite(uptimeMs) || uptimeMs < 0) return "-";

  const minutes = Math.floor(uptimeMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days.toLocaleString("th-TH")} วัน ${hours % 24} ชม.`;
  if (hours > 0) return `${hours.toLocaleString("th-TH")} ชม. ${minutes % 60} นาที`;
  return `${minutes.toLocaleString("th-TH")} นาที`;
}

function formatReadingValue(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadHouses() {
  const res = await fetch(`${API}/houses`);
  const houses = await res.json();
  allHouses = houses;
  const container = document.getElementById("houseList");
  const total = document.getElementById("totalHouses");
  const template = document.getElementById("houseTemplate");

  if (!container || !template) return;

  if (total) total.innerHTML = `${houses.length} บ้าน`;

  container.innerHTML = "";

  houses.forEach(house => {
    const clone = template.content.cloneNode(true);
    const toggleBtn = clone.querySelector(".deleteBtn");

    clone.querySelector(".house-name").innerText = house.house_name;
    clone.querySelector(".owner").innerText = `เจ้าของ: ${house.owner_name || "-"}`;
    clone.querySelector(".address").innerText = `ที่อยู่: ${house.address || "-"}`;
    clone.querySelector(".phone").innerText = `โทร: ${house.phone || "-"}`;

    clone.querySelector(".editBtn").onclick = () => editHouse(
      house.id,
      house.house_name,
      house.owner_name,
      house.address,
      house.phone
    );

    if (house.is_active == 1) {
      toggleBtn.innerText = "ปิดใช้งาน";
      toggleBtn.className = "btn btn-danger btn-sm deleteBtn";
    } else {
      toggleBtn.innerText = "เปิดใช้งาน";
      toggleBtn.className = "btn btn-success btn-sm deleteBtn";
    }

    toggleBtn.onclick = () => toggleHouse(house.id);
    container.appendChild(clone);
  });
}

async function toggleHouse(id) {
  if (!confirm("ต้องการเปลี่ยนสถานะบ้านนี้หรือไม่?")) return;

  await fetch(`${API}/houses/toggle/${id}`, {
    method: "PUT"
  });

  loadHouses();
}

async function addHouse() {
  const house_name = document.getElementById("house_name").value.trim();
  const owner_name = document.getElementById("owner_name").value.trim();
  const address = document.getElementById("address").value.trim();
  const phone = document.getElementById("phone").value.trim();

  if (!house_name) return alert("กรุณากรอกชื่อบ้าน");

  await fetch(`${API}/houses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      house_name,
      owner_name,
      address,
      phone
    })
  });

  document.getElementById("house_name").value = "";
  document.getElementById("owner_name").value = "";
  document.getElementById("address").value = "";
  document.getElementById("phone").value = "";

  loadHouses();
}

async function loadMeterReadings() {
  const res = await fetch(`${API}/readings`);
  allReadings = await res.json();
  populateReadingFilters();
  renderReadings();
  openLinkedReadingEditor();
}

async function loadDeviceHeartbeats() {
  const table = document.getElementById("deviceHeartbeatTable");
  const total = document.getElementById("totalDevices");

  if (!table) return;

  table.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-muted py-4">กำลังโหลดสถานะอุปกรณ์...</td>
    </tr>
  `;

  try {
    const res = await fetch(`${API}/device-ping`);
    const rows = await res.json();

    if (!res.ok) {
      throw new Error(rows.error || "Cannot load device heartbeats");
    }

    deviceHeartbeats = Array.isArray(rows) ? rows : [];
    if (total) total.innerText = `${deviceHeartbeats.length.toLocaleString("th-TH")} อุปกรณ์`;
    renderDeviceHeartbeats();
  } catch (err) {
    console.error(err);
    if (total) total.innerText = "-";
    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">โหลดสถานะอุปกรณ์ไม่สำเร็จ</td>
      </tr>
    `;
  }
}

function renderDeviceHeartbeats() {
  const table = document.getElementById("deviceHeartbeatTable");
  if (!table) return;

  if (deviceHeartbeats.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">ยังไม่มี heartbeat จาก ESP32-CAM</td>
      </tr>
    `;
    return;
  }

  table.innerHTML = deviceHeartbeats.map(device => {
    const online = Number(device.is_online) === 1;
    const rssi = Number(device.wifi_rssi);
    const heap = Number(device.free_heap);

    return `
      <tr>
        <td>
          <strong>${escapeHtml(device.device_id)}</strong>
          <span class="device-subtext">uptime ${formatUptime(device.uptime_ms)}</span>
        </td>
        <td>${escapeHtml(device.house_name || (device.house_id ? `บ้าน ${device.house_id}` : "-"))}</td>
        <td>${renderDeviceStatusBadge(online)}</td>
        <td>
          <strong>${formatRelativeAge(device.seconds_since_seen)}</strong>
          <span class="device-subtext">${formatReadingTime(device.last_seen)}</span>
        </td>
        <td>${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</td>
        <td>${Number.isFinite(heap) ? `${heap.toLocaleString("th-TH")} bytes` : "-"}</td>
        <td>${escapeHtml(device.status_message || "-")}</td>
      </tr>
    `;
  }).join("");
}

function renderDeviceStatusBadge(online) {
  const status = online
    ? { level: "ok", label: "ออนไลน์" }
    : { level: "danger", label: "ขาดการติดต่อ" };

  return `<span class="reading-status-badge ${status.level}">${status.label}</span>`;
}

function openLinkedReadingEditor() {
  const params = new URLSearchParams(window.location.search);
  const readingId = Number(params.get("reading_id"));

  if (!Number.isInteger(readingId) || readingId <= 0) return;
  if (!allReadings.some(item => Number(item.id) === readingId)) return;

  openReadingEditor(readingId);
}

function populateReadingFilters() {
  const houseSelect = document.getElementById("filterHouse");
  const monthSelect = document.getElementById("filterMonth");

  if (houseSelect) {
    const currentHouse = houseSelect.value;
    const houses = allHouses
      .filter(house => house.is_active == 1)
      .sort((a, b) => Number(a.id) - Number(b.id));

    houseSelect.innerHTML = `<option value="">ทุกบ้าน</option>`;
    houses.forEach(house => {
      houseSelect.add(new Option(house.house_name || `บ้าน ${house.id}`, house.id));
    });
    houseSelect.value = [...houseSelect.options].some(option => option.value === currentHouse) ? currentHouse : "";
  }

  if (monthSelect) {
    const currentMonth = monthSelect.value;
    const months = [...new Set(allReadings.map(reading => getMonthKey(reading.reading_time)).filter(Boolean))]
      .sort();

    monthSelect.innerHTML = `<option value="">ทุกเดือน</option>`;
    months.forEach(month => {
      monthSelect.add(new Option(formatMonthLabel(month), month));
    });
    monthSelect.value = [...monthSelect.options].some(option => option.value === currentMonth) ? currentMonth : "";
  }
}

function renderReadings() {
  const table = document.getElementById("readingTable");
  const keyword = document.getElementById("searchHouse")?.value.toLowerCase() || "";
  const filterHouse = document.getElementById("filterHouse")?.value || "";
  const filterMonth = document.getElementById("filterMonth")?.value || "";
  const filterDate = document.getElementById("filterDate")?.value || "";
  const filterStatusElement = document.getElementById("filterStatus");
  const filterStatus = filterStatusElement ? filterStatusElement.value : DEFAULT_READING_STATUS;
  const sort = document.getElementById("sortType")?.value || DEFAULT_READING_SORT;
  const pageSize = Number(document.getElementById("readingPageSize")?.value || 25);
  const filterSignature = JSON.stringify({
    keyword,
    filterHouse,
    filterMonth,
    filterDate,
    filterStatus,
    sort,
    pageSize,
  });
  const statusMap = buildReadingStatusMap(allReadings);

  if (filterSignature !== lastReadingFilterSignature) {
    currentReadingPage = 1;
    lastReadingFilterSignature = filterSignature;
  }

  let data = allReadings.filter(r =>
    String(r.house_name || "").toLowerCase().includes(keyword)
    && (!filterHouse || String(r.house_id) === filterHouse)
    && (!filterMonth || getMonthKey(r.reading_time) === filterMonth)
    && (!filterDate || getDateKey(r.reading_time) === filterDate)
    && matchesStatusFilter(statusMap.get(Number(r.id)), filterStatus)
  );

  switch (sort) {
    case "latest":
      data.sort((a, b) => new Date(b.reading_time) - new Date(a.reading_time));
      break;
    case "oldest":
      data.sort((a, b) => new Date(a.reading_time) - new Date(b.reading_time));
      break;
    case "house":
      data.sort((a, b) => String(a.house_name).localeCompare(String(b.house_name)));
      break;
    case "house_time":
      data.sort((a, b) => Number(a.house_id || 0) - Number(b.house_id || 0) || new Date(a.reading_time) - new Date(b.reading_time));
      break;
    case "unit_high":
      data.sort((a, b) => Number(b.reading_value || 0) - Number(a.reading_value || 0));
      break;
    case "unit_low":
      data.sort((a, b) => Number(a.reading_value || 0) - Number(b.reading_value || 0));
      break;
  }

  const totalFiltered = data.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  currentReadingPage = Math.min(Math.max(currentReadingPage, 1), totalPages);
  const pageStart = (currentReadingPage - 1) * pageSize;
  const pageRows = data.slice(pageStart, pageStart + pageSize);

  table.innerHTML = "";

  if (pageRows.length === 0) {
    const isNeedsReviewFilter = filterStatus === "needs_review";
    const emptyMessage = isNeedsReviewFilter
      ? `ไม่มีรายการที่ต้องตรวจสอบในขณะนี้ จากทั้งหมด ${allReadings.length.toLocaleString("th-TH")} รายการ`
      : "ไม่พบข้อมูลการอ่านค่าที่ตรงกับตัวกรอง";
    const emptyAction = isNeedsReviewFilter
      ? `<button class="btn btn-sm btn-primary mt-2" type="button" onclick="showAllMeterReadings()">ดูรายการทั้งหมด</button>`
      : "";

    table.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          <div>${emptyMessage}</div>
          ${emptyAction}
        </td>
      </tr>
    `;
    updateReadingResultCount(0, 0, 0);
    renderReadingPagination(0, 1, pageSize);
    return;
  }

  pageRows.forEach(reading => {
    const status = statusMap.get(Number(reading.id)) || getReadingStatus(reading, null);
    table.innerHTML += `
      <tr>
        <td>${escapeHtml(reading.house_name)}</td>
        <td><strong>${formatReadingValue(reading.reading_value)}</strong> kWh</td>
        <td>${formatReadingTime(reading.reading_time)}</td>
        <td>${renderStatusBadge(status)}</td>
        <td>
          ${
            reading.image_filename
              ? `<button class="reading-thumb-btn" type="button" onclick="openReadingEditor(${reading.id})">
                  <img
                    src="/uploads/${escapeHtml(reading.image_filename)}"
                    width="88"
                    alt="รูปมิเตอร์ของ ${escapeHtml(reading.house_name)}"
                    onerror="this.closest('button').innerText='ไม่มีรูป'"
                  />
                </button>`
              : "-"
          }
        </td>
        <td class="text-end">
          <button class="btn btn-primary btn-sm" onclick="openReadingEditor(${reading.id})">
            ตรวจ/แก้เลข
          </button>
          <button class="btn btn-outline-danger btn-sm" onclick="deleteReading(${reading.id})">
            ลบ
          </button>
        </td>
      </tr>
    `;
  });

  updateReadingResultCount(totalFiltered, pageStart + 1, pageStart + pageRows.length);
  renderReadingPagination(totalFiltered, totalPages, pageSize);
}

function buildReadingStatusMap(readings) {
  const grouped = readings.reduce((groups, reading) => {
    const key = String(reading.house_id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(reading);
    return groups;
  }, {});

  const statusMap = new Map();

  Object.values(grouped).forEach(group => {
    group
      .sort((a, b) => new Date(a.reading_time) - new Date(b.reading_time) || Number(a.id) - Number(b.id))
      .forEach((reading, index, list) => {
        statusMap.set(Number(reading.id), getReadingStatus(reading, list[index - 1]));
      });
  });

  return statusMap;
}

function getReadingStatus(reading, previous) {
  if (!reading?.reading_value) return { level: "empty", key: "empty", label: "ยังไม่มีข้อมูล" };

  const currentValue = Number(reading.reading_value);
  const previousValue = previous ? Number(previous.reading_value) : null;

  if (Number.isFinite(previousValue) && currentValue < previousValue) {
    return { level: "danger", key: "danger", label: "เลขลดลง" };
  }

  if (Number.isFinite(previousValue) && currentValue - previousValue > HIGH_USAGE_WARNING) {
    return { level: "warn", key: "high_usage", label: "เพิ่มสูง" };
  }

  if (!reading.image_filename) return { level: "warn", key: "missing_image", label: "ไม่มีรูป" };

  return { level: "ok", key: "ok", label: "ปกติ" };
}

function renderStatusBadge(status) {
  return `<span class="reading-status-badge ${escapeHtml(status.level)}">${escapeHtml(status.label)}</span>`;
}

function formatConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return "-";
  return `${(confidence * 100).toFixed(1)}%`;
}

function formatCaptureMode(value) {
  if (value === "burst") return "Burst หลายเฟรม";
  if (value === "manual") return "กรอกเลขเอง";
  if (value === "single") return "ภาพเดี่ยว";
  return "-";
}

function renderFrameMetadata(reading) {
  const container = document.getElementById("reviewFrameMeta");
  if (!container) return;

  const frames = Array.isArray(reading.frames_summary)
    ? reading.frames_summary
    : [];

  if (!reading.capture_mode && frames.length === 0) {
    container.innerHTML = `
      <div class="frame-meta-empty">
        ยังไม่มีข้อมูลการเลือกเฟรมสำหรับรายการนี้
      </div>
    `;
    return;
  }

  const selectedFrame = Number.isInteger(Number(reading.selected_frame))
    ? Number(reading.selected_frame)
    : null;

  container.innerHTML = `
    <div class="frame-meta-header">
      <div>
        <span>ข้อมูลการอ่านจากกล้อง</span>
        <strong>${formatCaptureMode(reading.capture_mode)}</strong>
      </div>
      <span class="frame-meta-badge">${frames.length ? `${frames.length} เฟรม` : "1 ภาพ"}</span>
    </div>
    <dl class="frame-meta-list">
      <div>
        <dt>เฟรมที่เลือก</dt>
        <dd>${selectedFrame !== null && selectedFrame >= 0 ? selectedFrame + 1 : "-"}</dd>
      </div>
      <div>
        <dt>เหตุผล</dt>
        <dd>${escapeHtml(reading.selection_reason || "-")}</dd>
      </div>
      <div>
        <dt>Confidence</dt>
        <dd>${formatConfidence(reading.avg_conf)}</dd>
      </div>
    </dl>
    ${
      frames.length
        ? `<div class="frame-summary-list">
            ${frames.map(frame => `
              <div class="frame-summary-item ${frame.selected ? "selected" : ""}">
                <span>เฟรม ${Number(frame.index) + 1}</span>
                <strong>${frame.reading_value ?? "-"} kWh</strong>
                <small>${formatConfidence(frame.avg_conf)} · ${frame.boxes ?? "-"} กล่อง</small>
              </div>
            `).join("")}
          </div>`
        : ""
    }
  `;
}

function matchesStatusFilter(status, filter) {
  if (!filter) return true;
  if (!status) return false;
  if (filter === "needs_review") return status.level !== "ok";
  if (filter === "warn") return status.level === "warn";
  if (filter === "missing_image") return status.key === "missing_image";
  return status.level === filter || status.key === filter;
}

function getDateKey(value) {
  if (!value) return "";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthKey(value) {
  if (!value) return "";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${month}/${year}`;
}

function updateReadingResultCount(count, start = 0, end = 0) {
  const result = document.getElementById("readingResultCount");
  if (!result) return;

  if (count === 0) {
    result.innerText = `ไม่พบรายการที่ตรงกับตัวกรอง จากทั้งหมด ${allReadings.length.toLocaleString("th-TH")} รายการ`;
    return;
  }

  result.innerText = `แสดง ${start.toLocaleString("th-TH")}-${end.toLocaleString("th-TH")} จาก ${count.toLocaleString("th-TH")} รายการที่ตรงกับตัวกรอง / ทั้งหมด ${allReadings.length.toLocaleString("th-TH")} รายการ`;
}

function renderReadingPagination(totalFiltered, totalPages, pageSize) {
  const container = document.getElementById("readingPagination");
  if (!container) return;

  if (totalFiltered <= pageSize) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button
      class="chart-nav-btn"
      type="button"
      onclick="changeReadingPage(-1)"
      ${currentReadingPage <= 1 ? "disabled" : ""}
      aria-label="หน้าก่อนหน้า"
    >&lt;</button>
    <span class="chart-counter">${currentReadingPage.toLocaleString("th-TH")} / ${totalPages.toLocaleString("th-TH")}</span>
    <button
      class="chart-nav-btn"
      type="button"
      onclick="changeReadingPage(1)"
      ${currentReadingPage >= totalPages ? "disabled" : ""}
      aria-label="หน้าถัดไป"
    >&gt;</button>
  `;
}

function changeReadingPage(direction) {
  currentReadingPage += direction;
  renderReadings();
}

function showAllMeterReadings() {
  const filterStatus = document.getElementById("filterStatus");
  if (filterStatus) filterStatus.value = "";

  currentReadingPage = 1;
  lastReadingFilterSignature = "";
  renderReadings();
}

function resetReadingFilters() {
  const ids = ["searchHouse", "filterHouse", "filterMonth", "filterDate"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const filterStatus = document.getElementById("filterStatus");
  if (filterStatus) filterStatus.value = DEFAULT_READING_STATUS;

  const sortType = document.getElementById("sortType");
  if (sortType) sortType.value = DEFAULT_READING_SORT;

  const pageSize = document.getElementById("readingPageSize");
  if (pageSize) pageSize.value = "25";

  currentReadingPage = 1;
  lastReadingFilterSignature = "";
  renderReadings();
}

function openReadingEditor(id) {
  const reading = allReadings.find(item => Number(item.id) === Number(id));
  if (!reading) return alert("ไม่พบรายการมิเตอร์นี้");

  editingReadingId = id;

  document.getElementById("reviewHouseName").innerText = reading.house_name || "-";
  document.getElementById("reviewReadingTime").innerText = `เวลาอ่านค่า: ${formatReadingTime(reading.reading_time)}`;
  document.getElementById("reviewReadingValue").value = Number(reading.reading_value || 0);

  const image = document.getElementById("reviewReadingImage");
  const empty = document.getElementById("reviewImageEmpty");

  if (reading.image_filename) {
    image.src = `/uploads/${reading.image_filename}`;
    image.classList.remove("d-none");
    empty.classList.add("d-none");
  } else {
    image.removeAttribute("src");
    image.classList.add("d-none");
    empty.classList.remove("d-none");
  }

  renderFrameMetadata(reading);
  document.getElementById("readingEditModal").classList.remove("d-none");
}

function closeReadingEditor() {
  editingReadingId = null;
  document.getElementById("readingEditModal").classList.add("d-none");
}

async function saveReadingValue() {
  const value = Number(document.getElementById("reviewReadingValue").value);

  if (!editingReadingId) return;
  if (!Number.isFinite(value) || value < 0) {
    return alert("กรุณากรอกเลขมิเตอร์ให้ถูกต้อง");
  }

  const res = await fetch(`${API}/readings/${editingReadingId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      reading_value: value
    })
  });

  const payload = await res.json();

  if (!res.ok) {
    return alert(payload.error || "แก้ไขเลขมิเตอร์ไม่สำเร็จ");
  }

  closeReadingEditor();
  await loadMeterReadings();
}

async function deleteReading(id) {
  const reading = allReadings.find(item => Number(item.id) === Number(id));
  const detail = reading
    ? `${reading.house_name || "-"} วันที่ ${formatReadingTime(reading.reading_time)} ค่า ${formatReadingValue(reading.reading_value)} kWh`
    : `รายการ id ${id}`;

  if (!confirm(`ต้องการลบข้อมูลมิเตอร์นี้หรือไม่?\n\n${detail}`)) return;

  await fetch(`${API}/readings/${id}`, {
    method: "DELETE"
  });

  loadMeterReadings();
}

async function editHouse(id, name, owner, address, phone) {
  const house_name = prompt("ชื่อบ้าน", name);
  if (!house_name) return;

  const owner_name = prompt("ชื่อเจ้าของ", owner || "");
  const addr = prompt("ที่อยู่", address || "");
  const phone_no = prompt("เบอร์โทร", phone || "");

  await fetch(`${API}/houses/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      house_name,
      owner_name,
      address: addr,
      phone: phone_no
    })
  });

  loadHouses();
}
