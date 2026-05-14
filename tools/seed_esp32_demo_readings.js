const mysql = require("mysql2/promise");

const readings = [
  {
    house_id: 1,
    reading_value: 25882,
    image_filename: "esp32_house1_20260512_174528.jpg",
    reading_time: "2026-05-12 17:45:28",
  },
  {
    house_id: 2,
    reading_value: 8119,
    image_filename: "esp32_house2_20260512_175209.jpg",
    reading_time: "2026-05-12 17:52:09",
  },
  {
    house_id: 3,
    reading_value: 14541,
    image_filename: "esp32_house3_20260512_175234.jpg",
    reading_time: "2026-05-12 17:52:34",
  },
];

async function main() {
  const db = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "smart_meter_db",
    port: 3306,
  });

  await db.beginTransaction();

  try {
    await db.query("DELETE FROM meter_readings");
    await db.query("ALTER TABLE meter_readings AUTO_INCREMENT = 1");

    for (const row of readings) {
      await db.query(
        `
          INSERT INTO meter_readings
            (house_id, reading_value, image_filename, reading_time)
          VALUES (?, ?, ?, ?)
        `,
        [row.house_id, row.reading_value, row.image_filename, row.reading_time]
      );
    }

    await db.commit();

    const [rows] = await db.query(`
      SELECT
        m.id,
        m.house_id,
        h.house_name,
        m.reading_value,
        m.image_filename,
        m.reading_time
      FROM meter_readings m
      JOIN houses h ON h.id = m.house_id
      ORDER BY m.house_id
    `);

    console.table(rows);
  } catch (err) {
    await db.rollback();
    throw err;
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
