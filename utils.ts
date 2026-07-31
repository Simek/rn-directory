import { type PackageJsonRepository } from './types';

export function directoryExist(path: string) {
  return !!Array.from(new Bun.Glob(path).scanSync({ onlyFiles: false }))[0];
}

export function fileExist(path: string) {
  return !!Array.from(new Bun.Glob(path).scanSync({ onlyFiles: true }))[0];
}

export function getExampleDirectories() {
  const packageJsonPaths = ['example/package.json', 'examples/package.json', 'examples/*/package.json'].filter(
    fileExist
  );

  return [...new Set(packageJsonPaths)]
    .map(packageJsonPath => packageJsonPath.replace(/[/\\]package\.json$/, '').replaceAll('\\', '/'))
    .sort();
}

export async function deleteFile(filename: string) {
  const tempFile = Bun.file(filename);
  await tempFile.delete();
}

export function parseRepositoryData(data: PackageJsonRepository) {
  if (typeof data === 'string') {
    if (data.startsWith('github:')) {
      return { repositoryUrl: `https://github.com/${data.replace('github:', '')}` };
    }
    return {
      repositoryError: `Invalid repository string format or non-GitHub URL (${data}).\n   Currently only GitHub hosted packages are supported in the directory.`,
    };
  }

  const cleanGitHubUrl = data.url.replace('git+', '').replace('.git', '');

  if ('directory' in data) {
    return { repositoryUrl: `${cleanGitHubUrl}/tree/HEAD/${data.directory}` };
  }
  return { repositoryUrl: cleanGitHubUrl };
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

export function validateUrlsListString(
  value: string | undefined,
  message: string,
  validator: (url: string) => boolean
) {
  if (!value || value.length === 0) {
    return;
  }
  const valuesList = value.split(',');
  if (valuesList && valuesList.length > 0) {
    const invalidUrls = valuesList.filter(imageUrl => !validator(imageUrl));
    if (invalidUrls.length > 0) {
      return `${message}:\n- ` + invalidUrls.join('\n - ');
    }
  }
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

export function isValidNpmPackageName(name: string) {
  return /^(?:@[a-z0-9][a-z0-9-._~]*\/)?[a-z0-9][a-z0-9-._~]*$/i.test(name);
}
