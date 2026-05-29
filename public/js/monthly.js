let monthlyTrendChart; // เก็บกราฟ Chart.js ปัจจุบัน
let monthlyHistory = []; // เก็บข้อมูลรายเดือนของบ้านที่เลือก
let activeMetricIndex = 0; // บอกว่าตอนนี้แสดงกราฟตัวไหน เช่น หน่วยไฟ หรือ ค่าไฟ

/*
==============================
ตั้งค่ากราฟ
==============================
*/

// รวมค่าสีของกราฟไว้ที่เดียว
const chartPalette = {
  line: "#093C5D",
  fill: "rgba(111, 209, 215, 0.18)",
  point: "#5DF8D8",
  label: "#ffffff",
  labelBorder: "rgba(9, 60, 93, 0.18)",
  labelText: "#093C5D",
  axis: "#093C5D",
};

// กำหนดชนิดกราฟที่สลับได้, ตัวแรกใช้ usage_unit คือหน่วยไฟ, ตัวที่สองใช้ bill_amount คือค่าไฟเป็นบาท
const metricViews = [
  {
    eyebrow: "หน่วยไฟ",
    title: "กราฟหน่วยไฟรายเดือนของบ้านที่เลือก",
    valueKey: "usage_unit",
    datasetLabel: "หน่วยไฟที่ใช้",
    emptyText:
      "ยังไม่มีประวัติหน่วยไฟรายเดือน บ้านที่เลือกต้องมีข้อมูลอย่างน้อย 2 เดือน",
    formatter: formatShortUnits,
    tooltipFormatter: (value) => `หน่วยไฟ: ${formatUnits(value)}`,
  },
  {
    eyebrow: "ค่าไฟเป็นบาท",
    title: "กราฟค่าไฟรายเดือนของบ้านที่เลือก",
    valueKey: "bill_amount",
    datasetLabel: "ค่าไฟ (บาท)",
    emptyText:
      "ยังไม่มีประวัติค่าไฟรายเดือน บ้านที่เลือกต้องมีข้อมูลอย่างน้อย 2 เดือน",
    formatter: formatShortBaht,
    tooltipFormatter: (value) => `ค่าไฟ: ${formatBaht(value)}`,
  },
];

// สร้าง plugin ของ Chart.js สำหรับวาดป้ายตัวเลขบนจุดกราฟ
function makeValueLabelPlugin(id, formatter) {
  return {
    id,
    afterDatasetsDraw(chart) {
      const { ctx } = chart; // canvas context ใช้วาดเอง
      const dataset = chart.data.datasets[0]; //  คือข้อมูลกราฟ
      const meta = chart.getDatasetMeta(0); // คือข้อมูลตำแหน่งจุดบน canvas

      if (!dataset || !meta?.data?.length) return;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // วนทุกจุดกราฟ
      meta.data.forEach((point, index) => {
        const value = Number(dataset.data[index] || 0); //  อ่านค่าปัจจุบัน
        const previous =
          index > 0 ? Number(dataset.data[index - 1] || 0) : null; // อ่านค่าปัจจุบัน
        const diff = previous === null ? null : value - previous; // คำนวณส่วนต่างจากเดือนก่อน
        const x = point.x;
        const y = point.y - 46;
        const mainText = formatter(value);
        const diffText =
          diff === null ? "" : `${diff >= 0 ? "+" : ""}${formatter(diff)}`;
        const width = Math.max(
          ctx.measureText(mainText).width + 34,
          diffText ? ctx.measureText(diffText).width + 38 : 0,
          86,
        );
        const height = diff === null ? 38 : 54;

        // วาดกล่องโค้งและข้อความค่าบนจุดกราฟ, ถ้ามีเดือนก่อนหน้า จะวาดส่วนต่าง เช่น +120
        drawRoundRect(ctx, x - width / 2, y - height / 2, width, height, 7);
        ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = chartPalette.label;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.lineWidth = 1;
        ctx.strokeStyle = chartPalette.labelBorder;
        ctx.stroke();

        ctx.fillStyle = chartPalette.labelText;
        ctx.font = "800 14px Inter, sans-serif";
        ctx.fillText(mainText, x, y - (diff === null ? 0 : 9));

        if (diff !== null) {
          ctx.fillStyle = diff >= 0 ? "#3B7597" : "#00a889";
          ctx.font = "800 11px Inter, sans-serif";
          ctx.fillText(diffText, x, y + 13);
        }
      });

      ctx.restore();
    },
  };
}

