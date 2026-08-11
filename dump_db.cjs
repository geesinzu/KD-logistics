const mysql = require('mysql2/promise');
const fs = require('fs');

async function dump() {
  const conn = await mysql.createConnection({
    host: 'ep-t4ni387b5e83b7519dc8.epsrv-t4n281l4mrmemi4zls9a.ap-southeast-1.privatelink.aliyuncs.com',
    port: 4000,
    user: '2LC72tmk8Nvxbub.root',
    password: 'DBOu6dz2YhuLX2SAFvRaAxtlTewzdfsR',
    database: '19f0e9b1-4782-83a9-8000-09655a66618d',
    connectTimeout: 30000
  });

  const [tables] = await conn.execute(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
    ['19f0e9b1-4782-83a9-8000-09655a66618d']
  );

  let dump = "-- KEDI Logistics Database Dump\n";
  dump += "-- Generated: " + new Date().toISOString() + "\n";
  dump += "-- Database: 19f0e9b1-4782-83a9-8000-09655a66618d\n\n";
  dump += "SET FOREIGN_KEY_CHECKS=0;\n\n";

  for (const t of tables) {
    const table = t.TABLE_NAME || t.table_name;
    dump += "\n-- ----------------------------\n";
    dump += "-- Table: " + table + "\n";
    dump += "-- ----------------------------\n";

    // CREATE TABLE
    const [cols] = await conn.execute("SHOW CREATE TABLE `" + table + "`");
    dump += "DROP TABLE IF EXISTS `" + table + "`;\n";
    dump += cols[0]['Create Table'] + ';\n\n';

    // INSERT DATA
    const [rows] = await conn.execute("SELECT * FROM `" + table + "`");
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      dump += "INSERT INTO `" + table + "` (`" + columns.join('`, `') + "`) VALUES\n";
      for (let i = 0; i < rows.length; i++) {
        const vals = columns.map(c => {
          const v = rows[i][c];
          if (v === null) return 'NULL';
          if (typeof v === 'number') return v;
          return "'" + String(v).replace(/'/g, "''") + "'";
        });
        dump += "  (" + vals.join(', ') + ")" + (i < rows.length - 1 ? ',' : ';') + "\n";
      }
      dump += '\n';
    }
  }

  dump += "SET FOREIGN_KEY_CHECKS=1;\n";

  fs.writeFileSync('/mnt/agents/output/kedi_database_dump.sql', dump);
  console.log('Dump saved to /mnt/agents/output/kedi_database_dump.sql');
  console.log('Tables:', tables.map(t => t.TABLE_NAME || t.table_name).join(', '));
  await conn.end();
}

dump().catch(e => { console.error(e.message); process.exit(1); });
