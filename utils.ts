import { $ } from 'bun';

import { type PackageJsonRepository } from '~/types';

export function directoryExist(path: string) {
  return !!Array.from(new Bun.Glob(path).scanSync({ onlyFiles: false }))[0];
}

export function parseRepositoryData(data: PackageJsonRepository) {
  if (typeof data === 'string') {
    if (data.startsWith('github:')) {
      return `https://github.com/${data.replace('github:', '')}`;
    }
    console.error('Currently only GitHub hosted packages are supported in the directory');
    return undefined;
  }

  if ('directory' in data) {
    return `${data.url.replace('git+', '').replace('.git', '')}/tree/HEAD/${data.directory}`;
  }
  return data.url.replace('git+', '').replace('.git', '');
}

export async function checkGHCLIAvailability() {
  try {
    await $`gh --version`.quiet();
  } catch (_) {
    console.error('GitHub CLI need to be installed on your system, see: https://cli.github.com/');
    process.exit(1);
  }
}

export async function checkPresenceInRegistries(packageName: string) {
  const npmResult = await fetch(`https://registry.npmjs.org/${packageName}/latest`);

  if (npmResult.status !== 200) {
    console.error('You cannot submit package which is not published to npm registry');
    process.exit(1);
  }

  const directoryResult = await fetch(`https://reactnative.directory/api/library?name=${packageName}&check=true`);
  const directoryData = (await directoryResult.json()) as Record<string, boolean>;

  if (directoryData[packageName]) {
    console.warn(
      `The package already exist in the directory.\nVisit the package page at https://reactnative.directory/package/${packageName}`
    );
    process.exit(0);
  }
}
