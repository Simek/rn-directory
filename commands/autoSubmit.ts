import { $ } from 'bun';

import { type LibraryDataEntryType, type PackageJsonRepository } from '~/types';
import { directoryExist, parseGitHubUrl, parseRepositoryData } from '~/utils';

import { createAndPushCommit, createBranchInFork, createPRForRND, fetchLibrariesFromForkBranch, forkRNDRepo } from './common/actions.ts';
import { checkGHCLIAvailability, checkPresenceInRegistries } from './common/checks';

export default async function autoSubmit() {
  await checkGHCLIAvailability();

  const packageJson = Bun.file('./package.json');

  if (!(await packageJson.exists())) {
    console.error('You need to run the command inside the library repository, where `package.json` file is located');
    process.exit(1);
  }

  const packageJsonContent = await packageJson.json();
  const packageName = packageJsonContent.name;

  console.log(`Starting process to submit \`${packageName}\` to the directory`);

  await checkPresenceInRegistries(packageName);

  if (packageJsonContent.private) {
    console.error('You cannot submit package which is marked as private');
    process.exit(1);
  }

  const repositoryData: PackageJsonRepository = packageJsonContent.repository;

  if (!repositoryData) {
    console.error(
      'You need to define the repository data inside `package.json` file, see: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#repository'
    );
    process.exit(1);
  }

  const repositoryUrl = parseRepositoryData(repositoryData);

  if (!repositoryUrl) {
    console.error(`Invalid repository URL (${repositoryUrl}), see: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#repository`);
    process.exit(1);
  }

  const { repoName, repoOwner } = parseGitHubUrl(repositoryUrl);
  try {
    await $`gh repo view ${repoOwner}/${repoName}`.quiet();
  } catch (error) {
    if (error instanceof $.ShellError) {
      console.error(error.stderr.toString().replace('GraphQL: ', '').replace('gh: ', ''));
      console.error('Make sure that provided URL is correct, repository exist and is publicly available');
      process.exit(1);
    }
  }

  console.log('');

  const forkRepo = await forkRNDRepo();
  const branchName = `add-${packageName}`;

  await createBranchInFork(forkRepo, branchName);

  const librariesArray = await fetchLibrariesFromForkBranch(forkRepo, branchName);

  const isLibraryAlreadyPresent = librariesArray.some(({ githubUrl }) => githubUrl === repositoryUrl);

  if (isLibraryAlreadyPresent) {
    console.warn(`Skipping adding package since it already exist in the definitions file on the branch`);
  } else {
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

    librariesArray.push(JSON.parse(JSON.stringify(packageEntry)));
  }

  console.log('\nThe following entry will be proposed in the PR:');
  console.log(librariesArray.find(({ githubUrl }) => githubUrl === repositoryUrl));

  const continueAnswer = prompt('\nWould you like to continue the process? (y/n)')?.trim().toLowerCase();

  if (!continueAnswer || !['y', 'yes'].includes(continueAnswer)) {
    console.warn('Submitting aborted on user request');
    process.exit(1);
  }

  const message = `Add ${packageName} to the directory`;

  if (!isLibraryAlreadyPresent) {
    await createAndPushCommit(forkRepo, branchName, librariesArray, message);
  }

  await createPRForRND(forkRepo, branchName, message, packageName, repositoryUrl);
}
