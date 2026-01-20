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

export function supportPrompt(platform: string, suffix = 'Supports') {
  const answer = prompt(`• ${suffix} ${platform}? (y/n)`)?.trim().toLowerCase();

  if (!answer || !['y', 'yes', 'n', 'no'].includes(answer)) {
    console.error(`Incorrect ${platform} support status`);
    process.exit(1);
  }

  return answer;
}

export function getNewArchitectureValue(status: string) {
  switch (status) {
    case 'y':
    case 'yes':
      return true;
    case 'n':
    case 'no':
      return false;
    case 'only':
      return 'new-arch-only';
    default:
      return undefined;
  }
}
