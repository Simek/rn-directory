import { $ } from 'bun';

import { printError } from '~/utils.ts';

export async function checkGHCLIAvailability() {
  try {
    await $`gh --version`.quiet();
  } catch (_) {
    printError('GitHub CLI need to be installed on your system, see: https://cli.github.com/');
    process.exit(1);
  }
}

export async function checkPresenceInRegistries(packageName: string) {
  const npmResult = await fetch(`https://registry.npmjs.org/${packageName}/latest`);

  if (npmResult.status !== 200) {
    printError('You cannot submit package which is not published to npm registry');
    process.exit(1);
  }

  const directoryResult = await fetch(`https://reactnative.directory/api/library?name=${packageName}&check=true`);
  const directoryData = (await directoryResult.json()) as Record<string, boolean>;

  if (directoryData[packageName]) {
    console.warn(`✅ The package already exist in the directory.`);
    console.warn(`Visit the package page at https://reactnative.directory/package/${packageName}`);
    process.exit(0);
  }
}
