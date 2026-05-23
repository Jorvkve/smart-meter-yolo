let latestBillData = null;
let billHistoryRows = [];
let selectedHistoryBillId = null;

function formatBaht(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  });
}

function formatPlainBaht(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUnits(value) {
  return `${Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} kWh`;
}

function formatMeter(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
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

function formatThaiDate(value) {
  if (!value) return "-";
  const date = parseDateValue(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatThaiDateTime(value) {
  if (!value) return "-";
  const date = parseDateValue(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRate() {
  return Number(document.getElementById("unitRate")?.value || 0);
}

function getSelectedLabel(selectElement) {
  return selectElement.options[selectElement.selectedIndex]?.text || "-";
}

function setGenerateButtonState(enabled) {
  const button = document.getElementById("generateBillBtn");
  if (button) button.disabled = !enabled;
}

function hideBillPreview() {
  document.getElementById("billPreviewSection")?.classList.add("d-none");
  document.getElementById("billDocument").innerHTML = "";
}

function showCalculationMessage(message) {
  const container = document.getElementById("billFormulaList");
  if (container)
    container.innerHTML = `<p class="empty-note">${escapeHtml(message)}</p>`;
}

function resetCalculationView() {
  document.getElementById("totalBill").innerText = "-";
  document.getElementById("totalUnits").innerText = "-";
  document.getElementById("selectedRange").innerText = "-";
  showCalculationMessage(
    "เลือกบ้านและช่วงเดือน แล้วกดคำนวณเพื่อดูสูตรของบ้านที่เลือก",
  );
}

function markCalculationDirty() {
  latestBillData = null;
  setGenerateButtonState(false);
  hideBillPreview();
  resetCalculationView();
}

async function loadHouseOptions() {
  const houseSelect = document.getElementById("houseSelect");
  const res = await fetch("/api/houses");
  const houses = await res.json();

  houseSelect.innerHTML = `<option value="">เลือกบ้าน</option>`;

  houses
    .filter((house) => house.is_active == 1)
    .forEach((house) =>
      houseSelect.add(new Option(house.house_name, house.id)),
    );
}

async function loadReadingMonths() {
  const houseSelect = document.getElementById("houseSelect");
  const startSelect = document.getElementById("startMonth");
  const endSelect = document.getElementById("endMonth");

  if (!houseSelect.value) {
    startSelect.innerHTML = `<option value="">โปรดเลือกบ้าน</option>`;
    endSelect.innerHTML = `<option value="">โปรดเลือกบ้าน</option>`;
    return;
  }

  const params = new URLSearchParams({ house_id: houseSelect.value });
  const res = await fetch(`/api/readings/reading-months?${params}`);
  const months = await res.json();

  startSelect.innerHTML = "";
  endSelect.innerHTML = "";

  if (months.length === 0) {
    startSelect.add(new Option("ไม่มีข้อมูล", ""));
    endSelect.add(new Option("ไม่มีข้อมูล", ""));
    return;
  }

  startSelect.add(new Option("เลือกเดือนต้นทาง", ""));
  endSelect.add(new Option("เลือกเดือนปลายทาง", ""));

  months.forEach((month) => {
    startSelect.add(new Option(month.label, month.value));
    endSelect.add(new Option(month.label, month.value));
  });
}

async function calculateBill() {
  const houseSelect = document.getElementById("houseSelect");
  const startSelect = document.getElementById("startMonth");
  const endSelect = document.getElementById("endMonth");
  const rate = getRate();

  latestBillData = null;
  setGenerateButtonState(false);
  hideBillPreview();

  if (!houseSelect.value) return alert("กรุณาเลือกบ้าน");
  if (!startSelect.value || !endSelect.value)
    return alert("ยังไม่มีเดือนให้เลือก");
  if (startSelect.value === endSelect.value)
    return alert("กรุณาเลือกเดือนต้นทางและเดือนปลายทางคนละเดือน");
  if (startSelect.value > endSelect.value) {
    showCalculationMessage(
      "เดือนปลายทางต้องใหม่กว่าเดือนต้นทาง เพราะมิเตอร์เป็นเลขสะสม",
    );
    return;
  }
  if (!Number.isFinite(rate) || rate < 0)
    return alert("กรุณากรอกค่าไฟต่อหน่วยให้ถูกต้อง");

  localStorage.setItem("smart_meter_house_id", houseSelect.value);
  localStorage.setItem("smart_meter_start_month", startSelect.value);
  localStorage.setItem("smart_meter_end_month", endSelect.value);
  localStorage.setItem("smart_meter_unit_rate", String(rate));

  const params = new URLSearchParams({
    house_id: houseSelect.value,
    start: startSelect.value,
    end: endSelect.value,
    rate: String(rate),
  });

  const res = await fetch(`/api/readings/bill-range?${params}`);
  const payload = await res.json();

  if (!res.ok) return alert(payload.error || "ไม่สามารถคำนวณค่าไฟได้");

  const rows = payload.rows || [];
  const labels = {
    house: getSelectedLabel(houseSelect),
    start: getSelectedLabel(startSelect),
    end: getSelectedLabel(endSelect),
  };

  latestBillData = {
    ...payload,
    rows,
    labels,
    calculatedAt: new Date().toISOString(),
  };

  updateSummary(rows, labels);
  renderFormulaList(rows, rate);
  setGenerateButtonState(rows.length > 0);
}

function updateSummary(data, labels) {
  const totalBill = data.reduce(
    (sum, row) => sum + Number(row.bill_amount || 0),
    0,
  );
  const totalUnits = data.reduce(
    (sum, row) => sum + Number(row.usage_unit || 0),
    0,
  );

  document.getElementById("totalBill").innerText = formatBaht(totalBill);
  document.getElementById("totalUnits").innerText = formatUnits(totalUnits);
  document.getElementById("selectedRange").innerText =
    `${labels.house}: ${labels.start} - ${labels.end}`;
}

function renderFormulaList(data, rate) {
  const container = document.getElementById("billFormulaList");

  if (data.length === 0) {
    container.innerHTML = `<p class="empty-note">บ้านที่เลือกยังไม่มีข้อมูลครบทั้งสองเดือนนี้</p>`;
    return;
  }

  container.innerHTML = data
    .map((row) => {
      const usage = Number(row.usage_unit || 0);
      const bill = Number(row.bill_amount || 0);

      return `
      <div class="formula-card">
        <div>
          <h3>${escapeHtml(row.house_name)}</h3>
          <p>${formatMeter(row.end_reading)} - ${formatMeter(row.start_reading)} = <strong>${formatUnits(usage)}</strong></p>
        </div>
        <div class="formula-expression">
          <span>${formatUnits(usage)}</span>
          <span>x</span>
          <span>${formatPlainBaht(rate)} บาท</span>
          <span>=</span>
          <strong>${formatBaht(bill)}</strong>
        </div>
      </div>
    `;
    })
    .join("");
}

function makeBillNumber(data, issuedDate) {
  const ymd = issuedDate.toISOString().slice(0, 10).replaceAll("-", "");
  const hms = issuedDate.toTimeString().slice(0, 8).replaceAll(":", "");
  const start = String(data.start || "").replaceAll("-", "");
  const end = String(data.end || "").replaceAll("-", "");

  return `SM-${ymd}${hms}-H${data.house_id}-${start}-${end}`;
}

async function saveBillHistory(row, billNo, issueDate, dueDate, total) {
  const payload = {
    bill_no: billNo,
    house_id: row.house_id,
    start_month: latestBillData.start,
    end_month: latestBillData.end,
    start_reading: row.start_reading,
    end_reading: row.end_reading,
    usage_unit: row.usage_unit,
    unit_rate: latestBillData.rate,
    total_amount: total,
    start_reading_time: row.start_reading_time,
    end_reading_time: row.end_reading_time,
    issue_date: issueDate.toISOString(),
    due_date: dueDate.toISOString(),
  };

  const res = await fetch("/api/readings/bill-history", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.error || "ไม่สามารถบันทึกประวัติบิลได้");
  }

  return result;
}

function renderBillDocument(
  row,
  billNo,
  issueDate,
  dueDate,
  total,
  historyId,
  labels,
) {
  const usage = Number(row.usage_unit || 0);
  const rate = Number(row.unit_rate ?? latestBillData?.rate ?? 0);
  const billLabels = labels ||
    latestBillData?.labels || {
      start: row.start_month || "-",
      end: row.end_month || "-",
    };
  const billDocument = document.getElementById("billDocument");

  billDocument.innerHTML = `
    <article class="electric-bill">
      <header class="bill-header">
        <div>
          <p class="bill-kicker">Dorm Electricity Bill</p>
          <h2>ใบแจ้งค่าไฟฟ้า</h2>
          <p class="bill-muted">เลขที่บิล ${escapeHtml(billNo)}</p>
          ${historyId ? `<p class="bill-muted">รหัสประวัติ #${escapeHtml(historyId)}</p>` : ""}
        </div>
        <div class="bill-status">
          <span>ยอดชำระ</span>
          <strong>${formatBaht(total)}</strong>
        </div>
      </header>

      <section class="bill-info-grid">
        <div>
          <span>บ้าน</span>
          <strong>${escapeHtml(row.house_name)}</strong>
          <p>รหัสบ้าน: ${escapeHtml(row.house_id)}</p>
        </div>
        <div>
          <span>รอบบิล</span>
          <strong>${escapeHtml(billLabels.start)} - ${escapeHtml(billLabels.end)}</strong>
          <p>อ่านมิเตอร์ ${formatThaiDate(row.start_reading_time)} ถึง ${formatThaiDate(row.end_reading_time)}</p>
        </div>
        <div>
          <span>วันที่ออกบิล</span>
          <strong>${formatThaiDate(issueDate)}</strong>
          <p>ครบกำหนดชำระ ${formatThaiDate(dueDate)}</p>
        </div>
      </section>

      <section class="bill-meter-grid">
        <div>
          <span>เลขมิเตอร์ต้นทาง</span>
          <strong>${formatMeter(row.start_reading)}</strong>
          <p>${formatThaiDateTime(row.start_reading_time)}</p>
        </div>
        <div>
          <span>เลขมิเตอร์ปลายทาง</span>
          <strong>${formatMeter(row.end_reading)}</strong>
          <p>${formatThaiDateTime(row.end_reading_time)}</p>
        </div>
        <div>
          <span>หน่วยที่ใช้</span>
          <strong>${formatUnits(usage)}</strong>
          <p>${formatMeter(row.end_reading)} - ${formatMeter(row.start_reading)}</p>
        </div>
      </section>

      <table class="bill-table">
        <thead>
          <tr>
            <th>รายการ</th>
            <th>จำนวนหน่วย</th>
            <th>อัตรา</th>
            <th>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>ค่าไฟฟ้าตามหน่วยที่ใช้</td>
            <td>${formatUnits(usage)}</td>
            <td>${formatPlainBaht(rate)} บาท/หน่วย</td>
            <td>${formatBaht(total)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">ยอดรวมที่ต้องชำระ</td>
            <td>${formatBaht(total)}</td>
          </tr>
        </tfoot>
      </table>

      <section class="bill-note">
        <strong>หมายเหตุ</strong>
        <p>บิลนี้เป็นรูปแบบสำหรับหอพัก คำนวณจากเลขมิเตอร์สะสม โดยนำเลขมิเตอร์ปลายทางลบเลขมิเตอร์ต้นทางแล้วคูณบาทต่อหน่วยที่กำหนด ไม่มีการคิดค่าธรรมเนียม ภาษี หรือค่า Ft เพิ่มในระบบนี้</p>
      </section>
    </article>
  `;

  document.getElementById("billPreviewSection").classList.remove("d-none");
  document
    .getElementById("billPreviewSection")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

async function generateBill() {
  if (!latestBillData || latestBillData.rows.length === 0) {
    alert("กรุณาคำนวณค่าไฟก่อนสร้างบิล");
    return;
  }

  const row = latestBillData.rows[0];
  const issueDate = new Date();
  const dueDate = addDays(issueDate, 7);
  const total = Number(row.bill_amount || 0);
  const billNo = makeBillNumber(latestBillData, issueDate);

  try {
    const saved = await saveBillHistory(row, billNo, issueDate, dueDate, total);
    latestBillData.savedBillId = saved.id;
    latestBillData.billNo = billNo;
    renderBillDocument(row, billNo, issueDate, dueDate, total, saved.id);
    await loadBillHistory();
  } catch (err) {
    console.error(err);
    alert(err.message || "ไม่สามารถสร้างบิลได้");
  }
}

function printBill() {
  if (!latestBillData?.billNo) {
    alert("กรุณาสร้างบิลก่อนพิมพ์");
    return;
  }

  const oldTitle = document.title;
  document.title = `บิลค่าไฟ-${latestBillData.billNo}`;
  window.addEventListener(
    "afterprint",
    () => {
      document.title = oldTitle;
    },
    { once: true },
  );
  window.print();
}

async function loadBillHistory() {
  const container = document.getElementById("billHistoryList");

  if (!container) return;

  const res = await fetch("/api/readings/bill-history");
  const rows = await res.json();
  billHistoryRows = Array.isArray(rows) ? rows : [];

  if (!res.ok) {
    container.innerHTML = `<p class="empty-note">ไม่สามารถโหลดประวัติบิลได้</p>`;
    return;
  }

  populateHistoryHouseFilter();
  renderBillHistoryRows();
}

function populateHistoryHouseFilter() {
  const filter = document.getElementById("historyHouseFilter");

  if (!filter) return;

  const currentValue = filter.value;
  const houses = new Map();

  billHistoryRows.forEach((row) => {
    houses.set(String(row.house_id), row.house_name);
  });

  filter.innerHTML = `<option value="">ทุกบ้าน</option>`;

  [...houses.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([houseId, houseName]) => {
      filter.add(new Option(houseName, houseId));
    });

  if ([...filter.options].some((option) => option.value === currentValue)) {
    filter.value = currentValue;
  }
}

function getFilteredBillHistoryRows() {
  const searchText = document
    .getElementById("historySearchInput")
    ?.value.trim()
    .toLowerCase();
  const houseId = document.getElementById("historyHouseFilter")?.value;
  const month = document.getElementById("historyMonthFilter")?.value;

  return billHistoryRows.filter((row) => {
    const matchesSearch =
      !searchText ||
      String(row.bill_no || "")
        .toLowerCase()
        .includes(searchText);
    const matchesHouse = !houseId || String(row.house_id) === String(houseId);
    const matchesMonth =
      !month || row.start_month === month || row.end_month === month;

    return matchesSearch && matchesHouse && matchesMonth;
  });
}

function renderBillHistoryRows() {
  const container = document.getElementById("billHistoryList");

  if (!container) return;

  if (billHistoryRows.length === 0) {
    container.innerHTML = `<p class="empty-note">ยังไม่มีประวัติบิล</p>`;
    return;
  }

  const filteredRows = getFilteredBillHistoryRows();

  if (filteredRows.length === 0) {
    container.innerHTML = `<p class="empty-note">ไม่พบประวัติบิลที่ตรงกับตัวกรอง</p>`;
    return;
  }

  container.innerHTML = `
    <div class="bill-history-table-wrap">
      <table class="table data-table bill-history-table">
        <thead>
          <tr>
            <th>รอบบิล</th>
            <th>บ้าน</th>
            <th>หน่วย</th>
            <th>ยอดชำระ</th>
            <th>สร้างเมื่อ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${filteredRows
            .map(
              (row) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(formatBillPeriod(row))}</strong>
                    <span class="bill-history-subtext">${escapeHtml(row.bill_no)}</span>
                  </td>
                  <td>${escapeHtml(row.house_name)}</td>
                  <td>${formatUnits(row.usage_unit)}</td>
                  <td><strong>${formatBaht(row.total_amount)}</strong></td>
                  <td>${formatThaiDateTime(row.created_at)}</td>
                  <td>
                    <button class="btn btn-primary btn-sm open-history-detail-btn" data-history-id="${escapeHtml(row.id)}">
                      รายละเอียด
                    </button>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatBillPeriod(row) {
  return `${row.start_month} - ${row.end_month}`;
}

function getHistoryBillById(historyId) {
  return billHistoryRows.find((item) => String(item.id) === String(historyId));
}

function clearHistoryFilters() {
  const searchInput = document.getElementById("historySearchInput");
  const houseFilter = document.getElementById("historyHouseFilter");
  const monthFilter = document.getElementById("historyMonthFilter");

  if (searchInput) searchInput.value = "";
  if (houseFilter) houseFilter.value = "";
  if (monthFilter) monthFilter.value = "";

  renderBillHistoryRows();
}

function showBillFromHistory(historyId) {
  const row = getHistoryBillById(historyId);

  if (!row) {
    alert("ไม่พบประวัติบิลนี้");
    return;
  }

  const issueDate = parseDateValue(row.issue_date);
  const dueDate = parseDateValue(row.due_date);
  const total = Number(row.total_amount || 0);
  const labels = {
    start: row.start_month,
    end: row.end_month,
  };

  latestBillData = {
    billNo: row.bill_no,
    savedBillId: row.id,
    rate: row.unit_rate,
    labels,
    rows: [row],
  };

  renderBillDocument(
    row,
    row.bill_no,
    issueDate,
    dueDate,
    total,
    row.id,
    labels,
  );
}

function openBillHistoryDetail(historyId) {
  const row = getHistoryBillById(historyId);

  if (!row) {
    alert("ไม่พบประวัติบิลนี้");
    return;
  }

  selectedHistoryBillId = row.id;
  document.getElementById("billHistoryDetailTitle").textContent =
    formatBillPeriod(row);
  document.getElementById("billHistoryDetailBody").innerHTML = `
    <div class="bill-history-detail-total">
      <span>ยอดชำระ</span>
      <strong>${formatBaht(row.total_amount)}</strong>
    </div>
    <dl class="bill-history-detail-list">
      <div>
        <dt>เลขที่บิล</dt>
        <dd>${escapeHtml(row.bill_no)}</dd>
      </div>
      <div>
        <dt>บ้าน</dt>
        <dd>${escapeHtml(row.house_name)}</dd>
      </div>
      <div>
        <dt>วันที่ออกบิล</dt>
        <dd>${formatThaiDate(row.issue_date)}</dd>
      </div>
      <div>
        <dt>ครบกำหนด</dt>
        <dd>${formatThaiDate(row.due_date)}</dd>
      </div>
      <div>
        <dt>เลขมิเตอร์ต้นทาง</dt>
        <dd>${formatMeter(row.start_reading)}</dd>
      </div>
      <div>
        <dt>เลขมิเตอร์ปลายทาง</dt>
        <dd>${formatMeter(row.end_reading)}</dd>
      </div>
      <div>
        <dt>หน่วยที่ใช้</dt>
        <dd>${formatUnits(row.usage_unit)}</dd>
      </div>
      <div>
        <dt>อัตรา</dt>
        <dd>${formatPlainBaht(row.unit_rate)} บาท/หน่วย</dd>
      </div>
    </dl>
  `;
  document.getElementById("billHistoryDetailModal").classList.remove("d-none");
}

function closeBillHistoryDetail() {
  selectedHistoryBillId = null;
  document.getElementById("billHistoryDetailModal").classList.add("d-none");
}

function viewSelectedHistoryBill() {
  if (!selectedHistoryBillId) return;
  showBillFromHistory(selectedHistoryBillId);
  closeBillHistoryDetail();
}

async function initBillingPage() {
  const savedRate = localStorage.getItem("smart_meter_unit_rate");
  const rateInput = document.getElementById("unitRate");
  const houseSelect = document.getElementById("houseSelect");
  const startSelect = document.getElementById("startMonth");
  const endSelect = document.getElementById("endMonth");

  if (savedRate && rateInput) rateInput.value = savedRate;

  await loadHouseOptions();
  await loadReadingMonths();
  resetCalculationView();
  await loadBillHistory();

  houseSelect.addEventListener("change", async () => {
    await loadReadingMonths();
    markCalculationDirty();
  });
  startSelect.addEventListener("change", markCalculationDirty);
  endSelect.addEventListener("change", markCalculationDirty);
  rateInput.addEventListener("input", markCalculationDirty);
  document
    .getElementById("calculateBillBtn")
    .addEventListener("click", calculateBill);
  document
    .getElementById("generateBillBtn")
    .addEventListener("click", generateBill);
  document.getElementById("printBillBtn").addEventListener("click", printBill);
  document
    .getElementById("refreshHistoryBtn")
    .addEventListener("click", loadBillHistory);
  document
    .getElementById("historySearchInput")
    .addEventListener("input", renderBillHistoryRows);
  document
    .getElementById("historyHouseFilter")
    .addEventListener("change", renderBillHistoryRows);
  document
    .getElementById("historyMonthFilter")
    .addEventListener("change", renderBillHistoryRows);
  document
    .getElementById("clearHistoryFilterBtn")
    .addEventListener("click", clearHistoryFilters);
  document
    .getElementById("billHistoryList")
    .addEventListener("click", (event) => {
      const button = event.target.closest(".open-history-detail-btn");
      if (button) openBillHistoryDetail(button.dataset.historyId);
    });
  document
    .getElementById("detailViewBillBtn")
    .addEventListener("click", viewSelectedHistoryBill);
}

initBillingPage().catch((err) =>
  console.error("Error loading billing page:", err),
);
