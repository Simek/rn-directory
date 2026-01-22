import { cancel, intro, isCancel, log, multiselect, select, spinner, text } from '@clack/prompts';
import { $ } from 'bun';

import { type LibraryDataEntryType } from '~/types.ts';
import { getConfigPluginValue, getNewArchitectureValue, isValidGHUrl, isValidImageUrl, isValidUrl, parseGitHubUrl } from '~/utils';

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

  intro("👋  Let's gather the information needed to submit new package to https://reactnative.directory/");

  let repositoryUrl = await text({
    message: 'GitHub URL:',
    validate(value) {
      if (value.length === 0) {
        return `GitHub URL is required`;
      } else if (value.includes(' ') || (value.includes('://') && !isValidGHUrl(value))) {
        return `Incorrect GitHub repository URL. Valid formats are:
          - https://github.com/<OWNER>/<REPOSITORY>
          - https://github.com/<OWNER>/<REPOSITORY>/tree/<BRANCH>/<PATH_TO_PACKAGE> (in monorepos)
          - <OWNER>/<REPOSITORY> (shorthand)
        `;
      }
    },
  });

  if (isCancel(repositoryUrl)) {
    cancel('Submission cancelled.');
    process.exit(0);
  }

  if (!repositoryUrl.includes('://')) {
    repositoryUrl = `https://github.com/${repositoryUrl}`;
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
      log.error(error.stderr.toString().replace('GraphQL: ', '').replace('gh: ', '').trim());
      cancel('Make sure that provided URL is correct, repository exist and is publicly available.');
      process.exit(1);
    }
  }

  if (!packageJsonResponse) {
    cancel('Cannot fetch `package.json` file from the repository.');
    process.exit(1);
  }

  const packageJsonContent = JSON.parse(atob(packageJsonResponse.text()));

  if (packageJsonContent.private) {
    cancel('You cannot submit package which is marked as private.');
    process.exit(1);
  }

  const packageName = await text({
    message: 'Package name:',
    placeholder: packageJsonContent.name,
    defaultValue: packageJsonContent.name,
    validate(value) {
      if (!packageJsonContent.name && value.length === 0) {
        return `Package name is required`;
      } else if (value.includes(' ')) {
        // TODO: better package name validation
        return `Incorrect package name.`;
      }
    },
  });

  if (isCancel(packageName)) {
    cancel('Submission cancelled.');
    process.exit(0);
  }

  await checkPresenceInRegistries(packageName);

  const examples = await text({
    message: 'Examples URL list:',
    placeholder: 'separate multiple URLs with comma',
    validate(value) {
      if (!value || value.length === 0) {
        return;
      }
      const examplesList = value.split(',');
      if (examplesList && examplesList.length > 0) {
        const invalidExampleUrls = examplesList.filter(exampleUrl => !isValidUrl(exampleUrl));
        if (invalidExampleUrls.length > 0) {
          return 'The following example URLs are invalid:\n- ' + invalidExampleUrls.join('\n - ');
        }
      }
    },
  });

  if (isCancel(examples)) {
    cancel('Submission cancelled.');
    process.exit(0);
  }

  const examplesList = examples?.split(',');

  const images = await text({
    message: 'Images URL list:',
    placeholder: 'separate multiple URLs with comma, no marketing materials',
    validate(value) {
      if (!value || value.length === 0) {
        return;
      }
      const imagesList = value.split(',');
      if (imagesList && imagesList.length > 0) {
        const invalidImageUrls = imagesList.filter(imageUrl => !isValidImageUrl(imageUrl));
        if (invalidImageUrls.length > 0) {
          return 'The following image URLs are invalid:\n- ' + invalidImageUrls.join('\n - ');
        }
      }
    },
  });

  if (isCancel(images)) {
    cancel('Submission cancelled.');
    process.exit(0);
  }

  const imagesList = images?.split(',');

  // TODO: support New Architecture note
  const newArch = await select({
    message: 'Supports New Architecture?',
    initialValue: 'untested',
    options: [
      { value: 'untested', label: 'Untested' },
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'only', label: 'Only for New Architecture' },
    ],
  });

  if (isCancel(newArch)) {
    cancel('Submission cancelled.');
    process.exit(0);
  }

  const configPlugin = await select({
    message: 'Includes Expo config plugin?',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' },
      { value: 'separate', label: 'Outside package repository', hint: 'You would need to provide the URL in next step' },
    ],
  });

  if (isCancel(configPlugin)) {
    cancel('Submission cancelled.');
    process.exit(0);
  }

  let configPluginUrl;
  if (configPlugin === 'separate') {
    configPluginUrl = await text({
      message: 'Config plugin repository URL:',
      validate(value) {
        if (value.length === 0) {
          return `Config plugin repository is required.`;
        } else if (!isValidGHUrl(value)) {
          return `Incorrect repository URL.`;
        }
      },
    });

    if (isCancel(configPluginUrl)) {
      cancel('Submission cancelled.');
      process.exit(0);
    }
  }

  const platforms = await multiselect({
    message: 'Supported platforms:',
    options: [
      { value: 'android', label: 'Android' },
      { value: 'ios', label: 'iOS' },
      { value: 'web', label: 'Web' },
      { value: 'macos', label: 'macOS', hint: 'Out-of-tree platform' },
      { value: 'tvos', label: 'tvOS', hint: 'Out-of-tree platform' },
      { value: 'visionos', label: 'visionOS', hint: 'Out-of-tree platform' },
      { value: 'windows', label: 'Windows', hint: 'Out-of-tree platform' },
    ],
    required: true,
  });

  if (isCancel(platforms)) {
    cancel('Submission cancelled.');
    process.exit(0);
  }

  // TODO: support passing package name of fork package for Vega
  const compatibility = await multiselect({
    message: 'Package compatibility:',
    options: [
      { value: 'expoGo', label: 'Expo Go' },
      { value: 'fireos', label: 'Amazon Fire OS' },
      { value: 'horizon', label: 'Meta Horizon OS' },
      { value: 'vegaos', label: 'Vega OS' },
    ],
    required: true,
  });

  if (isCancel(compatibility)) {
    cancel('Submission cancelled.');
    process.exit(0);
  }

  // TODO: support images
  const packageEntry: LibraryDataEntryType = {
    githubUrl: repositoryUrl,
    npmPkg: repositoryUrl.split('/').at(-1) !== packageName ? packageName : undefined,
    examples: examplesList,
    images: imagesList,
    newArchitecture: getNewArchitectureValue(newArch),
    configPlugin: getConfigPluginValue(configPluginUrl ?? configPlugin),
    ios: platforms.includes('ios') ? true : undefined,
    android: platforms.includes('android') ? true : undefined,
    web: platforms.includes('web') ? true : undefined,
    macos: platforms.includes('macos') ? true : undefined,
    tvos: platforms.includes('tvos') ? true : undefined,
    visionos: platforms.includes('visionos') ? true : undefined,
    windows: platforms.includes('windows') ? true : undefined,
    expoGo: compatibility.includes('expoGo') ? true : undefined,
    fireos: compatibility.includes('fireos') ? true : undefined,
    horizon: compatibility.includes('horizon') ? true : undefined,
    vegaos: compatibility.includes('vegaos') ? true : undefined,
  };
  const wellFormattedPackageEntry = JSON.parse(JSON.stringify(packageEntry));

  await printSummaryAndConfirm(wellFormattedPackageEntry);

  const forkingProgress = spinner();
  forkingProgress.start('Forking repository');

  const forkRepo = await forkRNDRepo();

  forkingProgress.stop('Repository has been forked');

  const branchProgress = spinner();
  branchProgress.start('Creating branch in the fork');

  const branchName = `add-${packageName}`;
  await createBranchInFork(forkRepo, branchName);

  branchProgress.stop('Branch created in the fork');

  const commitProgress = spinner();
  commitProgress.start('Creating commit and pushing');

  const librariesArray = await fetchLibrariesFromForkBranch(forkRepo, branchName);
  const libraryIndex = librariesArray.findIndex(({ githubUrl }) => githubUrl === repositoryUrl);

  if (libraryIndex !== -1) {
    log.warn(`Replacing already existing entry in the definitions file on the branch`);
    librariesArray[libraryIndex] = wellFormattedPackageEntry;
  } else {
    librariesArray.push(JSON.parse(JSON.stringify(wellFormattedPackageEntry)));
  }

  const message = libraryIndex === -1 ? `Add ${packageName} to the directory` : `Update ${packageName} entry`;

  await createAndPushCommit(forkRepo, branchName, librariesArray, message);

  commitProgress.stop('Commit created and pushed');

  const prProgress = spinner();
  prProgress.start('Creating PR in React Native Directory repository');

  await createPRForRND(forkRepo, branchName, message, packageName, repositoryUrl);

  prProgress.stop('PR in React Native Directory has been created, thanks!');
}
