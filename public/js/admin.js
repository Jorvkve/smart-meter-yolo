const API = "http://localhost:3000/api";

let allReadings = [];
let allHouses = [];
let editingReadingId = null;
const HIGH_USAGE_WARNING = 2000;

window.addEventListener("load", async () => {
  await loadHouses();
  await loadMeterReadings();
});

function formatReadingTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
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
  const filterStatus = document.getElementById("filterStatus")?.value || "";
  const sort = document.getElementById("sortType")?.value || "latest";
  const statusMap = buildReadingStatusMap(allReadings);

  let data = allReadings.filter(r =>
    String(r.house_name || "").toLowerCase().includes(keyword)
    && (!filterHouse || String(r.house_id) === filterHouse)
    && (!filterMonth || getMonthKey(r.reading_time) === filterMonth)
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

  table.innerHTML = "";

  if (data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">ไม่พบข้อมูลการอ่านค่า</td>
      </tr>
    `;
    updateReadingResultCount(0);
    return;
  }

  data.forEach(reading => {
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

  updateReadingResultCount(data.length);
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

function matchesStatusFilter(status, filter) {
  if (!filter) return true;
  if (!status) return false;
  if (filter === "warn") return status.level === "warn";
  if (filter === "missing_image") return status.key === "missing_image";
  return status.level === filter || status.key === filter;
}

function getMonthKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${month}/${year}`;
}

function updateReadingResultCount(count) {
  const result = document.getElementById("readingResultCount");
  if (result) result.innerText = `แสดง ${count.toLocaleString("th-TH")} รายการ จากทั้งหมด ${allReadings.length.toLocaleString("th-TH")} รายการ`;
}

function resetReadingFilters() {
  const ids = ["searchHouse", "filterHouse", "filterMonth", "filterStatus"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const sortType = document.getElementById("sortType");
  if (sortType) sortType.value = "latest";

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
