async function loadMonthlyChart() {
  try {
    const res = await fetch("http://localhost:3000/api/readings/monthly-by-house");
    const data = await res.json();

    if (!data || data.length === 0) return;

    const canvas = document.getElementById("monthlyChart");
    if (!canvas) return;

    const months = [...new Set(data.map(d => d.month))].sort((a, b) => {
      const [mA, yA] = a.split("/");
      const [mB, yB] = b.split("/");
      return new Date(yA, mA - 1) - new Date(yB, mB - 1);
    });

    const houses = [...new Set(data.map(d => d.house_name))].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "")) || 999;
      const numB = parseInt(b.replace(/\D/g, "")) || 999;
      return numA - numB;
    });

    const colors = ["#1d70b8", "#18865b", "#bf6b04", "#7a5af8", "#c2410c", "#0f766e"];

    const datasets = houses.map((house, i) => ({
      label: house,
      backgroundColor: colors[i % colors.length],
      borderRadius: 6,
      data: months.map(month => {
        const found = data.find(d => d.month === month && d.house_name === house);
        return found ? Number(found.total_unit) : 0;
      })
    }));

    new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: months, datasets },
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
      }
    });
  } catch (err) {
    console.error("Error loading monthly chart:", err);
  }
}

async function loadHouseMonthlyCharts() {
  try {
    const res = await fetch("http://localhost:3000/api/readings/monthly-by-house");
    const data = await res.json();
    const container = document.getElementById("houseMonthlyCharts");

    if (!container || !data) return;
    container.innerHTML = "";

    const houses = [...new Set(data.map(d => d.house_name))].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "")) || 999;
      const numB = parseInt(b.replace(/\D/g, "")) || 999;
      return numA - numB;
    });

    const allMonths = [...new Set(data.map(d => d.month))].sort((a, b) => {
      const [mA, yA] = a.split("/");
      const [mB, yB] = b.split("/");
      return new Date(yA, mA - 1) - new Date(yB, mB - 1);
    });

    houses.forEach((house, index) => {
      const canvasId = "chart_" + index;
      const col = document.createElement("div");

      col.className = "col-lg-6";
      col.innerHTML = `
        <div class="card h-100">
          <div class="card-header">${house}</div>
          <div class="card-body"><canvas id="${canvasId}"></canvas></div>
        </div>
      `;
      container.appendChild(col);

      const houseData = data.filter(d => d.house_name === house);
      const values = allMonths.map(month => {
        const found = houseData.find(d => d.month === month);
        return found ? Number(found.total_unit) : 0;
      });

      new Chart(document.getElementById(canvasId).getContext("2d"), {
        type: "line",
        data: {
          labels: allMonths,
          datasets: [{
            label: "หน่วยไฟ",
            data: values,
            borderColor: "#1d70b8",
            backgroundColor: "rgba(29,112,184,0.14)",
            pointBackgroundColor: "#18865b",
            pointRadius: 4,
            tension: 0.32,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: "#edf2f7" } },
          },
        }
      });
    });
  } catch (err) {
    console.error("Error loading individual charts:", err);
  }
}

loadMonthlyChart();
loadHouseMonthlyCharts();
