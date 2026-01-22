#! /usr/bin/env bun

import { log } from '@clack/prompts';

import autoSubmit from '~/commands/autoSubmit.ts';
import help from '~/commands/help.ts';
import submit from '~/commands/submit.ts';

import { type Command } from './types';

const commands: Record<string, Command> = {
  help,
  submit,
  autoSubmit,
};

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  // TODO: if no command show command selector
  if (!cmd || cmd === '-h' || cmd === '--help') {
    help();
    process.exit(0);
  }

  const handler = commands[cmd];

  if (!handler) {
    log.error(`Unknown command: ${cmd}`);
    help();
    process.exit(1);
  }

  await handler(argv.slice(1));
}

main().catch(err => {
  log.error(err);
  process.exit(1);
});
