import { $ } from 'bun';

import { type LibraryDataEntryType, type PackageJsonRepository } from '~/types';
import { directoryExist, parseGitHubUrl, parseRepositoryData, printError } from '~/utils';

import {
  createAndPushCommit,
  createBranchInFork,
  createPRForRND,
  fetchLibrariesFromForkBranch,
  forkRNDRepo,
  printSummaryAndConfirm,
} from './common/actions.ts';
import { checkGHCLIAvailability, checkPresenceInRegistries } from './common/checks';

export default async function autoSubmit() {
  await checkGHCLIAvailability();

  const packageJson = Bun.file('./package.json');

  if (!(await packageJson.exists())) {
    printError('You need to run the command inside the library repository, where `package.json` file is located');
    process.exit(1);
  }

  const packageJsonContent = await packageJson.json();
  const packageName = packageJsonContent.name;

  console.log(`Starting process to submit \`${packageName}\` to the directory`);

  await checkPresenceInRegistries(packageName);

  if (packageJsonContent.private) {
    printError('You cannot submit package which is marked as private');
    process.exit(1);
  }

  const repositoryData: PackageJsonRepository = packageJsonContent.repository;

  if (!repositoryData) {
    printError(
      'You need to define the repository data inside `package.json` file, see: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#repository'
    );
    process.exit(1);
  }

  const repositoryUrl = parseRepositoryData(repositoryData);

  if (!repositoryUrl) {
    printError(`Invalid repository URL (${repositoryUrl}), see: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#repository`);
    process.exit(1);
  }

  const { repoName, repoOwner } = parseGitHubUrl(repositoryUrl);
  try {
    await $`gh repo view ${repoOwner}/${repoName}`.quiet();
  } catch (error) {
    if (error instanceof $.ShellError) {
      console.error(error.stderr.toString().replace('GraphQL: ', '').replace('gh: ', '').trim());
      printError('Make sure that provided URL is correct, repository exist and is publicly available');
      process.exit(1);
    }
  }

  const hasPluginFile = await Bun.file('app.plugin.js').exists();

  // TODO: cleanup and improve entry
  const packageEntry: LibraryDataEntryType = {
    githubUrl: repositoryUrl,
    examples: directoryExist('example') ? [`${repositoryUrl}/tree/HEAD/example`] : undefined,
    configPlugin: hasPluginFile ? true : undefined,
    ios: directoryExist('ios') || directoryExist('apple'),
    android: directoryExist('android'),
    macos: directoryExist('macos') || directoryExist('apple'),
    tvos: directoryExist('tvos') || directoryExist('apple'),
    windows: directoryExist('windows'),
  };
  const wellFormattedPackageEntry = JSON.parse(JSON.stringify(packageEntry));

  printSummaryAndConfirm(wellFormattedPackageEntry);

  console.log('');

  const forkRepo = await forkRNDRepo();
  const branchName = `add-${packageName}`;

  await createBranchInFork(forkRepo, branchName);

  const librariesArray = await fetchLibrariesFromForkBranch(forkRepo, branchName);
  const librayIndex = librariesArray.findIndex(({ githubUrl }) => githubUrl === repositoryUrl);

  if (librayIndex !== -1) {
    console.log(`Replacing already existing entry in the definitions file on the branch`);
    librariesArray[librayIndex] = JSON.parse(JSON.stringify(wellFormattedPackageEntry));
  } else {
    librariesArray.push(JSON.parse(JSON.stringify(wellFormattedPackageEntry)));
  }

  const message = librayIndex === -1 ? `Add ${packageName} to the directory` : `Update ${packageName} entry`;

  await createAndPushCommit(forkRepo, branchName, librariesArray, message);

  console.log('');

  await createPRForRND(forkRepo, branchName, message, packageName, repositoryUrl);
}
