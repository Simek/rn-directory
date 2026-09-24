import { cancel, intro, log, outro, spinner } from '@clack/prompts';
import { $ } from 'bun';
import { blue, bold, gray, green, white, yellow } from 'picocolors';

import { DIRECTORY_WARNINGS, FILE_WARNINGS } from './common/constants';

function getPackedFiles(packOutput: string) {
  const contents = packOutput.match(/Tarball Contents([\s\S]*?)Tarball Details/)?.[1] ?? '';
  return contents
    .split('\n')
    .map(line => line.match(/npm notice\s+\S+\s+(.+)$/)?.[1])
    .filter((file): file is string => file !== undefined);
}

function getBundleWarnings(files: string[]) {
  const warnings = new Map<string, string[]>();

  for (const file of files) {
    const fileName = file.split('/').pop() ?? file;
    const directoryNames = file.split('/').slice(0, -1);
    const matchedFileWarning = FILE_WARNINGS.find(pattern => new Bun.Glob(pattern).match(fileName));
    const matchedDirectoryWarning = DIRECTORY_WARNINGS.find(pattern =>
      directoryNames.some(directory => new Bun.Glob(pattern).match(directory))
    );

    if (matchedFileWarning) {
      warnings.set(file, [`file pattern '${white(bold(matchedFileWarning))}'`]);
    }

    if (matchedDirectoryWarning) {
      warnings.set(file, [
        ...(warnings.get(file) ?? []),
        `directory pattern '${white(bold(matchedDirectoryWarning))}'`,
      ]);
    }
  }

  return warnings;
}

export default async function checkBundle() {
  intro(`${blue('React Native Directory CLI')} ${blue(bold('[checkBundle]'))}`);

  const packageJson = Bun.file('./package.json');

  if (!(await packageJson.exists())) {
    cancel(`You need to run the command inside the library repository, where ${bold('package.json')} file is located.`);
    process.exit(1);
  }

  const packageJsonContent = await packageJson.json();

  if (packageJsonContent.private) {
    log.info(
      'You cannot check bundle of package which is marked as private, since it is not ment to be published.\nIf you are in monorepo, the checks need to be done from package subdirectory.\n'
    );
    cancel(`Aborting the check!`);
    process.exit(1);
  }

  const packageName = packageJsonContent.name;

  const checkProgress = spinner();
  checkProgress.start(`Running ${bold('bunx npm pack --dry-run')} for ${bold(packageName)}`);

  const packLogs = await $`bunx npm pack --dry-run`.quiet();

  checkProgress.stop('Bundle check finished!');

  const packedFiles = getPackedFiles(`${packLogs.stdout.toString()}\n${packLogs.stderr.toString()}`);
  const bundleWarnings = getBundleWarnings(packedFiles);

  if (bundleWarnings.size === 0) {
    outro(green('All good! No files or directories requiring attention were found in the bundle.'));
  } else {
    const warningMessage = [
      yellow('Found the following entries in the bundle which probably might be ignored:'),
      ...Array.from(bundleWarnings, ([file, warnings]) =>
        gray(`- ${yellow(bold(file))} matches ${warnings.join(' and ')}`)
      ),
    ].join('\n');
    log.warn(warningMessage);

    outro('This is only a suggestion. The listed files and directories may be required in your specific case.');
  }
}