// วาดกรอบสี่เหลี่ยมมุมโค้งบน canvas ใช้เป็นพื้นหลังป้ายตัวเลขกราฟ
function drawRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/*
==============================
ตัวช่วยจัดรูปแบบข้อความ
==============================
*/

// แปลงตัวเลขเป็นเงินบาทแบบเต็ม เช่น ฿1,234.00
function formatBaht(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  });
}

// แปลงค่าเงินบาทแบบสั้น ใช้บนป้ายกราฟ เช่น 1,648 kWh
function formatShortBaht(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

// แปลงหน่วยไฟพร้อมต่อท้าย kWh
function formatUnits(value) {
  return `${Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  })} kWh`;
}

// แปลงหน่วยไฟแบบสั้นสำหรับป้ายกราฟ
function formatShortUnits(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

// แปลงเลขมิเตอร์ให้ไม่มีทศนิยม
function formatMeter(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 0,
  });
}

// อ่านค่าไฟต่อหน่วยจาก input
function getRate() {
  return Number(document.getElementById("unitRate")?.value || 0);
}

/*
==============================
โหลดข้อมูลรายเดือน
==============================
*/

async function loadHouseOptions() {
  // โหลดบ้านที่เปิดใช้งานอยู่ เพื่อให้ผู้ใช้เลือกบ้านสำหรับดูกราฟ
  const houseSelect = document.getElementById("houseSelect");
  if (!houseSelect) return;

  const res = await fetch("http://localhost:3000/api/houses");
  const houses = await res.json();
  const savedHouse = localStorage.getItem("smart_meter_house_id");

  houseSelect.innerHTML = "";

  houses
    .filter((house) => house.is_active == 1)
    .forEach((house) =>
      houseSelect.add(new Option(house.house_name, house.id)),
    );

  if (
    // ถ้าบ้านที่เคยเลือกยังอยู่ใน dropdown ให้เลือกบ้านนั้นกลับมา
    savedHouse &&
    [...houseSelect.options].some((option) => option.value === savedHouse)
  ) {
    houseSelect.value = savedHouse;
  }
}

// ดึงข้อมูลหน่วยไฟ/ค่าไฟรายเดือน แล้วกรองเหลือเฉพาะบ้านที่เลือก
async function loadSelectedHouseHistory() {
  // อ่านบ้านที่เลือกและค่า rate
  const houseSelect = document.getElementById("houseSelect");
  const rate = getRate();

  if (!houseSelect?.value || !Number.isFinite(rate) || rate < 0) return;

  // จำบ้านและ rate ล่าสุดไว้ใน browser
  localStorage.setItem("smart_meter_house_id", houseSelect.value);
  localStorage.setItem("smart_meter_unit_rate", String(rate));

  // เรียก API เพื่อดึงข้อมูลบิลรายเดือนทั้งหมด โดยส่ง rate หรือราคาค่าไฟต่อหน่วยไปด้วย
  const res = await fetch(
    `http://localhost:3000/api/readings/monthly-bills?rate=${encodeURIComponent(rate)}`,
  );
  // เอาข้อมูล rows ที่ได้จาก API มากรองให้เหลือเฉพาะบ้านที่ผู้ใช้เลือกอยู่
  // ถ้า payload.rows ไม่มีค่า ให้ใช้ array ว่างแทน เพื่อป้องกัน error
  const payload = await res.json();
  monthlyHistory = (payload.rows || [])
    .filter((row) => String(row.house_id) === String(houseSelect.value))
    .slice(-12); // เอาแค่ 12 เดือนล่าสุดของบ้านที่เลือกมาแสดง

  const houseName = houseSelect.options[houseSelect.selectedIndex]?.text || "-"; // ดึงชื่อบ้าน/ห้องที่ผู้ใช้เลือกจาก dropdown
  const latest = monthlyHistory[monthlyHistory.length - 1]; // ดึงข้อมูลบิลเดือนล่าสุดจาก monthlyHistory

  document.getElementById("selectedHouseName").innerText = houseName; // แสดงชื่อบ้าน/ห้องที่ผู้ใช้เลือกในหน้าเว็บ
  document.getElementById("latestBill").innerText = latest //แสดงยอดค่าไฟล่าสุด ถ้าไม่มีแสดง "-"
    ? formatBaht(latest.bill_amount)
    : "-";
  document.getElementById("latestUnits").innerText = latest // แสดงจำนวนหน่วยไฟล่าสุด ถ้าไม่มีแสดง "-"
    ? formatUnits(latest.usage_unit)
    : "-";

  renderMeterReadingList(); // render รายการเลขมิเตอร์รายเดือน
  renderActiveMetricChart(); // render กราฟตาม metric ที่เลือกอยู่
}

