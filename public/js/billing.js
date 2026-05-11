let latestBillData = null;

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
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatThaiDate(value) {
  if (!value) return "-";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

function markCalculationDirty() {
  latestBillData = null;
  setGenerateButtonState(false);
  hideBillPreview();
}

async function loadHouseOptions() {
  const houseSelect = document.getElementById("houseSelect");
  const res = await fetch("http://localhost:3000/api/houses");
  const houses = await res.json();
  const savedHouse = localStorage.getItem("smart_meter_house_id");

  houseSelect.innerHTML = "";

  houses
    .filter(house => house.is_active == 1)
    .forEach(house => houseSelect.add(new Option(house.house_name, house.id)));

  if (savedHouse && [...houseSelect.options].some(option => option.value === savedHouse)) {
    houseSelect.value = savedHouse;
  }
}

async function loadReadingMonths() {
  const houseSelect = document.getElementById("houseSelect");
  const startSelect = document.getElementById("startMonth");
  const endSelect = document.getElementById("endMonth");
  const params = new URLSearchParams({ house_id: houseSelect.value });
  const res = await fetch(`http://localhost:3000/api/readings/reading-months?${params}`);
  const months = await res.json();

  startSelect.innerHTML = "";
  endSelect.innerHTML = "";

  if (months.length === 0) {
    startSelect.add(new Option("ไม่มีข้อมูล", ""));
    endSelect.add(new Option("ไม่มีข้อมูล", ""));
    return;
  }

  months.forEach(month => {
    startSelect.add(new Option(month.label, month.value));
    endSelect.add(new Option(month.label, month.value));
  });

  const savedStart = localStorage.getItem("smart_meter_start_month");
  const savedEnd = localStorage.getItem("smart_meter_end_month");

  startSelect.value = savedStart && months.some(month => month.value === savedStart)
    ? savedStart
    : months[Math.max(months.length - 2, 0)].value;

  endSelect.value = savedEnd && months.some(month => month.value === savedEnd)
    ? savedEnd
    : months[months.length - 1].value;
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
  if (!startSelect.value || !endSelect.value) return alert("ยังไม่มีเดือนให้เลือก");
  if (startSelect.value === endSelect.value) return alert("กรุณาเลือกเดือนต้นทางและเดือนปลายทางคนละเดือน");
  if (startSelect.value > endSelect.value) return alert("เดือนปลายทางต้องใหม่กว่าเดือนต้นทาง เพราะมิเตอร์เป็นเลขสะสม");
  if (!Number.isFinite(rate) || rate < 0) return alert("กรุณากรอกค่าไฟต่อหน่วยให้ถูกต้อง");

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

  const res = await fetch(`http://localhost:3000/api/readings/bill-range?${params}`);
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
  const totalBill = data.reduce((sum, row) => sum + Number(row.bill_amount || 0), 0);
  const totalUnits = data.reduce((sum, row) => sum + Number(row.usage_unit || 0), 0);

  document.getElementById("totalBill").innerText = formatBaht(totalBill);
  document.getElementById("totalUnits").innerText = formatUnits(totalUnits);
  document.getElementById("selectedRange").innerText = `${labels.house}: ${labels.start} - ${labels.end}`;
}

function renderFormulaList(data, rate) {
  const container = document.getElementById("billFormulaList");

  if (data.length === 0) {
    container.innerHTML = `<p class="empty-note">บ้านที่เลือกยังไม่มีข้อมูลครบทั้งสองเดือนนี้</p>`;
    return;
  }

  container.innerHTML = data.map(row => {
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
  }).join("");
}

function makeBillNumber(data) {
  const issuedDate = new Date();
  const ymd = issuedDate.toISOString().slice(0, 10).replaceAll("-", "");
  const start = String(data.start || "").replaceAll("-", "");
  const end = String(data.end || "").replaceAll("-", "");

  return `SM-${ymd}-H${data.house_id}-${start}-${end}`;
}

function generateBill() {
  if (!latestBillData || latestBillData.rows.length === 0) {
    alert("กรุณาคำนวณค่าไฟก่อนสร้างบิล");
    return;
  }

  const row = latestBillData.rows[0];
  const issueDate = new Date();
  const dueDate = addDays(issueDate, 7);
  const usage = Number(row.usage_unit || 0);
  const rate = Number(latestBillData.rate || 0);
  const subtotal = Number(row.bill_amount || 0);
  const total = subtotal;
  const billNo = makeBillNumber(latestBillData);
  const billDocument = document.getElementById("billDocument");

  billDocument.innerHTML = `
    <article class="electric-bill">
      <header class="bill-header">
        <div>
          <p class="bill-kicker">Smart Meter Electricity Bill</p>
          <h2>ใบแจ้งค่าไฟฟ้า</h2>
          <p class="bill-muted">เลขที่บิล ${escapeHtml(billNo)}</p>
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
          <strong>${escapeHtml(latestBillData.labels.start)} - ${escapeHtml(latestBillData.labels.end)}</strong>
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
          <p>${formatThaiDate(row.start_reading_time)}</p>
        </div>
        <div>
          <span>เลขมิเตอร์ปลายทาง</span>
          <strong>${formatMeter(row.end_reading)}</strong>
          <p>${formatThaiDate(row.end_reading_time)}</p>
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
            <td>ค่าพลังงานไฟฟ้าตามหน่วยที่ใช้</td>
            <td>${formatUnits(usage)}</td>
            <td>${formatPlainBaht(rate)} บาท/หน่วย</td>
            <td>${formatBaht(subtotal)}</td>
          </tr>
          <tr>
            <td>ค่าธรรมเนียม/ภาษีเพิ่มเติม</td>
            <td>-</td>
            <td>-</td>
            <td>${formatBaht(0)}</td>
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
        <p>บิลนี้คำนวณจากเลขมิเตอร์สะสม โดยนำเลขมิเตอร์ปลายทางลบเลขมิเตอร์ต้นทางแล้วคูณอัตราค่าไฟต่อหน่วยที่กรอกไว้ ยังไม่รวมโครงสร้างค่าไฟจริง เช่น Ft, ค่าบริการรายเดือน หรือภาษีมูลค่าเพิ่ม หากต้องการใช้จริงสามารถเพิ่มรายการเหล่านี้ในขั้นถัดไปได้</p>
      </section>
    </article>
  `;

  document.getElementById("billPreviewSection").classList.remove("d-none");
  document.getElementById("billPreviewSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function printBill() {
  if (!latestBillData) {
    alert("กรุณาสร้างบิลก่อนพิมพ์");
    return;
  }

  const oldTitle = document.title;
  document.title = `บิลค่าไฟ-${makeBillNumber(latestBillData)}`;
  window.addEventListener("afterprint", () => {
    document.title = oldTitle;
  }, { once: true });
  window.print();
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
  await calculateBill();

  houseSelect.addEventListener("change", async () => {
    await loadReadingMonths();
    await calculateBill();
  });
  startSelect.addEventListener("change", markCalculationDirty);
  endSelect.addEventListener("change", markCalculationDirty);
  rateInput.addEventListener("input", markCalculationDirty);
  document.getElementById("calculateBillBtn").addEventListener("click", calculateBill);
  document.getElementById("generateBillBtn").addEventListener("click", generateBill);
  document.getElementById("printBillBtn").addEventListener("click", printBill);
}

initBillingPage().catch(err => console.error("Error loading billing page:", err));
