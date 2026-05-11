#!/usr/bin/env node

const args = process.argv.slice(2);

if (args[0] === 'init') {
  require('../dist/cli/init.js').init(args.slice(1));
} else if (args[0] === 'gen') {
  require('../dist/cli/gen.js').gen(args.slice(1)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
} else {
  require('../dist/index.js');
}
