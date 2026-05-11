let selectedBillChart;
let selectedUsageChart;

const chartPalette = {
  line: "#093C5D",
  fill: "rgba(111, 209, 215, 0.18)",
  point: "#5DF8D8",
  label: "#ffffff",
  labelBorder: "rgba(9, 60, 93, 0.18)",
  labelText: "#093C5D",
  axis: "#093C5D",
};

function makeValueLabelPlugin(id, formatter) {
  return {
    id,
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const dataset = chart.data.datasets[0];
      const meta = chart.getDatasetMeta(0);

      if (!dataset || !meta?.data?.length) return;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      meta.data.forEach((point, index) => {
        const value = Number(dataset.data[index] || 0);
        const previous = index > 0 ? Number(dataset.data[index - 1] || 0) : null;
        const diff = previous === null ? null : value - previous;
        const x = point.x;
        const y = point.y - 46;
        const mainText = formatter(value);
        const diffText = diff === null ? "" : `${diff >= 0 ? "+" : ""}${formatter(diff)}`;
        const width = Math.max(ctx.measureText(mainText).width + 34, diffText ? ctx.measureText(diffText).width + 38 : 0, 86);
        const height = diff === null ? 38 : 54;

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
    }
  };
}

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

function formatBaht(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  });
}

function formatShortBaht(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatUnits(value) {
  return `${Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} kWh`;
}

function formatShortUnits(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function getRate() {
  return Number(document.getElementById("unitRate")?.value || 0);
}

async function loadHouseOptions() {
  const houseSelect = document.getElementById("houseSelect");
  if (!houseSelect) return;

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

async function loadSelectedHouseHistory() {
  const houseSelect = document.getElementById("houseSelect");
  const rate = getRate();

  if (!houseSelect?.value || !Number.isFinite(rate) || rate < 0) return;

  localStorage.setItem("smart_meter_house_id", houseSelect.value);
  localStorage.setItem("smart_meter_unit_rate", String(rate));

  const res = await fetch(`http://localhost:3000/api/readings/monthly-bills?rate=${encodeURIComponent(rate)}`);
  const payload = await res.json();
  const data = (payload.rows || []).filter(row => String(row.house_id) === String(houseSelect.value));
  const houseName = houseSelect.options[houseSelect.selectedIndex]?.text || "-";
  const latest = data[data.length - 1];

  document.getElementById("selectedHouseName").innerText = houseName;
  document.getElementById("latestBill").innerText = latest ? formatBaht(latest.bill_amount) : "-";
  document.getElementById("latestUnits").innerText = latest ? formatUnits(latest.usage_unit) : "-";

  selectedBillChart = renderLineChart({
    existingChart: selectedBillChart,
    canvasId: "selectedBillChart",
    emptyId: "selectedBillEmpty",
    data,
    valueKey: "bill_amount",
    datasetLabel: "ค่าไฟ (บาท)",
    emptyText: "ยังไม่มีประวัติค่าไฟรายเดือน บ้านที่เลือกต้องมีข้อมูลอย่างน้อย 2 เดือน",
    formatter: formatShortBaht,
    tooltipFormatter: value => `ค่าไฟ: ${formatBaht(value)}`,
  });

  selectedUsageChart = renderLineChart({
    existingChart: selectedUsageChart,
    canvasId: "selectedUsageChart",
    emptyId: "selectedUsageEmpty",
    data,
    valueKey: "usage_unit",
    datasetLabel: "หน่วยไฟที่ใช้",
    emptyText: "ยังไม่มีประวัติหน่วยไฟรายเดือน บ้านที่เลือกต้องมีข้อมูลอย่างน้อย 2 เดือน",
    formatter: formatShortUnits,
    tooltipFormatter: value => `หน่วยไฟ: ${formatUnits(value)}`,
  });
}

function renderLineChart(config) {
  const canvas = document.getElementById(config.canvasId);
  const emptyMessage = document.getElementById(config.emptyId);
  if (!canvas) return config.existingChart;

  if (config.existingChart) config.existingChart.destroy();

  if (!Array.isArray(config.data) || config.data.length === 0) {
    if (emptyMessage) emptyMessage.innerText = config.emptyText;
    return null;
  }

  if (emptyMessage) emptyMessage.innerText = "";

  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: config.data.map(row => row.month),
      datasets: [{
        label: config.datasetLabel,
        data: config.data.map(row => Number(row[config.valueKey] || 0)),
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
        fill: true
      }]
    },
    plugins: [makeValueLabelPlugin(`${config.canvasId}Labels`, config.formatter)],
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
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          titleColor: "#17212f",
          bodyColor: "#344054",
          borderColor: "rgba(217, 226, 236, 0.95)",
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          displayColors: false,
          callbacks: { label: context => config.tooltipFormatter(context.parsed.y) }
        }
      },
      scales: {
        x: {
          border: { display: false },
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: { color: "#344054", padding: 10, font: { size: 13, weight: "800" } }
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: "rgba(148, 163, 184, 0.18)" },
          ticks: {
            color: chartPalette.axis,
            padding: 10,
            font: { size: 14, weight: "800" },
            callback: value => Number(value).toLocaleString("th-TH")
          }
        }
      }
    }
  });
}

async function initMonthlyPage() {
  const savedRate = localStorage.getItem("smart_meter_unit_rate");
  const rateInput = document.getElementById("unitRate");
  const houseSelect = document.getElementById("houseSelect");

  if (savedRate && rateInput) rateInput.value = savedRate;

  await loadHouseOptions();
  await loadSelectedHouseHistory();

  houseSelect?.addEventListener("change", loadSelectedHouseHistory);
  rateInput?.addEventListener("change", loadSelectedHouseHistory);
}

initMonthlyPage().catch(err => console.error("Error loading monthly page:", err));
