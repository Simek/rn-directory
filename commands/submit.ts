import { $ } from 'bun';

import { type LibraryDataEntryType } from '~/types.ts';
import { getNewArchitectureValue, parseGitHubUrl, supportPrompt } from '~/utils';

import { createAndPushCommit, createBranchInFork, createPRForRND, fetchLibrariesFromForkBranch, forkRNDRepo } from './common/actions.ts';
import { checkGHCLIAvailability, checkPresenceInRegistries } from './common/checks';

export default async function submit() {
  await checkGHCLIAvailability();

  console.log("Let's geather the information needed to submit new package to the directory:");

  const repositoryUrl = prompt('• GitHub URL:')?.trim().toLowerCase();

  if (!repositoryUrl || repositoryUrl.includes(' ')) {
    console.error('Incorrect GitHub repository URL. Valid formats are:');
    console.error('- https://github.com/<OWNER>/<REPOSITORY>');
    console.error('- https://github.com/<OWNER>/<REPOSITORY>/tree/<BRANCH>/<PATH_TO_PACKAGE> (in monorepos)');
    // TODO: support shorthand
    // console.error('- <OWNER>/<REPOSITORY> (shorthand)');
    process.exit(1);
  }

  const { repoName, repoOwner, packagePath, isMonorepo } = parseGitHubUrl(repositoryUrl);
  let packageJsonResponse;

  try {
    if (isMonorepo) {
      packageJsonResponse =
        await $`gh api /repos/${repoOwner}/${repoName}/contents/${packagePath.slice(1)}package.json -q .content`.quiet();
    } else {
      packageJsonResponse = await $`gh api /repos/${repoOwner}/${repoName}/contents/package.json -q .content`.quiet();
    }
  } catch (error) {
    if (error instanceof $.ShellError) {
      console.error(error.stderr.toString().replace('GraphQL: ', '').replace('gh: ', ''));
      console.error('Make sure that repository exist and is publicly available');
      process.exit(1);
    }
  }

  if (!packageJsonResponse) {
    console.error('Cannot fetch `package.json` file from the repository');
    process.exit(1);
  }

  const packageJsonContent = JSON.parse(atob(packageJsonResponse.text()));

  if (packageJsonContent.private) {
    console.error('You cannot submit package which is marked as private');
    process.exit(1);
  }

  const packageName = prompt('• Package name:', packageJsonContent.name)?.trim().toLowerCase();

  if (!packageName || packageName.includes(' ')) {
    console.error('Incorrect package name');
    process.exit(1);
  }

  await checkPresenceInRegistries(packageName);

  // TODO: validate examples links
  const examples = prompt('• Examples list: (separate multiple URLs with comma)')?.trim().toLowerCase();
  const examplesList = examples?.split(',');

  // TODO: support New Architecture note
  const newArch = prompt('• Supports New Architecture? (y/n/untested/only)')?.trim().toLowerCase();

  if (!newArch || !['y', 'yes', 'n', 'no', 'untested', 'only'].includes(newArch)) {
    console.error('Incorrect New Architecture support status');
    process.exit(1);
  }

  const android = supportPrompt('Android');
  const ios = supportPrompt('iOS');
  const web = supportPrompt('Web');
  const macos = supportPrompt('macOS');
  const tvos = supportPrompt('tvOS');
  const visionos = supportPrompt('visionOS');
  const windows = supportPrompt('Windows');

  const expoGo = supportPrompt('Expo Go', 'Is compatible with');
  const fireos = supportPrompt('Amazon Fire OS', 'Is compatible with');
  const horizon = supportPrompt('Meta Horizon OS', 'Is compatible with');
  // TODO: support passing URL to fork package
  const vegaos = supportPrompt('Vega OS', 'Is compatible with');

  console.log('');

  const forkRepo = await forkRNDRepo();
  const branchName = `add-${packageName}`;

  await createBranchInFork(forkRepo, branchName);

  const librariesArray = await fetchLibrariesFromForkBranch(forkRepo, branchName);

  const isLibraryAlreadyPresent = librariesArray.some(({ githubUrl }) => githubUrl === repositoryUrl);

  if (isLibraryAlreadyPresent) {
    console.warn(`Skipping adding package since it already exist in the definitions file on the branch`);
  } else {
    // TODO: support images
    // TODO: support config plugin
    const packageEntry: LibraryDataEntryType = {
      githubUrl: repositoryUrl,
      npmPkg: repositoryUrl.split('/').at(-1) !== packageName ? packageName : undefined,
      examples: examplesList,
      newArchitecture: getNewArchitectureValue(newArch),
      ios: ['y', 'yes'].includes(ios) ? true : undefined,
      android: ['y', 'yes'].includes(android) ? true : undefined,
      web: ['y', 'yes'].includes(web) ? true : undefined,
      macos: ['y', 'yes'].includes(macos) ? true : undefined,
      tvos: ['y', 'yes'].includes(tvos) ? true : undefined,
      visionos: ['y', 'yes'].includes(visionos) ? true : undefined,
      windows: ['y', 'yes'].includes(windows) ? true : undefined,
      expoGo: ['y', 'yes'].includes(expoGo) ? true : undefined,
      fireos: ['y', 'yes'].includes(fireos) ? true : undefined,
      horizon: ['y', 'yes'].includes(horizon) ? true : undefined,
      vegaos: ['y', 'yes'].includes(vegaos) ? true : undefined,
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
