#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'init') {
  require('../dist/cli/init.js').init(args.slice(1));
} else if (args[0] === '--version' || args[0] === '-v') {
  console.log(require('../package.json').version);
} else if (args[0] === '--help' || args[0] === '-h') {
  console.log('MeiGen 4 — remote MCP connection bridge\n\nmeigen           Connect using an existing MeiGen key, otherwise OAuth\nmeigen --oauth   Explicitly use OAuth; preserve existing local settings\nmeigen init      Configure a native remote connection\n\nRemote URL: https://www.meigen.ai/api/mcp\nLocal BYOK, file processing, gen CLI and preferences remain in meigen@3.4.0.');
} else if (args[0] === 'gen') {
  console.error('The local gen CLI remains in meigen@3.4.0. MeiGen 4 forwards MCP tools to https://www.meigen.ai/api/mcp; use your connected assistant. No generation was submitted.');
  process.exitCode = 1;
} else {
  require('../dist/index.js').main(args).catch((error) => {
    console.error(error instanceof Error ? error.message : 'MeiGen remote bridge could not start.');
    process.exitCode = 1;
  });
}
