import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { confinedPath, readBounded, sha256 } from './files.js';
import { requestEditor } from './bridge.js';

const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;

export function validateProjectRoot(value) {
  if (!value) return undefined;
  if (!/^Content\/[A-Za-z0-9_-]+$/.test(value) ||
      /^Content\/(Serious.*|EditorMcp|Common|Shared)$/i.test(value)) {
    throw new Error('SERIOUS_EDITOR_PROJECT_ROOT must be an original Content/YourMod namespace, not an engine/stock directory.');
  }
  return value;
}

async function documentFile(root, relative) {
  if (!/^Content\/[A-Za-z0-9_ /.-]+\.(wld|ep)$/.test(relative) || relative.includes('..') ||
      relative.split('/').some(part => /[. ]$/.test(part))) {
    throw new Error('Use an existing Content/... .wld or .ep path with forward slashes; no traversal, trailing dots/spaces or executable scripts.');
  }
  const absolute = await confinedPath(root, relative);
  return { absolute, bytes: await readBounded(absolute, MAX_DOCUMENT_BYTES) };
}

// Per MCP session; concrete native handles are retained separately in Lua.
export function documentTools(config, request = requestEditor) {
  const documents = new Map();
  function record(id) {
    const result = documents.get(id);
    if (!result) throw new Error('Unknown document token in this MCP session; call editor_open_document again.');
    return result;
  }
  async function inspect(root, id) {
    const doc = record(id);
    const active = await request(root, 'document', id);
    const file = await documentFile(root, doc.path);
    return { ...active, sha256: sha256(file.bytes), bytes: file.bytes.length,
      saveAllowed: Boolean(config.allowMutation && config.projectRoot && doc.path.startsWith(`${config.projectRoot}/`)) };
  }
  return {
    clear: () => documents.clear(),
    async open(root, relative) {
      const file = await documentFile(root, relative);
      const opened = await request(root, 'open_document', relative, 15000);
      documents.set(opened.documentId, { path: relative });
      if (documents.size > 32) documents.delete(documents.keys().next().value);
      return { ...opened, sha256: sha256(file.bytes), bytes: file.bytes.length,
        note: 'Path is the explicit open request, not an editor filename query. Existing unsaved contents are preserved; inspect before saving.' };
    },
    inspect,
    async startSimulation(root, id, withPlayer) {
      if (!config.allowMutation) throw new Error('Editing is disabled. Set SERIOUS_EDITOR_ALLOW_MUTATION=1.');
      const doc=record(id);
      if (!config.projectRoot || !doc.path.startsWith(`${config.projectRoot}/`) || !doc.path.endsWith('.wld')) {
        throw new Error('Simulation requires an opened world in SERIOUS_EDITOR_PROJECT_ROOT.');
      }
      if (typeof withPlayer!=='boolean') throw new Error('withPlayer must be boolean.');
      await inspect(root,id);
      return request(root,'start_simulation',`${id}\n${withPlayer?'1':'0'}`,15000);
    },
    async save(root, id, expectedSha256) {
      if (!config.allowMutation) throw new Error('Editing is disabled. Set SERIOUS_EDITOR_ALLOW_MUTATION=1.');
      const projectRoot = validateProjectRoot(config.projectRoot);
      const doc = record(id);
      if (!projectRoot || !doc.path.startsWith(`${projectRoot}/`)) {
        throw new Error('Saving requires SERIOUS_EDITOR_PROJECT_ROOT and a document inside that original namespace.');
      }
      if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Provide the SHA256 observed by editor_open_document or editor_document.');
      await request(root, 'document', id); // Refuse stale/changed context before backup or write.
      const file = await documentFile(root, doc.path);
      if (sha256(file.bytes) !== expectedSha256) throw new Error('File changed on disk since inspection; no save attempted.');
      const backup = `Content/EditorMcp/backups/${randomUUID()}/${doc.path.split('/').at(-1)}`;
      const backupPath = await confinedPath(root, backup);
      await fs.mkdir(await confinedPath(root, backup.slice(0, backup.lastIndexOf('/'))), { recursive: true });
      await fs.writeFile(backupPath, file.bytes, { flag: 'wx' });
      // Recheck after backup creation. Never overwrite a detected external change.
      if (sha256((await documentFile(root, doc.path)).bytes) !== expectedSha256) throw new Error(`File changed during backup; no save attempted. Backup: ${backup}`);
      try {
        await request(root, 'save_document', id, 15000);
        const after = await documentFile(root, doc.path);
        const afterHash = sha256(after.bytes);
        return { documentId: id, requestedPath: doc.path, backup, beforeSha256: expectedSha256,
          sha256: afterHash, bytes: after.bytes.length, fileChanged: afterHash !== expectedSha256,
          outcome: afterHash === expectedSha256 ? 'no-file-change' : 'file-changed',
          note: 'Filesystem evidence only. No change may mean an already-saved file or an ineffective save; reopen to verify semantic persistence. All pending document changes are saved.' };
      } catch (error) {
        throw new Error(`Save outcome uncertain; inspect the file before retrying. Backup: ${backup}. ${error.message}`);
      }
    }
  };
}
