import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { confinedPath, readBounded, atomicWrite, exists, sha256 } from './files.js';

export const BRIDGE_DIRECTORY = 'Content/EditorMcp';
export const COMMANDS = new Set(['ping', 'has_member', 'get_member']);

export async function installBridge(root) {
  const directory = await confinedPath(root, BRIDGE_DIRECTORY);
  await fs.mkdir(directory, { recursive: true });
  const destination = await confinedPath(root, `${BRIDGE_DIRECTORY}/bridge.lua`);
  const receiptPath = await confinedPath(root, `${BRIDGE_DIRECTORY}/install.json`);
  const source = await fs.readFile(new URL('../bridge/bridge.lua', import.meta.url));
  const hash = sha256(source);
  if (await exists(destination)) {
    const oldHash = sha256(await readBounded(destination));
    if (oldHash !== hash) {
      if (!await exists(receiptPath)) throw new Error('Existing bridge is unowned; preserve it before installing.');
      const receipt = JSON.parse(await readBounded(receiptPath, 4096));
      if (receipt.sha256 !== oldHash) throw new Error('Installed bridge was changed outside this tool; preserve it before updating.');
      const backup = await confinedPath(root, `${BRIDGE_DIRECTORY}/bridge-${oldHash}.lua.bak`);
      if (!await exists(backup)) await fs.copyFile(destination, backup, fs.constants.COPYFILE_EXCL);
    }
  }
  await atomicWrite(destination, source);
  const request = await confinedPath(root, `${BRIDGE_DIRECTORY}/request.txt`);
  try { await fs.writeFile(request, '', { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await atomicWrite(receiptPath, JSON.stringify({ version: '0.1.0', sha256: hash }, null, 2) + '\n');
  return { installed: true, script: `${BRIDGE_DIRECTORY}/bridge.lua`, sha256: hash,
    start: 'In Serious Editor use Script > Run script from file and select Content/EditorMcp/bridge.lua. This tool does not start or auto-load it.' };
}

export function encodeRequest(id, operation, argument = '') {
  if (!/^[a-f0-9-]{36}$/.test(id) || !COMMANDS.has(operation)) throw new Error('Invalid bridge command.');
  if (Buffer.byteLength(argument) > 1024 || argument.includes('\0')) throw new Error('Property path is invalid or too long.');
  return `SE_MCP/1\n${id}\n${operation}\n${Buffer.from(argument).toString('hex')}\n`;
}

export function decodeResponse(text, expectedId) {
  // Engine text output may add CRLF or a UTF-8 BOM.
  const match = text.replace(/^\uFEFF/, '').match(/^SE_MCP\/1\r?\n([a-f0-9-]{36})\r?\n(ok|error)\r?\n([^\r\n]*)\r?\n?$/);
  if (!match || match[1] !== expectedId) return null;
  const payload = JSON.parse(match[3]);
  if (match[2] === 'error') throw new Error(`Editor: ${payload.error ?? 'request failed'}`);
  return payload;
}

export async function requestEditor(root, operation, argument = '', timeoutMs = 5000) {
  const id = randomUUID();
  const command = encodeRequest(id, operation, argument);
  const script = await confinedPath(root, `${BRIDGE_DIRECTORY}/bridge.lua`);
  if (!await exists(script)) throw new Error('Bridge is not installed. Run editor_install_bridge, then start its script in the editor.');
  const lockPath = await confinedPath(root, `${BRIDGE_DIRECTORY}/client.lock`);
  const request = await confinedPath(root, `${BRIDGE_DIRECTORY}/request.txt`);
  const response = await confinedPath(root, `${BRIDGE_DIRECTORY}/response.txt`);
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another bridge request is active. If its process crashed, close MCP clients before removing Content/EditorMcp/client.lock.');
    throw error;
  }
  try {
    await lock.writeFile(id);
    await atomicWrite(request, command);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const result = decodeResponse((await readBounded(response, 65536)).toString('utf8'), id);
        if (result !== null) return result;
      } catch (error) {
        // A write in progress can briefly contain incomplete JSON. Retry it;
        // valid editor errors and oversize files must propagate immediately.
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
      await delay(100);
    }
    throw new Error('Editor did not answer before timeout. Start bridge.lua through Script > Run script from file; keep the editor responsive. A timeout is not success.');
  } finally {
    await lock.close();
    if (await fs.readFile(lockPath, 'utf8').catch(() => '') === id) await fs.unlink(lockPath);
  }
}
