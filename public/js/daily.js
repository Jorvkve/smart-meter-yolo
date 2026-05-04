window.addEventListener("load", initDashboard);

async function initDashboard() {
  await loadHouses();
  await loadLatestReadings();
  await loadTotalUsageChart();
}

async function loadHouses() {
  const res = await fetch("http://localhost:3000/api/houses");
  const houses = await res.json();
  const container = document.getElementById("houseCards");

  if (!container) return;

  container.innerHTML = "";

  houses.forEach((house) => {
    const isActive = house.is_active == 1;
    const statusBadge = isActive
      ? `<span class="badge bg-success">เปิดใช้งาน</span>`
      : `<span class="badge bg-secondary">ปิดใช้งาน</span>`;

    container.innerHTML += `
      <div class="col-md-6 col-xl-4">
        <div class="card meter-card h-100">
          <div class="card-header">
            <span>${house.house_name}</span>
            ${statusBadge}
          </div>
          <div class="card-body">
            <p><strong>เจ้าของ:</strong> ${house.owner_name ?? "-"}</p>
            <p><strong>โทร:</strong> ${house.phone ?? "-"}</p>
            <p class="empty-note">กำลังโหลดค่ามิเตอร์ล่าสุด...</p>
          </div>
        </div>
      </div>
    `;
  });
}

async function loadTotalUsageChart() {
  try {
    const res = await fetch("http://localhost:3000/api/readings/latest");
    const data = await res.json();
    const canvas = document.getElementById("totalUsageChart");

    if (!canvas) return;

    const labels = data.map((d) => d.house_name);
    const values = data.map((d) => Number(d.reading_value) || 0);

    new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "หน่วยไฟล่าสุด (kWh)",
            data: values,
            backgroundColor: ["#1d70b8", "#18865b", "#bf6b04", "#7a5af8", "#c2410c", "#0f766e"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              boxWidth: 12,
              color: "#17212f",
              font: { weight: "700" },
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: "#edf2f7" } },
        },
      },
    });
  } catch (err) {
    console.error("Chart Error:", err);
  }
}

async function loadLatestReadings() {
  const res = await fetch("http://localhost:3000/api/readings/latest");
  const data = await res.json();
  const cards = document.querySelectorAll("#houseCards .card");

  data.forEach((reading, index) => {
    if (!cards[index]) return;

    const body = cards[index].querySelector(".card-body");

    if (!reading.reading_value) {
      body.innerHTML = `<p class="empty-note">ยังไม่มีข้อมูลมิเตอร์</p>`;
      return;
    }

    body.innerHTML = `
      <p><strong>หน่วยล่าสุด:</strong> ${reading.reading_value} kWh</p>
      <p><strong>เวลา:</strong> ${new Date(reading.reading_time).toLocaleString()}</p>
      <img
        src="/uploads/${reading.image_filename}"
        class="img-fluid mt-2"
        alt="ค่ามิเตอร์ของ ${reading.house_name}"
      />
    `;
  });
}
