const API = "/api"; // เป็น prefix ของ backend API

let allReadings = []; // เก็บ readings ทั้งหมด
let allHouses = []; // เก็บบ้านทั้งหมด
let deviceHeartbeats = []; // เก็บสถานะ ESP32-CAM
let editingReadingId = null; // เก็บว่า modal กำลังแก้ reading id ไหน
let currentReadingPage = 1; // ใช้ pagination ตาราง readings
let lastReadingFilterSignature = ""; // ใช้ดูว่า filter เปลี่ยนไหม
const METER_DIGIT_LENGTH = 5; // มิเตอร์ที่ใช้ในโปรเจกต์นี้อ่านเลขหลัก kWh ทั้งหมด 5 หลัก
const METER_MAX_UNITS_PER_HOUR = 5; // ใช้เป็นช่วงเผื่อเวลาหลักล่างกำลังทดเลข ไม่ใช่เกณฑ์คิดค่าไฟ
const METER_MIN_DIGIT_TOLERANCE = 5;
const METER_MAX_DIGIT_TOLERANCE = 30;
const DEFAULT_READING_SORT = "house_time";
const DEFAULT_READING_STATUS = "";

/*
==============================
ตั้งค่าเริ่มต้นของหน้า
==============================
*/

// เมื่อหน้าโหลดเสร็จ ให้โหลดบ้านก่อน
// จากนั้นโหลด readings กับ device heartbeat พร้อมกัน
window.addEventListener("load", async () => {
  await loadHouses();
  await Promise.all([loadMeterReadings(), loadDeviceHeartbeats()]);
});

/*
==============================
ตัวช่วยจัดรูปแบบข้อความ
==============================
*/

// แปลงค่าวันเวลาจาก database/string ให้เป็น Date object
// ได้ Date object ของวันที่ 27/05/2026 เวลา 14:30
function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
    return new Date(text.replace(" ", "T"));
  }

  return new Date(text);
}

// แสดงเวลาที่อ่านมิเตอร์ในรูปแบบวันที่/เวลาไทย
// ผลลัพธ์ประมาณ: "27/5/2569 14:30:00"
function formatReadingTime(value) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH");
}

// แปลงจำนวนวินาทีให้เป็นข้อความว่าเห็นอุปกรณ์ล่าสุดเมื่อไร
function formatRelativeAge(seconds) {
  const totalSeconds = Number(seconds);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "-";
  if (totalSeconds < 60) return `${Math.round(totalSeconds)} วินาทีที่แล้ว`;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60)
    return `${totalMinutes.toLocaleString("th-TH")} นาทีที่แล้ว`;

  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 24)
    return `${totalHours.toLocaleString("th-TH")} ชั่วโมงที่แล้ว`;

  const totalDays = Math.round(totalHours / 24);
  return `${totalDays.toLocaleString("th-TH")} วันที่แล้ว`;
}

