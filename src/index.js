#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { configuration, createServer, requireRoot, status } from './server.js';
import { installBridge } from './bridge.js';

try {
  const config = configuration();
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--doctor') {
    console.log(JSON.stringify(await status(config), null, 2));
  } else if (args.length === 1 && args[0] === '--install-bridge') {
    console.log(JSON.stringify(await installBridge(await requireRoot(config)), null, 2));
  } else if (args.length === 0) {
    serveStdio(() => createServer(config), { onerror: error => console.error(error.message) });
  } else {
    throw new Error('Usage: serious-editor-mcp [--doctor | --install-bridge]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
