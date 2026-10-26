import path from 'node:path';
import * as fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export async function confinedPath(root, relative) {
  if (!relative || relative.includes('\\') || relative.includes(':') || relative.includes('\0') || path.posix.isAbsolute(relative)) {
    throw new Error('Expected a relative forward-slash path.');
  }
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('Invalid path segment.');
  const base = await fs.realpath(root);
  let current = base;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const entry = await fs.lstat(current);
      if (entry.isSymbolicLink()) throw new Error('Links and junctions are not accepted inside configured roots.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return current;
}

export async function readBounded(file, maxBytes = 262144) {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error(`File exceeds the ${maxBytes}-byte limit or is not a regular file.`);
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes) throw new Error('File grew beyond the read limit.');
    return buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

export async function atomicWrite(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { flag: 'wx' });
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temporary, file); break; }
      catch (error) {
        // The editor can briefly hold request.txt open on Windows. Keep the
        // complete temporary file; never fall back to an in-place partial write.
        if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
        await delay(50 * (attempt + 1));
      }
    }
  } finally {
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function exists(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
