
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'ep-t4ni387b5e83b7519dc8.epsrv-t4n281l4mrmemi4zls9a.ap-southeast-1.privatelink.aliyuncs.com',
    port: 4000,
    user: '2LC72tmk8Nvxbub.root',
    password: 'DBOu6dz2YhuLX2SAFvRaAxtlTewzdfsR',
    database: '19f0e9b1-4782-83a9-8000-09655a66618d',
    connectTimeout: 15000
  });

  // Search for any shipment with 2608217 or UYO in it
  const [rows] = await conn.execute(
    "SELECT tracking_id, status FROM shipments WHERE tracking_id LIKE '%2608217%' OR tracking_id LIKE '%UYO%' ORDER BY tracking_id DESC LIMIT 20"
  );
  console.log('Matching shipments:');
  rows.forEach(r => console.log('  ' + r.tracking_id + ' (' + r.status + ')'));

  if (rows.length === 0) {
    // Show last 5 shipments overall
    const [last] = await conn.execute(
      "SELECT tracking_id, status FROM shipments ORDER BY created_at DESC LIMIT 5"
    );
    console.log('\nLast 5 shipments created:');
    last.forEach(r => console.log('  ' + r.tracking_id + ' (' + r.status + ')'));
  }

  await conn.end();
}

main().catch(e => console.error(e.message));