/*
==============================
การแสดงผลรายเดือน
==============================
*/

function renderMeterReadingList() {
  // แสดงแต่ละเดือนในรูปแบบ เลขเดือนนี้ - เลขเดือนก่อน = หน่วยที่ใช้
  const list = document.getElementById("meterReadingList");
  if (!list) return;

  if (!monthlyHistory.length) {
    list.innerHTML = `<p class="empty-note mb-0">ยังไม่มีเลขมิเตอร์สะสมสำหรับบ้านที่เลือก</p>`; // ถ้าไม่มีประวัติรายเดือน แสดงข้อความว่าง
    return;
  }

  // วนข้อมูล monthlyHistory แล้วแปลงข้อมูลแต่ละเดือนให้เป็น HTML
  list.innerHTML = monthlyHistory
    .map(
      (row) => `
        <article class="meter-reading-item">
          <div>
            <!-- แสดงเดือน เช่น 05/2026 -->
            <span>${row.month}</span>
            <!-- แสดงเลขมิเตอร์ของเดือนปัจจุบัน -->
            <!-- ถ้ามี current_reading ให้ใช้ current_reading ถ้าไม่มีให้ใช้ end_reading แทน -->
            <strong>${formatMeter(row.current_reading ?? row.end_reading)}</strong>
          </div>
          <p>
            <!-- เลขมิเตอร์เดือนปัจจุบัน -->
            ${formatMeter(row.current_reading ?? row.end_reading)}
            <span>-</span>
            <!-- เลขมิเตอร์เดือนก่อนหน้า -->
            <!-- ถ้ามี previous_reading ให้ใช้ previous_reading ถ้าไม่มีให้ใช้ start_reading แทน -->
            ${formatMeter(row.previous_reading ?? row.start_reading)}
            <span>=</span>
            <!-- หน่วยไฟที่ใช้ในเดือนนั้น -->
            <b>${formatUnits(row.usage_unit)}</b>
          </p>
        </article>
      `,
    )
    .join("");
}

// เลื่อนไปดู metric ก่อนหน้า เช่น จากค่าไฟกลับไปหน่วยไฟ
function showPreviousMetric() {
  activeMetricIndex =
    (activeMetricIndex - 1 + metricViews.length) % metricViews.length;
  renderActiveMetricChart();
}

// เลื่อนไปดู metric ถัดไป เช่น จากหน่วยไฟไปค่าไฟ
function showNextMetric() {
  activeMetricIndex = (activeMetricIndex + 1) % metricViews.length;
  renderActiveMetricChart();
}

// สลับระหว่างกราฟหน่วยไฟกับกราฟยอดค่าไฟ
function renderActiveMetricChart() {
  const config = metricViews[activeMetricIndex];

  // อัปเดตหัวข้อกราฟ, อัปเดตตัวนับ เช่น 1 / 2
  document.getElementById("monthlyTrendEyebrow").innerText = config.eyebrow;
  document.getElementById("monthlyTrendTitle").innerText = config.title;
  document.getElementById("monthlyTrendCounter").innerText =
    `${activeMetricIndex + 1} / ${metricViews.length}`;

  // วาดกราฟเส้นตาม config ที่เลือก
  // ถ้ามีกราฟเดิมอยู่ จะส่ง existingChart เข้าไปเพื่อให้ renderLineChart จัดการอัปเดต/ลบกราฟเดิม
  monthlyTrendChart = renderLineChart({
    existingChart: monthlyTrendChart, // กราฟเดิมที่เคยสร้างไว้
    canvasId: "monthlyTrendChart", // id ของ canvas ที่ใช้วาดกราฟ
    emptyId: "monthlyTrendEmpty", // id ของ element ที่ใช้แสดงข้อความเมื่อไม่มีข้อมูล
    data: monthlyHistory, // ข้อมูลรายเดือนของบ้านที่เลือก
    valueKey: config.valueKey, // ชื่อ field ที่จะเอามาวาดกราฟ เช่น usage_unit หรือ bill_amount
    datasetLabel: config.datasetLabel, // ชื่อชุดข้อมูลในกราฟ
    emptyText: config.emptyText, // ข้อความที่แสดงเมื่อไม่มีข้อมูล
    formatter: config.formatter, // ฟังก์ชันจัดรูปแบบค่าบนกราฟ
    tooltipFormatter: config.tooltipFormatter, // ฟังก์ชันจัดรูปแบบค่าตอนเอาเมาส์ชี้ tooltip
  });
}