// แปลงเลขมิเตอร์ให้อ่านง่าย
function formatReadingValue(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

// ป้องกันข้อความจาก database/user ถูกตีความเป็น HTML
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*
==============================
จัดการข้อมูลบ้าน
==============================
*/

async function loadHouses() {
  // โหลดข้อมูลบ้านและแสดงเป็นการ์ดในหน้า admin
  const res = await fetch(`${API}/houses`); // เรียก GET /api/houses
  const houses = await res.json();
  allHouses = houses; // เก็บบ้านทั้งหมดไว้ใน allHouses
  const container = document.getElementById("houseList");
  const total = document.getElementById("totalHouses");
  const template = document.getElementById("houseTemplate"); // เอา template จาก HTML มา clone ทำการ์ดบ้าน

  if (!container || !template) return;

  if (total) total.innerHTML = `${houses.length} บ้าน`;

  container.innerHTML = "";

  // วนบ้านทุกหลัง
  houses.forEach((house) => {
    const clone = template.content.cloneNode(true); // clone template ใหม่สำหรับบ้านแต่ละหลัง
    const toggleBtn = clone.querySelector(".deleteBtn");

    // ใส่ชื่อบ้าน เจ้าของ ที่อยู่ เบอร์โทร ลงในการ์ด
    clone.querySelector(".house-name").innerText = house.house_name;
    clone.querySelector(".owner").innerText =
      `เจ้าของ: ${house.owner_name || "-"}`;
    clone.querySelector(".address").innerText =
      `ที่อยู่: ${house.address || "-"}`;
    clone.querySelector(".phone").innerText = `โทร: ${house.phone || "-"}`;

    // ผูกปุ่มแก้ไขบ้าน
    clone.querySelector(".editBtn").onclick = () =>
      editHouse(
        house.id,
        house.house_name,
        house.owner_name,
        house.address,
        house.phone,
      );

    // ถ้าบ้าน active ปุ่มจะเป็น “ปิดใช้งาน”
    if (house.is_active == 1) {
      toggleBtn.innerText = "ปิดใช้งาน";
      toggleBtn.className = "btn btn-danger btn-sm deleteBtn";
      // ถ้าบ้าน inactive ปุ่มจะเป็น “เปิดใช้งาน”
    } else {
      toggleBtn.innerText = "เปิดใช้งาน";
      toggleBtn.className = "btn btn-success btn-sm deleteBtn";
    }

    // เรียก PUT /api/houses/toggle/:id
    toggleBtn.onclick = () => toggleHouse(house.id);
    container.appendChild(clone);
  });
}

// สลับสถานะ is_active แทนการลบบ้านออกจากฐานข้อมูล
async function toggleHouse(id) {
  if (!confirm("ต้องการเปลี่ยนสถานะบ้านนี้หรือไม่?")) return;

  // เรียก PUT /api/houses/toggle/:id
  await fetch(`${API}/houses/toggle/${id}`, {
    method: "PUT",
  });

  loadHouses(); // แล้วโหลดบ้านใหม่เพื่ออัปเดต UI
}

// เพิ่มบ้านใหม่ เพื่อให้บ้านนั้นเริ่มรับข้อมูลอ่านมิเตอร์ได้
async function addHouse() {
  // อ่านค่าจาก input, บังคับให้กรอกชื่อบ้าน
  const house_name = document.getElementById("house_name").value.trim();
  const owner_name = document.getElementById("owner_name").value.trim();
  const address = document.getElementById("address").value.trim();
  const phone = document.getElementById("phone").value.trim();

  if (!house_name) return alert("กรุณากรอกชื่อบ้าน");

  // เรียก POST /api/houses เพื่อเพิ่มบ้านใหม่
  await fetch(`${API}/houses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      house_name,
      owner_name,
      address,
      phone,
    }),
  });

  // ล้างฟอร์ม
  document.getElementById("house_name").value = "";
  document.getElementById("owner_name").value = "";
  document.getElementById("address").value = "";
  document.getElementById("phone").value = "";

  loadHouses(); // โหลดรายการบ้านใหม่
}

/*
==============================
จัดการข้อมูลอ่านมิเตอร์
==============================
*/

async function loadMeterReadings() {
  // โหลด readings ทั้งหมดเพื่อใช้ตรวจสอบ กรอง แก้ไข หรือลบ
  const res = await fetch(`${API}/readings`);
  allReadings = await res.json();
  populateReadingFilters();
  renderReadings();
  openLinkedReadingEditor();
}

// โหลดสถานะ heartbeat ล่าสุดจาก ESP32-CAM มาแสดงในตาราง admin
async function loadDeviceHeartbeats() {
  const table = document.getElementById("deviceHeartbeatTable");
  const total = document.getElementById("totalDevices");

  if (!table) return;

  table.innerHTML = `
    <tr>
      <td colspan="4" class="text-center text-muted py-4">กำลังโหลดสถานะอุปกรณ์...</td>
    </tr>
  `;

  try {
    const res = await fetch(`${API}/device-ping`); // เรียก GET /api/device-ping
    const rows = await res.json();

    if (!res.ok) {
      throw new Error(rows.error || "Cannot load device heartbeats");
    }

    deviceHeartbeats = Array.isArray(rows) ? rows : []; // เก็บข้อมูล heartbeat
    if (total)
      total.innerText = `${deviceHeartbeats.length.toLocaleString("th-TH")} อุปกรณ์`;
    renderDeviceHeartbeats(); // render ตารางสถานะ device
  } catch (err) {
    console.error(err);
    if (total) total.innerText = "-";
    table.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-4">โหลดสถานะอุปกรณ์ไม่สำเร็จ</td>
      </tr>
    `;
  }
}

// แสดงตารางสถานะ ESP32-CAM ว่ายัง online อยู่หรือไม่
function renderDeviceHeartbeats() {
  const table = document.getElementById("deviceHeartbeatTable");
  if (!table) return;

  if (deviceHeartbeats.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-4">ยังไม่มีอุปกรณ์เชื่อมต่อ</td>
      </tr>
    `;
    return;
  }

  table.innerHTML = deviceHeartbeats
    .map((device) => {
      const online = Number(device.is_online) === 1; // เช็คสถานะ online/offline จาก backend
      return `
      <tr>
        <td>
          <strong>${escapeHtml(device.device_id)}</strong> <!-- แสดงรหัสอุปกรณ์ -->
        </td>
        <td>${escapeHtml(device.house_name || (device.house_id ? `บ้าน ${device.house_id}` : "-"))}</td> <!-- ชื่อบ้านหรือรหัสบ้าน -->
        <td>${renderDeviceStatusBadge(online)}</td> <!-- badge แสดง Online/Offline -->
        <td>
          <strong>${formatRelativeAge(device.seconds_since_seen)}</strong> <!-- เห็นอุปกรณ์ล่าสุดเมื่อไร -->
          <span class="device-subtext">${formatReadingTime(device.last_seen)}</span> <!-- เวลา heartbeat ล่าสุด -->
        </td>
      </tr>
    `;
    })
    .join("");
}

// สร้าง badge online/offline ของอุปกรณ์
function renderDeviceStatusBadge(online) {
  const status = online
    ? { level: "ok", label: "ออนไลน์" }
    : { level: "danger", label: "ขาดการติดต่อ" };

  return `<span class="reading-status-badge ${status.level}">${status.label}</span>`;
}

// หน้า daily สามารถส่ง ?reading_id=... มาเพื่อเปิด modal แก้เลขได้ทันที
function openLinkedReadingEditor() {
  const params = new URLSearchParams(window.location.search); // อ่าน query string จาก URL เช่น:
  const readingId = Number(params.get("reading_id")); // เอา reading_id มาเป็นตัวเลข

  if (!Number.isInteger(readingId) || readingId <= 0) return; // ถ้า reading_id ไม่ถูกต้อง ให้หยุดทำงาน
  if (!allReadings.some((item) => Number(item.id) === readingId)) return; // ถ้าไม่พบ reading_id ในข้อมูล readings ให้หยุดทำงาน

  openReadingEditor(readingId); // // ถ้าพบ ให้เปิด modal แก้ reading ทันที
}

// สร้าง dropdown ตัวกรองใหม่จากข้อมูลบ้านและ readings ที่โหลดมาแล้ว
function populateReadingFilters() {
  const houseSelect = document.getElementById("filterHouse");
  const monthSelect = document.getElementById("filterMonth");

  if (houseSelect) {
    const currentHouse = houseSelect.value;
    const houses = allHouses // สร้าง dropdown filter บ้านจากบ้าน active
      .filter((house) => house.is_active == 1)
      .sort((a, b) => Number(a.id) - Number(b.id)); // เรียงตาม id

    houseSelect.innerHTML = `<option value="">ทุกบ้าน</option>`;
    houses.forEach((house) => {
      houseSelect.add(
        new Option(house.house_name || `บ้าน ${house.id}`, house.id),
      );
    });
    houseSelect.value = [...houseSelect.options].some(
      (option) => option.value === currentHouse,
    )
      ? currentHouse
      : "";
  }

  if (monthSelect) {
    const currentMonth = monthSelect.value; // เก็บเดือนที่ผู้ใช้เลือกอยู่ตอนนี้
    const months = [
      // สร้างรายการเดือนทั้งหมดจากข้อมูล readings
      ...new Set( // ใช้ Set เพื่อตัดเดือนที่ซ้ำกันออก
        allReadings
          .map((reading) => getMonthKey(reading.reading_time)) // แปลงเวลาอ่านมิเตอร์ให้เป็น key ของเดือน เช่น 2026-05
          .filter(Boolean),
      ),
    ].sort(); // เรียงเดือนจากเก่าไปใหม่

    monthSelect.innerHTML = `<option value="">ทุกเดือน</option>`;
    months.forEach((month) => {
      monthSelect.add(new Option(formatMonthLabel(month), month));
    });
    monthSelect.value = [...monthSelect.options].some(
      (option) => option.value === currentMonth,
    )
      ? currentMonth
      : "";
  }
}

// ใช้ตัวกรอง การเรียงลำดับ และ pagination แล้วแสดงตาราง readings
function renderReadings() {
  const table = document.getElementById("readingTable");
  const keyword =
    document.getElementById("searchHouse")?.value.toLowerCase() || ""; // คำค้นหาชื่อบ้าน
  const filterHouse = document.getElementById("filterHouse")?.value || ""; // ตัวกรองบ้าน
  const filterMonth = document.getElementById("filterMonth")?.value || ""; // ตัวกรองเดือน
  const filterDate = document.getElementById("filterDate")?.value || ""; // ตัวกรองวันที่
  const filterStatusElement = document.getElementById("filterStatus"); // element ตัวกรองสถานะ
  const filterStatus = filterStatusElement
    ? filterStatusElement.value // ใช้สถานะที่ผู้ใช้เลือก
    : DEFAULT_READING_STATUS; // ถ้าไม่มี element ใช้ค่าเริ่มต้น
  const sort =
    document.getElementById("sortType")?.value || DEFAULT_READING_SORT; // รูปแบบการเรียงข้อมูล
  const pageSize = Number(
    document.getElementById("readingPageSize")?.value || 25, // จำนวนรายการต่อหน้า
  );
  // รวมค่าตัวกรองเป็น string เพื่อเปรียบเทียบว่าตัวกรองเปลี่ยนไหม
  const filterSignature = JSON.stringify({
    keyword,
    filterHouse,
    filterMonth,
    filterDate,
    filterStatus,
    sort,
    pageSize,
  });
  const statusMap = buildReadingStatusMap(allReadings); // สร้าง map ของสถานะ reading แต่ละรายการ, ใช้เทียบกับ previous reading ของบ้านเดียวกัน

  // ถ้าตัวกรองเปลี่ยนจากครั้งก่อน
  if (filterSignature !== lastReadingFilterSignature) {
    currentReadingPage = 1; // กลับไปหน้าแรกของตาราง
    lastReadingFilterSignature = filterSignature; // บันทึกค่าตัวกรองล่าสุด
  }

  // กรอง readings ตามทุกเงื่อนไขที่ user เลือก
  let data = allReadings.filter(
    (r) =>
      String(r.house_name || "")
        .toLowerCase()
        .includes(keyword) &&
      (!filterHouse || String(r.house_id) === filterHouse) &&
      (!filterMonth || getMonthKey(r.reading_time) === filterMonth) &&
      (!filterDate || getDateKey(r.reading_time) === filterDate) &&
      matchesStatusFilter(statusMap.get(Number(r.id)), filterStatus),
  );

  // เรียงข้อมูลตามแบบที่เลือก
  switch (sort) {
    case "latest":
      data.sort((a, b) => new Date(b.reading_time) - new Date(a.reading_time));
      break;
    case "oldest":
      data.sort((a, b) => new Date(a.reading_time) - new Date(b.reading_time));
      break;
    case "house":
      data.sort((a, b) =>
        String(a.house_name).localeCompare(String(b.house_name)),
      );
      break;
    case "house_time":
      data.sort(
        (a, b) =>
          Number(a.house_id || 0) - Number(b.house_id || 0) ||
          new Date(a.reading_time) - new Date(b.reading_time),
      );
      break;
    case "unit_high":
      data.sort(
        (a, b) => Number(b.reading_value || 0) - Number(a.reading_value || 0),
      );
      break;
    case "unit_low":
      data.sort(
        (a, b) => Number(a.reading_value || 0) - Number(b.reading_value || 0),
      );
      break;
  }

  const totalFiltered = data.length; // จำนวนข้อมูลทั้งหมดหลังกรองแล้ว
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize)); // คำนวณจำนวนหน้าทั้งหมด อย่างน้อยต้องมี 1 หน้า
  currentReadingPage = Math.min(Math.max(currentReadingPage, 1), totalPages); // บังคับเลขหน้าให้อยู่ระหว่าง 1 ถึงหน้าสุดท้าย
  const pageStart = (currentReadingPage - 1) * pageSize; // หาตำแหน่งเริ่มต้นของข้อมูลในหน้าปัจจุบัน
  const pageRows = data.slice(pageStart, pageStart + pageSize); // ตัดข้อมูลเฉพาะแถวที่ต้องแสดงในหน้านี้

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

  // render แถวในตาราง
  // แสดงบ้าน เลขมิเตอร์ เวลา status รูป และปุ่มตรวจ/แก้เลข/ลบ
  pageRows.forEach((reading) => {
    const status =
      statusMap.get(Number(reading.id)) || getReadingStatus(reading, null);
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

  updateReadingResultCount(
    totalFiltered,
    pageStart + 1,
    pageStart + pageRows.length,
  );
  renderReadingPagination(totalFiltered, totalPages, pageSize);
}

// เทียบ reading แต่ละรายการกับ reading ก่อนหน้าของบ้านเดียวกัน
function buildReadingStatusMap(readings) {
  // จัด readings เป็นกลุ่มตามบ้าน
  const grouped = readings.reduce((groups, reading) => {
    const key = String(reading.house_id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(reading);
    return groups;
  }, {});

  const statusMap = new Map();

  Object.values(grouped).forEach((group) => {
    group
      .sort(
        (
          a,
          b, // // เรียง reading ตามเวลาอ่านมิเตอร์
        ) =>
          new Date(a.reading_time) - new Date(b.reading_time) ||
          Number(a.id) - Number(b.id),
      )
      .forEach((reading, index, list) => {
        statusMap.set(
          Number(reading.id), // เก็บสถานะลง Map โดย key คือ reading id
          getReadingStatus(reading, list[index - 1]), // เทียบ reading ปัจจุบันกับ reading ก่อนหน้า
        );
      });
  });

  return statusMap;
}

// ตั้งสถานะเตือนเมื่อเลขว่าง เลขลดลง เลขกระโดดผิดรูปแบบ หรือไม่มีรูปประกอบ
function getReadingStatus(reading, previous) {
  // ถ้าไม่มีเลข reading ให้สถานะ empty
  if (!reading?.reading_value)
    return { level: "empty", key: "empty", label: "ยังไม่มีข้อมูล" }; // ถ้าไม่มี metadata เลย แสดงข้อความว่าง

  const currentValue = Number(reading.reading_value);
  const previousValue = previous ? Number(previous.reading_value) : null;

  // ถ้าเลขลดลงจากครั้งก่อน ให้ danger
  if (Number.isFinite(previousValue) && currentValue < previousValue) {
    return { level: "danger", key: "danger", label: "เลขลดลง" };
  }

  // ถ้าเลขหลักใหญ่เปลี่ยนโดยไม่สัมพันธ์กับการทดหลักล่าง ให้เตือนว่าเลขอาจอ่านผิด
  if (isSuspiciousDigitJump(reading, previous)) {
    return { level: "warn", key: "digit_jump", label: "เลขกระโดด" };
  }

  // ถ้าไม่มีรูป ให้ warning
  if (!reading.image_filename)
    return { level: "warn", key: "missing_image", label: "ไม่มีรูป" };

  // ไม่เข้าเงื่อนไขไหน ถือว่าปกติ
  return { level: "ok", key: "ok", label: "ปกติ" };
}

// ตรวจเลขมิเตอร์แบบ odometer 5 หลัก: หลักใหญ่ควรเปลี่ยนเมื่อหลักล่างเข้าใกล้ช่วงทดเลขเท่านั้น
function isSuspiciousDigitJump(reading, previous) {
  if (!previous) return false; // ถ้าไม่มีค่าก่อนหน้า ไม่ต้องสงสัย

  // แปลงเลขมิเตอร์เป็นตัวเลข
  const currentValue = Number(reading?.reading_value);
  const previousValue = Number(previous?.reading_value);
  // ถ้าเลขไม่ถูกต้อง ให้ไม่ต้องเช็ค
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
    return false;
  }

  // ตัดทศนิยมออก
  const currentInt = Math.trunc(currentValue);
  const previousInt = Math.trunc(previousValue);
  if (currentInt <= previousInt) return false; // ถ้าเลขไม่เพิ่มขึ้น ไม่ถือว่ากระโดด

  // แปลงเลขเป็น string แบบจำนวนหลักคงที่
  const previousDigits = formatMeterDigits(previousInt);
  const currentDigits = formatMeterDigits(currentInt);
  if (!previousDigits || !currentDigits) return false;

  // หา “หลักแรก” ที่เปลี่ยน
  const firstChangedIndex = [...currentDigits].findIndex(
    (digit, index) => digit !== previousDigits[index],
  );
  if (firstChangedIndex < 0) return false; // ถ้าไม่มีหลักไหนเปลี่ยน ไม่สงสัย

  const placeValue = 10 ** (METER_DIGIT_LENGTH - firstChangedIndex - 1); // คำนวณว่าหลักที่เปลี่ยนคือหลักอะไร
  if (placeValue === 1) return false; // ถ้าเปลี่ยนแค่หลักหน่วย ถือว่าปกติ

  // ดูว่าเลขหลักนั้นเพิ่มทีละ 1 หรือไม่
  const previousDigit = Number(previousDigits[firstChangedIndex]);
  const currentDigit = Number(currentDigits[firstChangedIndex]);
  const digitStep = (currentDigit - previousDigit + 10) % 10;
  if (digitStep !== 1) return true;

  // กรณี digitStep = 1 ยังต้องเช็คต่อ
  const tolerance = getDigitCarryTolerance(reading, previous, placeValue);
  const previousLower = previousInt % placeValue; // previousLower กับ currentLower คืออะไร
  const currentLower = currentInt % placeValue;

  return !(
    previousLower >= placeValue - tolerance && currentLower <= tolerance
  );
}

function formatMeterDigits(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  const text = String(Math.trunc(value));
  if (text.length > METER_DIGIT_LENGTH) return null;
  return text.padStart(METER_DIGIT_LENGTH, "0");
}

// คำนวณช่วงเผื่อจากเวลาที่ห่างกัน
function getDigitCarryTolerance(reading, previous, placeValue) {
  // อ่านเวลา current กับ previous
  const currentDate = parseDateValue(reading?.reading_time);
  const previousDate = parseDateValue(previous?.reading_time);
  // คำนวณเวลาที่ห่างกัน
  const elapsedHours =
    currentDate && previousDate
      ? Math.max(0, (currentDate - previousDate) / 3600000)
      : 1;
  // คำนวณ tolerance ตามเวลา
  const timeBasedTolerance = Math.ceil(
    Math.max(1, elapsedHours) * METER_MAX_UNITS_PER_HOUR,
  );

  return Math.min(
    placeValue - 1,
    METER_MAX_DIGIT_TOLERANCE,
    Math.max(METER_MIN_DIGIT_TOLERANCE, timeBasedTolerance),
  );
}

// สร้าง badge สถานะคุณภาพ reading เช่น ปกติ เลขลดลง หรือไม่มีรูป
function renderStatusBadge(status) {
  return `<span class="reading-status-badge ${escapeHtml(status.level)}">${escapeHtml(status.label)}</span>`;
}

// แปลงค่า confidence ของโมเดลเป็นเปอร์เซ็นต์
function formatConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return "-";
  return `${(confidence * 100).toFixed(1)}%`;
}

// แปลงโหมดการบันทึกภาพให้อ่านง่ายในหน้า admin
function formatCaptureMode(value) {
  if (value === "burst") return "Burst หลายเฟรม";
  if (value === "manual") return "กรอกเลขเอง";
  if (value === "single") return "ภาพเดี่ยว";
  return "-";
}

function formatSelectionReason(value) {
  if (value === "close_transition_choose_highest") {
    return "เลขกำลังเปลี่ยนหลัก จึงเลือกค่าที่เสถียรจากหลายเฟรม";
  }

  const reasons = {
    manual_reading: "กรอกเลขเอง",
    close_transition_choose_highest:
      "เลขกำลังเปลี่ยนใกล้กัน จึงเลือกค่ามิเตอร์ที่สูงกว่า",
    close_transition_stable_review:
      "เลขกำลังเปลี่ยนหลัก จึงเลือกค่าที่เสถียรจากหลายเฟรม",
    majority_confidence_median:
      "เลือกจากค่าที่พบซ้ำมากที่สุดและความมั่นใจของโมเดล",
    no_valid_prediction: "โมเดลอ่านเลขจากเฟรมไม่ได้",
    manual_selected_frame: "ผู้ดูแลเลือกเฟรมนี้เอง",
  };

  return reasons[value] || value || "-";
}

function uploadImageSrc(filename) {
  if (!filename) return "";
  return `/uploads/${encodeURIComponent(filename)}`;
}

// แสดงข้อมูลเฟรม burst เพื่อให้ admin เข้าใจว่าระบบเลือกเฟรมนี้เพราะอะไร
function renderFrameMetadataLegacy(reading) {
  const container = document.getElementById("reviewFrameMeta");
  if (!container) return;

  const frames = Array.isArray(reading.frames_summary) // อ่านสรุป frame จาก reading
    ? reading.frames_summary
    : []; // ถ้าไม่ใช่ array ให้ใช้ array ว่าง

  if (!reading.capture_mode && frames.length === 0) {
    container.innerHTML = `
      <div class="frame-meta-empty">
        ยังไม่มีข้อมูลการเลือกเฟรมสำหรับรายการนี้
      </div>
    `;
    return;
  }

  // แปลง selected_frame เป็นตัวเลข, ถ้าใช้ไม่ได้ให้ null
  const selectedFrame = Number.isInteger(Number(reading.selected_frame))
    ? Number(reading.selected_frame)
    : null;

  container.innerHTML = `
    <div class="frame-meta-header">
      <div>
        <span>ข้อมูลการอ่านจากกล้อง</span>
        <strong>${formatCaptureMode(reading.capture_mode)}</strong> <!-- capture mode เช่น burst/manual/single, จำนวน frame -->
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
        <dd>${escapeHtml(formatSelectionReason(reading.selection_reason))}</dd>
      </div>
      <div>
        <dt>Confidence</dt>
        <dd>${formatConfidence(reading.avg_conf)}</dd>
      </div>
    </dl>
    ${
      frames.length
        ? `<div class="frame-summary-list">
            ${frames
              .map(
                (frame) => ` // วนแสดงผลทุก frame ที่ถ่ายใน burst
              <div class="frame-summary-item ${frame.selected ? "selected" : ""}"> <!-- ถ้า frame นี้ถูกเลือก ให้เพิ่ม class selected -->
                <span>เฟรม ${Number(frame.index) + 1}</span> <!-- แสดงลำดับเฟรม โดยบวก 1 เพราะ index เริ่มจาก 0 -->
                <strong>${frame.reading_value ?? "-"} kWh</strong> <!-- แสดงค่ามิเตอร์ที่อ่านได้ ถ้าไม่มีให้แสดง - -->
                <small>${formatConfidence(frame.avg_conf)} · ${frame.boxes ?? "-"} กล่อง</small> <!-- แสดง confidence และจำนวนกล่องที่ YOLO ตรวจจับได้ -->
              </div>
            `,
              )
              .join("")}
          </div>`
        : ""
    }
  `;
}

// แปลงค่าจาก dropdown ให้เป็นเงื่อนไขกรองสถานะ
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
        <dd>${escapeHtml(formatSelectionReason(reading.selection_reason))}</dd>
      </div>
      <div>
        <dt>Confidence</dt>
        <dd>${formatConfidence(reading.avg_conf)}</dd>
      </div>
    </dl>
    ${
      frames.length
        ? `<div class="frame-summary-list burst-frame-gallery">
            ${frames
              .map((frame) => renderBurstFrameCard(reading, frame))
              .join("")}
          </div>`
        : ""
    }
  `;
}

function renderBurstFrameCard(reading, frame) {
  const frameIndex = Number(frame.index);
  const frameNumber = Number.isFinite(frameIndex) ? frameIndex + 1 : "-";
  const filename = frame.filename || "";
  const isSelected = Boolean(frame.selected);

  return `
    <div class="frame-summary-item burst-frame-card ${isSelected ? "selected" : ""}">
      <button
        class="burst-frame-thumb"
        type="button"
        onclick="previewBurstFrame('${escapeHtml(filename)}')"
        ${filename ? "" : "disabled"}
        aria-label="ดูเฟรม ${frameNumber}"
      >
        ${
          filename
            ? `<img src="${uploadImageSrc(filename)}" alt="Frame ${frameNumber}" loading="lazy" />`
            : `<span>ไม่มีรูป</span>`
        }
      </button>
      <div class="burst-frame-info">
        <div class="burst-frame-title">
          <span>เฟรม ${frameNumber}</span>
          ${isSelected ? `<b>เลือกอยู่</b>` : ""}
        </div>
        <strong>${frame.reading_value ?? "-"} kWh</strong>
        <small>${formatConfidence(frame.avg_conf)} / ${frame.boxes ?? "-"} boxes</small>
        <button
          class="btn btn-outline-primary btn-sm"
          type="button"
          onclick="selectBurstFrame(${Number(reading.id)}, ${frameIndex})"
          ${isSelected || !Number.isFinite(frameIndex) ? "disabled" : ""}
        >
          ใช้เฟรมนี้
        </button>
      </div>
    </div>
  `;
}

function previewBurstFrame(filename) {
  if (!filename) return;

  const image = document.getElementById("reviewReadingImage");
  const empty = document.getElementById("reviewImageEmpty");

  image.src = uploadImageSrc(filename);
  image.classList.remove("d-none");
  empty.classList.add("d-none");
}

async function selectBurstFrame(readingId, frameIndex) {
  const res = await fetch(`${API}/readings/${readingId}/selected-frame`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      frame_index: frameIndex,
    }),
  });

  const payload = await res.json();

  if (!res.ok) {
    return alert(payload.error || "Could not select burst frame");
  }

  await loadMeterReadings();
  openReadingEditor(readingId);
}

