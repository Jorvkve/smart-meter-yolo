let latestBillData = null; // เก็บผลคำนวณบิลล่าสุดจาก /bill-range
let billHistoryRows = []; //  เก็บประวัติบิลทั้งหมดที่โหลดมา
let selectedHistoryBillId = null; // เก็บ id บิลที่ user เปิดใน modal

/*
==============================
ตัวช่วยจัดรูปแบบข้อความ
==============================
*/

// แปลงตัวเลขเป็นรูปแบบเงินบาท เช่น ฿38.98
function formatBaht(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  });
}

// แปลงตัวเลขเงินให้มีทศนิยมตามค่าที่ส่งมา แต่ไม่ใส่สัญลักษณ์บาท
function formatPlainBaht(value) {
  const text = String(value ?? "").trim();
  if (!text) return "0";

  const normalized = text.replaceAll(",", "");

  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const [integerPart, decimalPart] = normalized.split(".");
    const integerText = Number(integerPart || 0).toLocaleString("th-TH");

    return decimalPart === undefined
      ? integerText
      : `${integerText}.${decimalPart}`;
  }

  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 10,
  });
}

// แปลงจำนวนหน่วยไฟให้อ่านง่ายและต่อท้าย kWh
function formatUnits(value) {
  return `${Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 4,
  })} kWh`;
}

// แปลงเลขมิเตอร์สะสมให้อ่านง่าย
function formatMeter(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

// แปลงค่าจาก database/string ให้เป็น Date object
function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
    return new Date(text.replace(" ", "T"));
  }

  return new Date(text);
}

// แสดงวันที่แบบไทย เช่น 20 พ.ค. 2569
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

// แสดงวันที่และเวลาแบบไทย
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

// เพิ่มจำนวนวันให้วันที่ ใช้คำนวณวันครบกำหนดชำระ
function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

// ป้องกันไม่ให้ข้อความจาก user/database ถูกตีความเป็น HTML ตอนใส่ innerHTML
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// อ่านค่าไฟต่อหน่วยจาก input
function getRateText() {
  return document.getElementById("unitRate")?.value.trim() || "0";
}

// อ่านค่าไฟต่อหน่วยจาก input
function getRate() {
  return Number(getRateText());
}

// อ่าน label ที่ผู้ใช้เลือกจาก select เช่น ชื่อบ้านหรือชื่อเดือน
function getSelectedLabel(selectElement) {
  return selectElement.options[selectElement.selectedIndex]?.text || "-";
}

/*
==============================
สถานะการคำนวณบิล
==============================
*/

// เปิด/ปิดปุ่มสร้างบิล ปุ่มจะเปิดเมื่อมีผลคำนวณที่ใช้ได้
function setGenerateButtonState(enabled) {
  const button = document.getElementById("generateBillBtn");
  if (button) button.disabled = !enabled;
}

// ซ่อนส่วน preview บิลเมื่อข้อมูลคำนวณเปลี่ยน
function hideBillPreview() {
  document.getElementById("billPreviewSection")?.classList.add("d-none");
  document.getElementById("billDocument").innerHTML = "";
}

// แสดงข้อความช่วยบอกสถานะในพื้นที่สูตรคำนวณ
function showCalculationMessage(message) {
  const container = document.getElementById("billFormulaList");
  if (container) {
    container.innerHTML = `<p class="empty-note">${escapeHtml(message)}</p>`;
  }
}

// รีเซ็ตกล่องสรุปและข้อความสูตรกลับสู่สถานะเริ่มต้น
function resetCalculationView() {
  document.getElementById("totalBill").innerText = "-";
  document.getElementById("totalUnits").innerText = "-";
  document.getElementById("selectedRange").innerText = "-";
  showCalculationMessage(
    "เลือกบ้านและช่วงเดือน แล้วกดคำนวณเพื่อดูสูตรของบ้านที่เลือก",
  );
}

// ทำเครื่องหมายว่าผลคำนวณเดิมใช้ไม่ได้แล้ว เมื่อผู้ใช้เปลี่ยนบ้าน/เดือน/rate
function markCalculationDirty() {
  latestBillData = null;
  setGenerateButtonState(false);
  hideBillPreview();
  resetCalculationView();
}

