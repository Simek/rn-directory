import { log } from '@clack/prompts';

export default function help() {
  log.info(`rnd-cli <command> [options]

Commands:
  submit      manually create a PR in React Native Directory
  autoSubmit  create a PR in React Native Directory for the library in current directory
  help        show this help

Examples:
  rnd-cli submit
`);
}
