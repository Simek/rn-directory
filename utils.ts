import { log } from '@clack/prompts';

import { type PackageJsonRepository } from '~/types';

export function directoryExist(path: string) {
  return !!Array.from(new Bun.Glob(path).scanSync({ onlyFiles: false }))[0];
}

export function parseRepositoryData(data: PackageJsonRepository) {
  if (typeof data === 'string') {
    if (data.startsWith('github:')) {
      return `https://github.com/${data.replace('github:', '')}`;
    }
    log.error('Currently only GitHub hosted packages are supported in the directory');
    return undefined;
  }

  if ('directory' in data) {
    return `${data.url.replace('git+', '').replace('.git', '')}/tree/HEAD/${data.directory}`;
  }
  return data.url.replace('git+', '').replace('.git', '');
}

export function parseGitHubUrl(url: string) {
  const [, , , repoOwner, repoName, ...path] = url.split('/');

  const isMonorepo = !!(path && path.length);
  const branchName = path[1];
  const packagePath = isMonorepo ? path.slice(2).join('/').replace('%40', '@') : '.';

  return {
    repoOwner,
    repoName,
    isMonorepo,
    branchName,
    packagePath,
  };
}

export function getNewArchitectureValue(status: string) {
  switch (status) {
    case 'yes':
      return true;
    case 'no':
      return false;
    case 'only':
      return 'new-arch-only';
    default:
      return undefined;
  }
}

export function getConfigPluginValue(configPlugin: string) {
  if (configPlugin.startsWith('https://github.com')) {
    return configPlugin;
  } else if (configPlugin === 'yes') {
    return true;
  }
  return undefined;
}

export function isValidUrl(url: string) {
  return /^https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?$/i.test(url);
}

export function isValidGHUrl(url: string) {
  return /^https?:\/\/(?:www\.)?github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\/tree\/[a-z0-9_.@%\-/]+)?\/?$/i.test(url);
}

export function isValidImageUrl(url: string) {
  return /^https?:\/\/[\w./:%+-]+\.(?:jpe?g|gif|png|webp)(\?\S*)?$/i.test(url);
}
