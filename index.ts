#! /usr/bin/env bun

import help from './commands/help.ts';
import submit from './commands/submit.ts';

type Command = (args: string[]) => Promise<void> | void;

const commands: Record<string, Command> = {
  help,
  submit,
};

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '-h' || cmd === '--help') {
    help();
    process.exit(cmd ? 0 : 1);
  }

  const handler = commands[cmd];

  if (!handler) {
    console.error(`Unknown command: ${cmd}`);
    help();
    process.exit(1);
  }

  await handler(argv.slice(1));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
