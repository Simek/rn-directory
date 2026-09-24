import { intro, log, outro } from '@clack/prompts';
import { blue, bold, dim } from 'picocolors';

export default function help() {
  intro(`${blue('React Native Directory CLI')} ${blue(bold('[help]'))}`);
  log.info(`rn-directory <command>

Commands:
  ${bold('submit')}       ${dim('manually create a PR in React Native Directory')}
  ${bold('autoSubmit')}   ${dim('automatically creates a PR in React Native Directory for the library in current directory')}
  ${bold('checkBundle')}  ${dim('check the package bundle configuration and contents')}
  ${bold('help')}         ${dim('show this help')}

Examples:
  ${bold('rn-directory submit')}`);
  outro();
}
