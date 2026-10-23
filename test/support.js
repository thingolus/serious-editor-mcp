import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

export async function fixture(t) {
  const base = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(base, 'serious-editor-mcp-test-'));
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== base || !path.basename(root).startsWith('serious-editor-mcp-test-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(root, 'Bin/x64'), { recursive: true });
  await fs.mkdir(path.join(root, 'Content/SeriousSam2017'), { recursive: true });
  await fs.writeFile(path.join(root, 'Bin/x64/Sam2017_SeriousEditor.exe'), 'TEST FIXTURE. NOT EXECUTABLE.');
  return root;
}

export async function zipFixture(root, entries) {
  const zip = new yazl.ZipFile();
  const finished = pipeline(zip.outputStream, createWriteStream(path.join(root, 'Content/SeriousSam2017/test.gro')));
  for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content), name);
  zip.end();
  await finished;
}
