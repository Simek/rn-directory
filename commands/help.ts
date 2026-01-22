import { intro, log, outro } from '@clack/prompts';

export default function help() {
  intro('React Native Directory CLI [help]');
  log.info(`rnd-cli <command>

Commands:
  submit      manually create a PR in React Native Directory
  autoSubmit  create a PR in React Native Directory for the library in current directory
  help        show this help

Examples:
  rnd-cli submit`);
  outro();
}