// วาดกราฟเส้นด้วย Chart.js จากข้อมูล monthlyHistory
function renderLineChart(config) {
  // หา canvas และ element ข้อความว่าง
  // ถ้าไม่มี canvas ก็คืน chart เดิม
  const canvas = document.getElementById(config.canvasId);
  const emptyMessage = document.getElementById(config.emptyId);
  if (!canvas) return config.existingChart;

  if (config.existingChart) config.existingChart.destroy(); // ทำลายกราฟเก่าก่อนสร้างใหม่

  if (!Array.isArray(config.data) || config.data.length === 0) {
    // ถ้าไม่มีข้อมูล ให้แสดงข้อความว่างและไม่สร้างกราฟ
    if (emptyMessage) emptyMessage.innerText = config.emptyText;
    return null;
  }

  if (emptyMessage) emptyMessage.innerText = "";

  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: config.data.map((row) => row.month),
      datasets: [
        {
          label: config.datasetLabel,
          data: config.data.map((row) => Number(row[config.valueKey] || 0)),
          borderColor: chartPalette.line,
          backgroundColor: chartPalette.fill,
          pointBackgroundColor: chartPalette.point,
          pointBorderColor: chartPalette.line,
          pointBorderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointHitRadius: 14,
          borderWidth: 3,
          tension: 0.42,
          cubicInterpolationMode: "monotone",
          fill: true,
        },
      ],
    },
    plugins: [
      makeValueLabelPlugin(`${config.canvasId}Labels`, config.formatter), // เพิ่ม plugin วาดป้ายตัวเลขบนจุดกราฟ formatter หน่วยไฟหรือบาท
    ],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 62, right: 20, bottom: 10, left: 10 } },
      plugins: {
        legend: {
          align: "end",
          labels: {
            color: "#17212f",
            boxWidth: 12,
            boxHeight: 12,
            useBorderRadius: true,
            borderRadius: 4,
            padding: 18,
            font: { weight: "800" },
          },
        },
        tooltip: {
          // ตั้ง tooltip ให้แสดงข้อความตามกราฟปัจจุบัน
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          titleColor: "#17212f",
          bodyColor: "#344054",
          borderColor: "rgba(217, 226, 236, 0.95)",
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => config.tooltipFormatter(context.parsed.y),
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: {
            color: "#344054",
            padding: 10,
            font: { size: 13, weight: "800" },
          },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: "rgba(148, 163, 184, 0.18)" },
          ticks: {
            color: chartPalette.axis,
            padding: 10,
            font: { size: 14, weight: "800" },
            callback: (value) => Number(value).toLocaleString("th-TH"),
          },
        },
      },
    },
  });
}

/*
==============================
ตั้งค่าเริ่มต้นของหน้า
==============================
*/

async function initMonthlyPage() {
  // จุดเริ่มต้นของหน้า: โหลดบ้าน/ประวัติ แล้วผูกปุ่มเลื่อนกราฟ
  const savedRate = localStorage.getItem("smart_meter_unit_rate"); // ดึงค่าไฟต่อหน่วยที่เคยบันทึกไว้ใน browser
  // ดึง element ที่ใช้กรอกค่าไฟต่อหน่วยและเลือกบ้าน
  const rateInput = document.getElementById("unitRate");
  const houseSelect = document.getElementById("houseSelect");

  if (savedRate && rateInput) rateInput.value = savedRate; // ถ้ามีค่าไฟเดิม ให้แสดงกลับมาในช่อง input

  await loadHouseOptions(); // โหลดรายการบ้านก่อน เพื่อให้ dropdown พร้อมใช้งาน
  await loadSelectedHouseHistory(); // โหลดประวัติของบ้านที่เลือก เพื่อนำไปแสดงในกราฟหรือตาราง

  // ถ้าเปลี่ยนบ้านหรือค่า rate ให้โหลดข้อมูลใหม่
  houseSelect?.addEventListener("change", loadSelectedHouseHistory);
  rateInput?.addEventListener("change", loadSelectedHouseHistory);
  // ผูกปุ่มสลับกราฟก่อนหน้า/ถัดไป
  document
    .getElementById("prevChartBtn")
    ?.addEventListener("click", showPreviousMetric);
  document
    .getElementById("nextChartBtn")
    ?.addEventListener("click", showNextMetric);
}

initMonthlyPage().catch((err) =>
  console.error("Error loading monthly page:", err),
);