function matchesStatusFilter(status, filter) {
  if (!filter) return true;
  if (!status) return false;
  if (filter === "needs_review") return status.level !== "ok"; // ทุก reading ที่สถานะไม่ใช่ปกติ
  if (filter === "warn") return status.level === "warn"; // warning ทุกแบบ
  if (filter === "missing_image") return status.key === "missing_image"; // เฉพาะไม่มีรูป
  return status.level === filter || status.key === filter;
}

// แปลงวันที่เป็น key รูปแบบ YYYY-MM-DD สำหรับตัวกรองวันที่
function getDateKey(value) {
  if (!value) return "";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// แปลงวันที่เป็น key รูปแบบ YYYY-MM สำหรับตัวกรองเดือน
function getMonthKey(value) {
  if (!value) return "";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// แสดง month key ให้เป็นรูปแบบ MM/YYYY
function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${month}/${year}`;
}

// อัปเดตข้อความจำนวนผลลัพธ์หลังกรอง readings
function updateReadingResultCount(count, start = 0, end = 0) {
  const result = document.getElementById("readingResultCount");
  if (!result) return;

  // ถ้า filter แล้วไม่เจอ บอกว่าไม่พบ
  if (count === 0) {
    result.innerText = `ไม่พบรายการที่ตรงกับตัวกรอง จากทั้งหมด ${allReadings.length.toLocaleString("th-TH")} รายการ`;
    return;
  }

  // แสดงจำนวนรายการในหน้าปัจจุบัน เช่น 1-25 จาก 80
  result.innerText = `แสดง ${start.toLocaleString("th-TH")}-${end.toLocaleString("th-TH")} จาก ${count.toLocaleString("th-TH")} รายการที่ตรงกับตัวกรอง / ทั้งหมด ${allReadings.length.toLocaleString("th-TH")} รายการ`;
}

// แสดงปุ่ม pagination ถ้าจำนวนรายการมากกว่า page size
function renderReadingPagination(totalFiltered, totalPages, pageSize) {
  const container = document.getElementById("readingPagination");
  if (!container) return;

  if (totalFiltered <= pageSize) {
    container.innerHTML = "";
    return;
  }

  // ปุ่มก่อนหน้า/ถัดไป
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

// เปลี่ยนหน้ารายการ readings ไปก่อนหน้าหรือถัดไป
function changeReadingPage(direction) {
  currentReadingPage += direction;
  renderReadings(); // render ตารางใหม่
}

// ล้างเฉพาะตัวกรองสถานะ เพื่อกลับไปดู readings ทั้งหมด
function showAllMeterReadings() {
  const filterStatus = document.getElementById("filterStatus");
  if (filterStatus) filterStatus.value = "";

  currentReadingPage = 1;
  lastReadingFilterSignature = "";
  renderReadings();
}

// ล้างตัวกรอง readings ทั้งหมดกลับค่าเริ่มต้น
function resetReadingFilters() {
  const ids = ["searchHouse", "filterHouse", "filterMonth", "filterDate"];
  ids.forEach((id) => {
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

// เปิด modal ให้ admin เทียบรูปจริงกับเลข YOLO แล้วแก้ค่า reading ได้
function openReadingEditor(id) {
  const reading = allReadings.find((item) => Number(item.id) === Number(id)); // หา reading ที่ต้องการแก้
  if (!reading) return alert("ไม่พบรายการมิเตอร์นี้"); //  ถ้าไม่เจอ แจ้งเตือน

  editingReadingId = id; // จำว่า modal นี้กำลังแก้ reading id ไหน

  // ใส่ชื่อบ้าน เวลา และค่า reading ลง modal
  document.getElementById("reviewHouseName").innerText =
    reading.house_name || "-";
  document.getElementById("reviewReadingTime").innerText =
    `เวลาอ่านค่า: ${formatReadingTime(reading.reading_time)}`;
  document.getElementById("reviewReadingValue").value = Number(
    reading.reading_value || 0,
  );

  const image = document.getElementById("reviewReadingImage");
  const empty = document.getElementById("reviewImageEmpty");

  // ถ้ามีรูป แสดงรูป
  // ถ้าไม่มีรูป แสดงข้อความว่าไม่มีรูป
  if (reading.image_filename) {
    image.src = uploadImageSrc(reading.image_filename);
    image.classList.remove("d-none");
    empty.classList.add("d-none");
  } else {
    image.removeAttribute("src");
    image.classList.add("d-none");
    empty.classList.remove("d-none");
  }

  // แสดง metadata burst/manual/single
  // เปิด modal
  renderFrameMetadata(reading);
  document.getElementById("readingEditModal").classList.remove("d-none");
}

// ปิด modal แก้เลขมิเตอร์
function closeReadingEditor() {
  editingReadingId = null;
  document.getElementById("readingEditModal").classList.add("d-none");
}

// บันทึกเลขมิเตอร์ที่แก้แล้วกลับลง meter_readings
async function saveReadingValue() {
  const rawValue = document.getElementById("reviewReadingValue").value.trim();
  const value = Number(rawValue); // อ่านค่าใหม่จาก input

  if (!editingReadingId) return; // ถ้ายังไม่ได้เลือก reading หรือค่าไม่ถูกต้อง ให้หยุด
  // ตรวจว่าเป็นตัวเลขจริง และห้ามเป็นค่าติดลบ
  if (rawValue === "" || !Number.isFinite(value) || value < 0) {
    return alert("กรุณากรอกเลขมิเตอร์ให้ถูกต้อง");
  }

  // เรียก PUT /api/readings/:id
  // ส่งค่า reading ใหม่ไป backend
  const res = await fetch(`${API}/readings/${editingReadingId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reading_value: value,
    }),
  });

  const payload = await res.json();

  if (!res.ok) {
    return alert(payload.error || "แก้ไขเลขมิเตอร์ไม่สำเร็จ");
  }

  closeReadingEditor(); // ปิด modal
  await loadMeterReadings(); // โหลด readings ใหม่เพื่อให้ตารางอัปเดต
}

