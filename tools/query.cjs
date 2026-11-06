// Public anonymous H5 protocol. Node >= 20. Used for fixture preparation and smoke checks.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const swift = fs.readFileSync(path.join(__dirname, '../Shared/MetroAPI.swift'), 'utf8');
const appID = swift.match(/static let appID = "([^"]+)"/)[1];
const publicKey = swift.match(/static let publicKey = "([^"]+)"/)[1];
const baseURL = swift.match(/static let baseURL = "([^"]+)"/)[1];
function digest(body, nonce, sequence, timestamp) {
  return crypto.createHash('sha256').update(`appid=${appID}&message=${body}&nonce=${nonce}&sequence=${sequence}&timestamp=${timestamp}&version=0400`).digest('hex').toUpperCase();
}
async function query(endpoint, values) {
  const body = JSON.stringify(Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))));
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString('hex');
  const stamp = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(new Date()).replace(/\D/g, '');
  const sequence = stamp + crypto.randomInt(1000000000, 10000000000);
  const signature = crypto.publicEncrypt({ key:`-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`, padding:crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(digest(body, nonce, sequence, timestamp))).toString('base64');
  const response = await fetch(baseURL + endpoint, {
    method:'POST', body, signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json;charset=utf-8', Accept:'application/json', appid:appID, cityId:'5000', deviceType:'1', version:'0400', timestamp, nonce, sequence, signature, 'decrypt-body':'', Referer:baseURL + '/app-h5/msx-metro-pis/'}
  });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  let text = await response.text();
  if (response.headers.get('decrypt-body') === 'true') {
    const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(publicKey.slice(0,16)), null);
    text = Buffer.concat([decipher.update(Buffer.from(text, 'hex')), decipher.final()]).toString('utf8');
  }
  const result = JSON.parse(text);
  if (!result.success) throw Error(result.errmsg || result.errcode || 'API failed');
  return {receivedAt: new Date().toISOString(), ...result};
}
module.exports = {query, digest, publicKey};
