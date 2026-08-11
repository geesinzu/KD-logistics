
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

  const trackingId = 'KEDI-UY2608217';

  const [rows] = await conn.execute('SELECT id, tracking_id FROM shipments WHERE tracking_id = ?', [trackingId]);
  if (!rows[0]) {
    console.log('Not found: ' + trackingId);
    await conn.end();
    return;
  }

  const id = rows[0].id;
  const [delT] = await conn.execute('DELETE FROM tracking_events WHERE shipment_id = ?', [id]);
  const [delS] = await conn.execute('DELETE FROM shipments WHERE id = ?', [id]);

  console.log('Deleted: ' + trackingId + ' (events: ' + delT.affectedRows + ', shipment: ' + delS.affectedRows + ')');
  await conn.end();
}

main().catch(e => console.error(e.message));
