import { type PackageJsonRepository } from './types';

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
