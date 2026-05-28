const mysql = require("mysql2");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "smart_meter_db",
  port: 3306,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.getConnection((err, connection) => {
  if (err) {
    console.log("DB Error:", err);
    return;
  }

  console.log("MySQL Pool Connected ✅");
  connection.release();
});

module.exports = db;