// ลบแถว reading ที่ admin เห็นว่าไม่ควรอยู่ในประวัติ
async function deleteReading(id) {
  const reading = allReadings.find((item) => Number(item.id) === Number(id)); // หา reading เพื่อแสดงรายละเอียดก่อนลบ
  const detail = reading
    ? `${reading.house_name || "-"} วันที่ ${formatReadingTime(reading.reading_time)} ค่า ${formatReadingValue(reading.reading_value)} kWh`
    : `รายการ id ${id}`;

  if (!confirm(`ต้องการลบข้อมูลมิเตอร์นี้หรือไม่?\n\n${detail}`)) return; //

  // เรียก DELETE /api/readings/:id
  await fetch(`${API}/readings/${id}`, {
    method: "DELETE",
  });

  loadMeterReadings(); // โหลด readings ใหม่
}

// ฟอร์มแก้ข้อมูลบ้านแบบง่ายผ่าน prompt
async function editHouse(id, name, owner, address, phone) {
  const house_name = prompt("ชื่อบ้าน", name); // แก้ข้อมูลบ้านผ่าน prompt
  if (!house_name) return; // ถ้าไม่กรอกชื่อบ้าน ให้หยุด

  const owner_name = prompt("ชื่อเจ้าของ", owner || "");
  const addr = prompt("ที่อยู่", address || "");
  const phone_no = prompt("เบอร์โทร", phone || "");

  // เรียก PUT /api/houses/:id
  await fetch(`${API}/houses/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      house_name,
      owner_name,
      address: addr,
      phone: phone_no,
    }),
  });

  loadHouses(); // โหลดบ้านใหม่
}