/*
==============================
โหลดข้อมูลสำหรับฟอร์ม
==============================
*/

async function loadHouseOptions() {
  // โหลดบ้านที่เปิดใช้งานอยู่มาใส่ dropdown เลือกบ้าน
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

// โหลดเฉพาะเดือนที่บ้านที่เลือกมีข้อมูลอ่านมิเตอร์
async function loadReadingMonths() {
  const houseSelect = document.getElementById("houseSelect");
  const startSelect = document.getElementById("startMonth");
  const endSelect = document.getElementById("endMonth");

  // ถ้ายังไม่เลือกบ้าน ให้ dropdown เดือนบอกว่าเลือกบ้านก่อน
  if (!houseSelect.value) {
    startSelect.innerHTML = `<option value="">โปรดเลือกบ้าน</option>`;
    endSelect.innerHTML = `<option value="">โปรดเลือกบ้าน</option>`;
    return;
  }

  // เรียก API ดึงเดือนที่บ้านนี้มี readings
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

  // เติมเดือนลงทั้ง start month และ end month
  months.forEach((month) => {
    startSelect.add(new Option(month.label, month.value));
    endSelect.add(new Option(month.label, month.value));
  });
}

/*
==============================
การคำนวณบิล
==============================
*/

async function calculateBill() {
  // อ่านค่าจากฟอร์ม เรียก API bill-range แล้วนำผลลัพธ์มาแสดงบนหน้าเว็บ
  const houseSelect = document.getElementById("houseSelect");
  const startSelect = document.getElementById("startMonth");
  const endSelect = document.getElementById("endMonth");
  const rateText = getRateText();
  const rate = getRate();

  // ก่อนคำนวณใหม่ ล้างผลเดิมและปิดปุ่มสร้างบิล
  latestBillData = null;
  setGenerateButtonState(false);
  hideBillPreview();

  // ตรวจว่าเลือกบ้านแล้ว
  // เลือกเดือนครบแล้ว
  // เดือนต้นทางกับปลายทางต้องไม่ใช่เดือนเดียวกัน
  if (!houseSelect.value) return alert("กรุณาเลือกบ้าน");
  if (!startSelect.value || !endSelect.value)
    return alert("ยังไม่มีเดือนให้เลือก");
  if (startSelect.value === endSelect.value)
    return alert("กรุณาเลือกเดือนต้นทางและเดือนปลายทางคนละเดือน");
  if (startSelect.value > endSelect.value) {
    showCalculationMessage(
      "เดือนปลายทางต้องใหม่กว่าเดือนต้นทาง เพราะมิเตอร์เป็นเลขสะสม", // กันเลือกเดือนปลายทางก่อนเดือนต้นทาง
    );
    return;
  }
  if (!Number.isFinite(rate) || rate < 0)
    // ตรวจ rate ต้องเป็นเลขและไม่ติดลบ
    return alert("กรุณากรอกค่าไฟต่อหน่วยให้ถูกต้อง");

  // จำบ้าน เดือน start/end และ rate ล่าสุดไว้ใน browser
  localStorage.setItem("smart_meter_house_id", houseSelect.value);
  localStorage.setItem("smart_meter_start_month", startSelect.value);
  localStorage.setItem("smart_meter_end_month", endSelect.value);
  localStorage.setItem("smart_meter_unit_rate", rateText);

  // เรียก API /api/readings/bill-range
  // ให้ backend คำนวณบิลจากเลขมิเตอร์ต้นทาง/ปลายทาง
  const params = new URLSearchParams({
    house_id: houseSelect.value,
    start: startSelect.value,
    end: endSelect.value,
    rate: rateText,
  });

  const res = await fetch(`/api/readings/bill-range?${params}`);
  const payload = await res.json();

  if (!res.ok) {
    return alert(payload.error || "ไม่สามารถคำนวณค่าไฟได้");
  }

  // เก็บผลคำนวณล่าสุดไว้
  // เก็บ label สำหรับแสดงผล
  // เก็บเวลาที่คำนวณ
  const rows = payload.rows || [];
  const labels = {
    house: getSelectedLabel(houseSelect),
    start: getSelectedLabel(startSelect),
    end: getSelectedLabel(endSelect),
  };

  latestBillData = {
    ...payload,
    rate: rateText,
    rows,
    labels,
    calculatedAt: new Date().toISOString(),
  };

  updateSummary(rows, labels);
  renderFormulaList(rows, rateText);
  setGenerateButtonState(rows.length > 0);
}

// แสดงยอดเงินรวม หน่วยไฟรวม และรอบบิลที่เลือกในกล่องสรุปด้านบน
function updateSummary(data, labels) {
  const totalBill = data.reduce(
    (sum, row) => sum + Number(row.bill_amount || 0),
    0,
  );
  const totalUnits = data.reduce(
    (sum, row) => sum + Number(row.usage_unit || 0),
    0,
  );

  // อัปเดต card สรุปด้านบน, แสดงยอดรวม หน่วยรวม และบ้าน/ช่วงเดือน
  document.getElementById("totalBill").innerText = formatBaht(totalBill);
  document.getElementById("totalUnits").innerText = formatUnits(totalUnits);
  document.getElementById("selectedRange").innerText =
    `${labels.house}: ${labels.start} - ${labels.end}`;
}

// แสดงสูตรของแต่ละบิล: เลขปลายทาง - เลขต้นทาง = หน่วยที่ใช้
function renderFormulaList(data, rate) {
  const container = document.getElementById("billFormulaList");

  if (data.length === 0) {
    container.innerHTML = `<p class="empty-note">บ้านที่เลือกยังไม่มีข้อมูลครบทั้งสองเดือนนี้</p>`; // ถ้าไม่มีข้อมูลครบทั้งสองเดือน แสดงข้อความว่าไม่มีข้อมูล
    return;
  }

  container.innerHTML = data
    .map((row) => {
      const usage = Number(row.usage_unit || 0); // อ่านหน่วยที่ใช้และยอดค่าไฟจาก row
      const bill = Number(row.bill_amount || 0);

      return `
      <div class="formula-card">
        <div>
          <h3>${escapeHtml(row.house_name)}</h3>
          <!-- เลขปลายทาง - เลขต้นทาง = หน่วยที่ใช้ -->
          <p>${formatMeter(row.end_reading)} - ${formatMeter(row.start_reading)} = <strong>${formatUnits(usage)}</strong></p>
        </div>
        <div class="formula-expression">
          <!-- หน่วยที่ใช้ x ค่าไฟต่อหน่วย = ค่าไฟ -->
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

/*
==============================
การสร้างบิล
==============================
*/

function makeBillNumber(data, issuedDate) {
  // สร้างเลขบิลไม่ให้ซ้ำ โดยใช้เวลาออกบิล บ้าน และรอบบิล
  const ymd = issuedDate.toISOString().slice(0, 10).replaceAll("-", "");
  const hms = issuedDate.toTimeString().slice(0, 8).replaceAll(":", "");
  const start = String(data.start || "").replaceAll("-", "");
  const end = String(data.end || "").replaceAll("-", "");

  return `SM-${ymd}${hms}-H${data.house_id}-${start}-${end}`;
}

// บันทึกบิลที่ยืนยันแล้วลงตาราง electric_bills
async function saveBillHistory(row, billNo, issueDate, dueDate, total) {
  const payload = {
    // สร้าง object สำหรับส่งข้อมูลบิลไปบันทึกในฐานข้อมูล
    bill_no: billNo, // เลขที่บิล
    house_id: row.house_id, // รหัสบ้านของรายการนี้
    start_month: latestBillData.start, // เดือนเริ่มต้นของรอบบิล
    end_month: latestBillData.end, // เดือนสิ้นสุดของรอบบิล
    start_reading: row.start_reading, // เลขมิเตอร์เริ่มต้น
    end_reading: row.end_reading, // เลขมิเตอร์สิ้นสุด
    usage_unit: row.usage_unit, // จำนวนหน่วยไฟที่ใช้
    unit_rate: latestBillData.rate, // อัตราค่าไฟต่อหน่วย
    total_amount: total, // ยอดค่าไฟรวมทั้งหมด
    start_reading_time: row.start_reading_time, // วันที่/เวลาที่อ่านเลขมิเตอร์เริ่มต้น
    end_reading_time: row.end_reading_time, // วันที่/เวลาที่อ่านเลขมิเตอร์สิ้นสุด
    issue_date: issueDate.toISOString(), // วันที่ออกบิล แปลงเป็นรูปแบบ ISO string
    due_date: dueDate.toISOString(), // วันครบกำหนดชำระ แปลงเป็นรูปแบบ ISO string
  };

  // ส่ง POST ไปบันทึกประวัติบิล
  const res = await fetch("/api/readings/bill-history", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.error || "ไม่สามารถบันทึกประวัติบิลได้"); // ถ้า backend ส่ง error ให้ throw เพื่อไป catch ใน generateBill
  }

  return result;
}

// สร้างหน้าตาบิลสำหรับพิมพ์ จากผลคำนวณใหม่หรือจากประวัติบิล
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
  const isCancelled = getBillStatus(row) === "cancelled"; // ถ้าบิลถูกยกเลิก จะขึ้น banner ว่า Cancelled
  const billDocument = document.getElementById("billDocument");

  billDocument.innerHTML = `
    <article class="electric-bill">
      ${
        isCancelled
          ? `<div class="bill-cancelled-banner">Cancelled bill${row.cancelled_at ? ` on ${formatThaiDateTime(row.cancelled_at)}` : ""}</div>`
          : ""
      }
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

  document.getElementById("billPreviewSection").classList.remove("d-none"); // แสดง preview บิล
  document
    .getElementById("billPreviewSection")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

// ยืนยันผลคำนวณปัจจุบันให้เป็นบิลจริง แล้วบันทึกเข้าประวัติ
async function generateBill() {
  // กันไม่ให้สร้างบิลถ้ายังไม่ได้คำนวณ
  if (!latestBillData || latestBillData.rows.length === 0) {
    alert("กรุณาคำนวณค่าไฟก่อนสร้างบิล");
    return;
  }

  const row = latestBillData.rows[0]; // ดึงข้อมูลรายการค่าไฟแถวแรกมาใช้สร้างบิล
  const issueDate = new Date(); // กำหนดวันที่ออกบิลเป็นวันที่ปัจจุบัน
  const dueDate = addDays(issueDate, 7); // กำหนดวันครบกำหนดชำระเป็นอีก 7 วันหลังออกบิล
  const total = Number(row.bill_amount || 0); // แปลงยอดค่าไฟรวมเป็นตัวเลข ถ้าไม่มีค่าให้ใช้ 0
  const billNo = makeBillNumber(latestBillData, issueDate); // สร้างเลขที่บิลจากข้อมูลรอบบิลและวันที่ออกบิล

  try {
    const saved = await saveBillHistory(row, billNo, issueDate, dueDate, total); // บันทึกข้อมูลบิลลงประวัติในฐานข้อมูล
    latestBillData.savedBillId = saved.id; // เก็บ id ของบิลที่บันทึกสำเร็จไว้ในตัวแปรล่าสุด
    latestBillData.billNo = billNo; // เก็บเลขที่บิลไว้ในข้อมูลล่าสุด
    renderBillDocument(row, billNo, issueDate, dueDate, total, saved.id); // แสดงเอกสาร/ใบแจ้งหนี้บนหน้าเว็บ
    await loadBillHistory(); // โหลดประวัติบิลใหม่ เพื่ออัปเดตตารางประวัติ
  } catch (err) {
    console.error(err); // แสดง error ใน console สำหรับตรวจสอบปัญหา
    alert(err.message || "ไม่สามารถสร้างบิลได้"); // แจ้งผู้ใช้เมื่อสร้างบิลไม่สำเร็จ
  }
}

// สั่งพิมพ์บิลที่สร้างหรือเปิดจากประวัติอยู่ในขณะนั้น
function printBill() {
  // ถ้ายังไม่มี bill number แปลว่ายังไม่มีบิลจริงให้พิมพ์
  if (!latestBillData?.billNo) {
    alert("กรุณาสร้างบิลก่อนพิมพ์");
    return;
  }

  // เปลี่ยน title ชั่วคราว
  // เวลา print/save PDF ชื่อไฟล์จะอิง title นี้ได้
  const oldTitle = document.title;
  document.title = `บิลค่าไฟ-${latestBillData.billNo}`;
  // เพิ่ม event ที่จะทำงานหลังจากสั่งพิมพ์เสร็จ
  window.addEventListener(
    "afterprint", // event หลังจากหน้าต่าง print ทำงานเสร็จ
    () => {
      document.title = oldTitle; // เปลี่ยน title กลับเป็นชื่อเดิม
    },
    { once: true }, // ให้ event นี้ทำงานแค่ครั้งเดียว แล้วลบตัวเองออก
  );
  window.print(); // เปิดหน้าต่าง Print ของ browser เพื่อพิมพ์หรือบันทึกเป็น PDF
}

/*
==============================
ประวัติบิล
==============================
*/

async function loadBillHistory() {
  // โหลดบิลที่เคยบันทึกไว้ เพื่อให้ดูย้อนหลัง กรอง พิมพ์ซ้ำ หรือยกเลิกได้
  const container = document.getElementById("billHistoryList");

  if (!container) return;

  const res = await fetch("/api/readings/bill-history"); // โหลดประวัติบิลจาก backend
  const rows = await res.json();
  billHistoryRows = Array.isArray(rows) ? rows : []; // เก็บลง billHistoryRows

  if (!res.ok) {
    container.innerHTML = `<p class="empty-note">ไม่สามารถโหลดประวัติบิลได้</p>`; // ถ้าโหลดไม่สำเร็จ แสดงข้อความ error
    return;
  }

  populateHistoryHouseFilter(); // เติม dropdown filter บ้าน
  renderBillHistoryRows(); // render ตารางประวัติบิล
}

// สร้างตัวกรองบ้านจากบ้านที่มีอยู่ในประวัติบิล
function populateHistoryHouseFilter() {
  const filter = document.getElementById("historyHouseFilter");

  if (!filter) return;

  const currentValue = filter.value;
  const houses = new Map(); // สร้าง Map ของบ้านที่มีในประวัติบิล

  billHistoryRows.forEach((row) => {
    houses.set(String(row.house_id), row.house_name); // key = house_id, value = house_name , map ช่วยกันบ้านซ้ำ
  });

  filter.innerHTML = `<option value="">ทุกบ้าน</option>`; // เติม option ทุกบ้านก่อน

  // เรียงบ้านตาม id, เพิ่มบ้านลง filter
  [...houses.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([houseId, houseName]) => {
      filter.add(new Option(houseName, houseId));
    });

  if ([...filter.options].some((option) => option.value === currentValue)) {
    filter.value = currentValue;
  }
}

// กรองประวัติบิลจากคำค้นหา บ้าน เดือนปลายทาง และสถานะ
function getFilteredBillHistoryRows() {
  // ค้นหาเลขบิล
  const searchText = document
    .getElementById("historySearchInput")
    ?.value.trim()
    .toLowerCase();
  const houseId = document.getElementById("historyHouseFilter")?.value; // กรองบ้าน
  const month = document.getElementById("historyMonthFilter")?.value; // กรองเดือน
  const status = document.getElementById("historyStatusFilter")?.value; // กรองสถานะ active/cancelled

  // คืนเฉพาะบิลที่ตรงทุกเงื่อนไข
  return billHistoryRows.filter((row) => {
    const matchesSearch =
      !searchText ||
      String(row.bill_no || "")
        .toLowerCase()
        .includes(searchText);
    const matchesHouse = !houseId || String(row.house_id) === String(houseId);
    const matchesMonth = !month || row.end_month === month;
    const matchesStatus = !status || getBillStatus(row) === status;

    return matchesSearch && matchesHouse && matchesMonth && matchesStatus;
  });
}

// แสดงตารางประวัติบิลหลังจากผ่านตัวกรองแล้ว
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
            <th>Status</th>
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
                  <td>${formatBillStatusBadge(row)}</td>
                  <td>
                    <!-- ปุ่มนี้เก็บ id ของบิลไว้ใน data-history-id เวลา click จะเอา id ไปเปิด modal รายละเอียด -->
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

// รวม start_month และ end_month ให้เป็นข้อความรอบบิล
function formatBillPeriod(row) {
  return `${row.start_month} - ${row.end_month}`;
}

// บิลเก่าบางรายการอาจไม่มี status จึงถือว่าเป็น active
function getBillStatus(row) {
  return row.status === "cancelled" ? "cancelled" : "active"; // ถ้า status เป็น cancelled ให้คืน cancelled อย่างอื่นถือเป็น active
}

// สร้าง badge แสดงสถานะ Active/Cancelled ในตารางและ modal
function formatBillStatusBadge(row) {
  const status = getBillStatus(row);
  const label = status === "cancelled" ? "Cancelled" : "Active";

  return `<span class="bill-status-badge ${status}">${label}</span>`;
}

// หา bill history จาก id ที่ผู้ใช้กดในตาราง
function getHistoryBillById(historyId) {
  return billHistoryRows.find((item) => String(item.id) === String(historyId));
}

// ล้างตัวกรองประวัติบิลทั้งหมดแล้ว render ตารางใหม่
function clearHistoryFilters() {
  const searchInput = document.getElementById("historySearchInput");
  const houseFilter = document.getElementById("historyHouseFilter");
  const monthFilter = document.getElementById("historyMonthFilter");
  const statusFilter = document.getElementById("historyStatusFilter");

  if (searchInput) searchInput.value = "";
  if (houseFilter) houseFilter.value = "";
  if (monthFilter) monthFilter.value = "";
  if (statusFilter) statusFilter.value = "";

  renderBillHistoryRows();
}

// เปิดบิลจากประวัติขึ้นมาในพื้นที่ preview เพื่อดูหรือพิมพ์ซ้ำ
function showBillFromHistory(historyId) {
  const row = getHistoryBillById(historyId);

  if (!row) {
    alert("ไม่พบประวัติบิลนี้");
    return;
  }

  const issueDate = parseDateValue(row.issue_date); // แปลงวันที่ออกบิลจากข้อมูลเดิมให้เป็น Date object
  const dueDate = parseDateValue(row.due_date); // แปลงวันครบกำหนดชำระให้เป็น Date object
  const total = Number(row.total_amount || 0); // แปลงยอดรวมเป็นตัวเลข ถ้าไม่มีค่าให้ใช้ 0
  // สร้าง object สำหรับเก็บ label รอบบิล
  const labels = {
    start: row.start_month, // เดือนเริ่มต้นของรอบบิล
    end: row.end_month, // เดือนสิ้นสุดของรอบบิล
  };

  // อัปเดตข้อมูลบิลล่าสุดให้กลายเป็นบิลจากประวัติ
  latestBillData = {
    billNo: row.bill_no, // เลขที่บิลจากประวัติ
    savedBillId: row.id, // id ของบิลที่บันทึกไว้ในฐานข้อมูล
    rate: row.unit_rate, // อัตราค่าไฟต่อหน่วยของบิลนี้
    labels, // ข้อมูลเดือนเริ่มต้นและสิ้นสุดของรอบบิล
    rows: [row], // เก็บข้อมูลบิลเป็น array เพื่อให้ใช้รูปแบบเดียวกับข้อมูลที่คำนวณใหม่
  };

  // แสดงเอกสารบิลในพื้นที่ preview
  renderBillDocument(
    row, // ข้อมูลบิลที่เลือกจากประวัติ
    row.bill_no, // เลขที่บิล
    issueDate, // วันที่ออกบิล
    dueDate, // วันครบกำหนดชำระ
    total, // ยอดรวมค่าไฟ
    row.id, // id ของบิล
    labels, // label รอบบิล เช่น เดือนเริ่มต้น-สิ้นสุด
  );
}

// เปิด modal รายละเอียดบิล พร้อมปุ่มดูบิลหรือยกเลิกบิล
function openBillHistoryDetail(historyId) {
  const row = getHistoryBillById(historyId);

  if (!row) {
    alert("ไม่พบประวัติบิลนี้");
    return;
  }

  // จำว่าตอนนี้ modal เปิดบิล id ไหนอยู่, ใช้กับปุ่ม “ดูใบแจ้งค่าไฟ” และ “Cancel bill”
  selectedHistoryBillId = row.id;
  const isCancelled = getBillStatus(row) === "cancelled"; // เช็คว่าบิลนี้ยกเลิกแล้วหรือยัง
  // ใส่หัวข้อของ modal รายละเอียดบิล
  document.getElementById("billHistoryDetailTitle").textContent =
    formatBillPeriod(row);
  // ใส่เนื้อหารายละเอียดบิลลงใน modal
  // มียอดชำระ เลขบิล บ้าน วันที่ออกบิล วันครบกำหนด เลขมิเตอร์ หน่วย rate
  // ถ้ายกเลิกแล้ว จะแสดง cancelled_at และ cancel_reason
  document.getElementById("billHistoryDetailBody").innerHTML = `
    <div class="bill-history-detail-total">
      <span>ยอดชำระ</span>
      <strong>${formatBaht(row.total_amount)}</strong>
      ${formatBillStatusBadge(row)}
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
      ${
        isCancelled
          ? `
            <div>
              <dt>Cancelled at</dt>
              <dd>${formatThaiDateTime(row.cancelled_at)}</dd>
            </div>
            <div>
              <dt>Cancel reason</dt>
              <dd>${escapeHtml(row.cancel_reason || "-")}</dd>
            </div>
          `
          : ""
      }
    </dl>
  `;
  const cancelButton = document.getElementById("detailCancelBillBtn"); // ดึงปุ่มยกเลิกบิลใน modal
  cancelButton.disabled = isCancelled; // ถ้าบิลถูกยกเลิกแล้ว ให้ปิดการกดปุ่ม
  cancelButton.classList.toggle("d-none", isCancelled); // ถ้าบิลถูกยกเลิกแล้ว ให้ซ่อนปุ่ม Cancel bill
  document.getElementById("billHistoryDetailModal").classList.remove("d-none");
}

// ปิด modal รายละเอียดบิลและล้าง id ที่เลือกอยู่
function closeBillHistoryDetail() {
  selectedHistoryBillId = null;
  document.getElementById("billHistoryDetailModal").classList.add("d-none");
}

// ดูบิลจากรายการที่เลือกใน modal รายละเอียด
function viewSelectedHistoryBill() {
  // ถ้าไม่มีบิลที่เลือก หรือบิลถูกยกเลิกแล้ว ให้หยุด
  if (!selectedHistoryBillId) return;
  showBillFromHistory(selectedHistoryBillId);
  closeBillHistoryDetail();
}

// เปลี่ยนสถานะบิลเป็นยกเลิก โดยไม่ลบข้อมูลอ่านมิเตอร์ต้นทาง
async function cancelSelectedHistoryBill() {
  if (!selectedHistoryBillId) return;

  const row = getHistoryBillById(selectedHistoryBillId);
  if (!row || getBillStatus(row) === "cancelled") return;

  // ถามเหตุผลการยกเลิก
  const reason = window.prompt(
    "Reason for cancelling this bill (optional):",
    "",
  );

  // ถ้า cancel ใน prompt ให้หยุด
  if (reason === null) return;

  // confirm อีกครั้งก่อนยกเลิก
  const confirmed = window.confirm(
    "Cancel this bill? Meter readings will not be deleted.",
  );

  if (!confirmed) return;

  // ส่ง PATCH ไป backend เพื่อเปลี่ยนสถานะบิลเป็น cancelled
  const res = await fetch(`/api/readings/bill-history/${row.id}/cancel`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  const result = await res.json();

  if (!res.ok) {
    alert(result.error || "Cannot cancel bill");
    return;
  }

  await loadBillHistory(); // โหลดประวัติใหม่หลัง cancel
  openBillHistoryDetail(row.id); // เปิด modal ของบิลเดิมอีกครั้ง เพื่อเห็น status ใหม่
}

/*
==============================
ตั้งค่าเริ่มต้นของหน้า
==============================
*/

async function initBillingPage() {
  // จุดเริ่มต้นของหน้า: โหลดข้อมูลตั้งต้นและผูก event ปุ่ม/ตัวเลือกต่าง ๆ
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
    markCalculationDirty(); // เปลี่ยนบ้านแล้วผลคำนวณเดิมใช้ไม่ได้
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
    .getElementById("historyStatusFilter")
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
  document
    .getElementById("detailCancelBillBtn")
    .addEventListener("click", cancelSelectedHistoryBill);
}

initBillingPage().catch((err) =>
  console.error("Error loading billing page:", err),
);
