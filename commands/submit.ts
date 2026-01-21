import { $ } from 'bun';

import { type LibraryDataEntryType } from '~/types.ts';
import {
  getConfigPluginValue,
  getNewArchitectureValue,
  isValidGHUrl,
  isValidImageUrl,
  isValidUrl,
  parseGitHubUrl,
  printError,
  supportPrompt,
} from '~/utils';

import {
  createAndPushCommit,
  createBranchInFork,
  createPRForRND,
  fetchLibrariesFromForkBranch,
  forkRNDRepo,
  printSummaryAndConfirm,
} from './common/actions.ts';
import { checkGHCLIAvailability, checkPresenceInRegistries } from './common/checks';

export default async function submit() {
  await checkGHCLIAvailability();

  console.log("👋  Let's gather the information needed to submit new package to https://reactnative.directory/.");

  console.log('\nGeneral information:\n');

  let repositoryUrl = prompt('• GitHub URL:')?.trim().toLowerCase();

  if (!repositoryUrl || repositoryUrl.includes(' ')) {
    printError('Incorrect GitHub repository URL. Valid formats are:');
    console.error('- https://github.com/<OWNER>/<REPOSITORY>');
    console.error('- https://github.com/<OWNER>/<REPOSITORY>/tree/<BRANCH>/<PATH_TO_PACKAGE> (in monorepos)');
    console.error('- <OWNER>/<REPOSITORY> (shorthand)');
    process.exit(1);
  }

  if (!repositoryUrl.includes('://')) {
    repositoryUrl = `https://github.com/${repositoryUrl}`;
  }

  if (!isValidGHUrl(repositoryUrl)) {
    printError('Provided GitHub repository is not correct');
    process.exit(1);
  }

  const { repoName, repoOwner, packagePath, isMonorepo } = parseGitHubUrl(repositoryUrl);
  let packageJsonResponse;

  try {
    if (isMonorepo) {
      packageJsonResponse = await $`gh api /repos/${repoOwner}/${repoName}/contents/${packagePath}/package.json -q .content`.quiet();
    } else {
      packageJsonResponse = await $`gh api /repos/${repoOwner}/${repoName}/contents/package.json -q .content`.quiet();
    }
  } catch (error) {
    if (error instanceof $.ShellError) {
      console.error(error.stderr.toString().replace('GraphQL: ', '').replace('gh: ', '').trim());
      printError('Make sure that provided URL is correct, repository exist and is publicly available');
      process.exit(1);
    }
  }

  if (!packageJsonResponse) {
    printError('Cannot fetch `package.json` file from the repository');
    process.exit(1);
  }

  const packageJsonContent = JSON.parse(atob(packageJsonResponse.text()));

  if (packageJsonContent.private) {
    printError('You cannot submit package which is marked as private');
    process.exit(1);
  }

  const packageName = prompt('• Package name:', packageJsonContent.name)?.trim().toLowerCase();

  if (!packageName || packageName.includes(' ')) {
    printError('Incorrect package name');
    process.exit(1);
  }

  await checkPresenceInRegistries(packageName);

  const examples = prompt('• Examples list: (separate URLs with comma)')?.trim().toLowerCase();
  const examplesList = examples?.split(',');

  if (examplesList && examplesList.length > 0) {
    const invalidExampleUrls = examplesList.filter(exampleUrl => !isValidUrl(exampleUrl));

    if (invalidExampleUrls.length > 0) {
      printError('The following example URLs are invalid:\n' + invalidExampleUrls.join('\n'));
      process.exit(1);
    }
  }

  const images = prompt('• Images list: (separate URLs with comma, no marketing materials)')?.trim().toLowerCase();
  const imagesList = images?.split(',');

  if (imagesList && imagesList.length > 0) {
    const invalidImageUrls = imagesList.filter(imageUrl => !isValidImageUrl(imageUrl));

    if (invalidImageUrls.length > 0) {
      printError('The following image URLs are invalid:\n' + invalidImageUrls.join('\n'));
      process.exit(1);
    }
  }

  // TODO: support New Architecture note
  const newArch = prompt('• Supports New Architecture? (y/n/untested/only)', 'untested')?.trim().toLowerCase();

  if (!newArch || !['y', 'yes', 'n', 'no', 'untested', 'only'].includes(newArch)) {
    printError('Incorrect New Architecture support status');
    process.exit(1);
  }

  const configPlugin = prompt('• Includes Expo config plugin? (y/n/<GITHUB_URL>)')?.trim().toLowerCase();

  if (!configPlugin || (!['y', 'yes', 'n', 'no'].includes(configPlugin) && !isValidGHUrl(configPlugin))) {
    printError(
      'Incorrect config plugin information. If plugin is included within the package answer "yes", ot if it is located in separate repository paste the URL as an answer'
    );
    process.exit(1);
  }

  console.log('\nPlatform support:\n');

  const android = supportPrompt('Android');
  const ios = supportPrompt('iOS');
  const web = supportPrompt('Web');
  const macos = supportPrompt('macOS');
  const tvos = supportPrompt('tvOS');
  const visionos = supportPrompt('visionOS');
  const windows = supportPrompt('Windows');

  console.log('\nPackage compatibility:\n');

  const expoGo = supportPrompt('Expo Go', 'Is compatible with');
  const fireos = supportPrompt('Amazon Fire OS', 'Is compatible with');
  const horizon = supportPrompt('Meta Horizon OS', 'Is compatible with');
  // TODO: support passing package name of fork package
  const vegaos = supportPrompt('Vega OS', 'Is compatible with');

  // TODO: support images
  const packageEntry: LibraryDataEntryType = {
    githubUrl: repositoryUrl,
    npmPkg: repositoryUrl.split('/').at(-1) !== packageName ? packageName : undefined,
    examples: examplesList,
    newArchitecture: getNewArchitectureValue(newArch),
    configPlugin: getConfigPluginValue(configPlugin),
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
    librariesArray[librayIndex] = wellFormattedPackageEntry;
  } else {
    librariesArray.push(JSON.parse(JSON.stringify(wellFormattedPackageEntry)));
  }

  const message = librayIndex === -1 ? `Add ${packageName} to the directory` : `Update ${packageName} entry`;

  await createAndPushCommit(forkRepo, branchName, librariesArray, message);

  console.log('');

  await createPRForRND(forkRepo, branchName, message, packageName, repositoryUrl);
}
