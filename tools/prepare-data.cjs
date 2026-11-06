const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {query, digest, publicKey} = require('./query.cjs');
const root = path.resolve(__dirname, '..');
const write = (name, data) => {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
};
(async () => {
  const lines = (await query('/bas/smartstation/v1/bas/line/list', {service_id:'01'})).result;
  const stations = [];
  for (const line of lines) {
    const response = await query('/bas/smartstation/v1/bas/station/list', {service_id:'01', line_no:line.line_no});
    if (response.result.total_count > response.result.rows.length) throw Error('Station metadata is paginated; handle all pages before packaging');
    for (const row of response.result.rows) {
      stations.push({stationID:row.station_no, stationName:row.station_name, lineID:line.line_no, lineName:line.line_name,
        upLabel:line.line_no === '50' ? '\u65b9\u5411\u4e00' : '\u5f80' + (line.up_end_station_name || '\u65b9\u5411\u4e00'),
        downLabel:line.line_no === '50' ? '\u65b9\u5411\u4e8c' : '\u5f80' + (line.down_end_station_name || '\u65b9\u5411\u4e8c')});
    }
    console.log(`${line.line_no}: ${response.result.rows.length} station records`);
  }
  const unique = [...new Map(stations.map(s=>[`${s.lineID}:${s.stationID}`,s])).values()];
  write('Resources/stations.json', unique);
  const arrivals = await Promise.allSettled(['5032','0403'].map(station_no => query('/bas/smartstation/v1/bas/schedule/station', {station_no, city_id:'5000', service_id:'01'})));
  for (let i=0;i<arrivals.length;i++) {
    const result = arrivals[i];
    if (result.status !== 'fulfilled') throw result.reason;
    write(`Tests/Fixtures/${i===0?'erlang':'toutang'}.json`,result.value);
    console.log(`${i===0?'erlang':'toutang'}: ` + result.value.result.lines.map(l=>`${l.line_name} up=${l.up?.length||0} down=${l.down?.length||0}`).join(', '));
  }
  const body = '{"city_id":"5000","service_id":"01","station_no":"5032"}';
  const nonce = '00112233445566778899aabbccddeeff00', sequence = '2026110614511234567890', timestamp = '1793947860000';
  const plaintext = '{"success":true,"result":{"ok":1}}';
  const cipher = crypto.createCipheriv('aes-128-ecb',Buffer.from(publicKey.slice(0,16)),null);
  const encrypted = Buffer.concat([cipher.update(plaintext),cipher.final()]).toString('hex');
  write('Tests/Fixtures/crypto.json',{body,nonce,sequence,timestamp,digest:digest(body,nonce,sequence,timestamp),plaintext,encrypted});
  write('Resources/catalog-info.json',{updatedAt:new Date().toISOString(),stationRecords:unique.length,lineCount:lines.length,source:'https://ycx.cqmetro.cn/app-h5/msx-metro-pis/'});
  console.log(`Saved ${unique.length} station-line choices; arrival fixtures and cryptographic reference vectors ready.`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
