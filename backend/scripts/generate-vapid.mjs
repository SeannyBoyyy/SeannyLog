// Idempotent, secret-safe preparation. Never print private key material.
// The JSON file is accepted directly by `wrangler secret bulk`.
import { createECDH, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const backend = fileURLToPath(new URL('../', import.meta.url));
const directory = fileURLToPath(new URL('../.secrets/', import.meta.url));
const filename = fileURLToPath(new URL('../.secrets/vapid.json', import.meta.url));
try{
  const ignored = spawnSync('git', ['check-ignore', '--quiet', '--', filename], {cwd:backend, stdio:'ignore'});
  if(ignored.status !== 0) throw new Error('Secret path must be ignored by Git.');
  let secrets;
  if(existsSync(filename)){
    secrets = JSON.parse(readFileSync(filename,'utf8'));
  }else{
    const {privateKey} = generateKeyPairSync('ec', {namedCurve:'prime256v1'});
    const key = privateKey.export({format:'jwk'});
    const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(key.x,'base64url'), Buffer.from(key.y,'base64url')]).toString('base64url');
    secrets = {VAPID_PUBLIC_KEY:publicKey, VAPID_PRIVATE_KEY:key.d};
    mkdirSync(directory,{recursive:true,mode:0o700});
    writeFileSync(filename,JSON.stringify(secrets,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  const curve = createECDH('prime256v1');
  curve.setPrivateKey(Buffer.from(secrets.VAPID_PRIVATE_KEY,'base64url'));
  if(curve.getPublicKey().toString('base64url') !== secrets.VAPID_PUBLIC_KEY) throw new Error('Key mismatch.');
  console.log('VAPID pair prepared in backend/.secrets/vapid.json (Git-ignored). Existing keys are reused.');
  console.log(`Public key: ${secrets.VAPID_PUBLIC_KEY}`);
}catch{
  console.error('VAPID preparation failed. Check Git ignore rules, secret-file permissions, and key validity. No private values were printed.');
  process.exitCode = 1;
}
