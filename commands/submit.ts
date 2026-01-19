import { $ } from 'bun';

import { type LibraryDataEntryType, type PackageJsonRepository } from '~/types';
import { checkGHCLIAvailability, checkPresenceInRegistries, directoryExist, parseRepositoryData } from '~/utils';

const BASE_REPO = 'react-native-community/directory';
const LIBRARIES_FILE = 'react-native-libraries.json';

export default async function submit() {
  await checkGHCLIAvailability();

  const packageJson = Bun.file('./package.json');

  if (!(await packageJson.exists())) {
    console.error('You need to run the command inside the library repository, where `package.json` file is located');
    process.exit(1);
  }

  const packageJsonContent = await packageJson.json();
  const packageName = packageJsonContent.name;

  await checkPresenceInRegistries(packageName);

  if (packageJsonContent.private) {
    console.error('You cannot submit package which is marked as private');
    process.exit(1);
  }

  const repositoryData: PackageJsonRepository = packageJsonContent.repository;

  // TODO: validate repo existence
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

  const forkCreationResult = await $`gh repo fork ${BASE_REPO} --clone=false --default-branch-only`;

  let forkRepo;

  if (forkCreationResult.stderr.toString().length > 0) {
    forkRepo = forkCreationResult.stderr.toString().match(/([^/\s]+\/[^/\s]+)(?=\s+already exists\b)/)?.[1] ?? undefined;
  } else if (forkCreationResult.stdout.toString().length > 0) {
    forkRepo = forkCreationResult.stdout.toString().match(/(?<=Created fork\s)([^/\s]+\/[^/\s]+)/)?.[1] ?? undefined;
  }

  if (!forkRepo) {
    console.error(`Cannot extract fork name from the GitHub CLI command output`);
    process.exit(1);
  }

  const forkSHA = (await $`gh api repos/${forkRepo}/git/ref/heads/main -q .object.sha`.text()).trim();

  const branchName = `add-${packageName}`;
  const message = `Add ${packageName} to the directory`;

  try {
    await $`gh api repos/${forkRepo}/git/refs -f ref="refs/heads/${branchName}" -f sha="${forkSHA}"`.quiet();
  } catch (error) {
    if (error instanceof $.ShellError) {
      if (error.stderr.toString().includes('HTTP 422')) {
        console.warn(`Branch ${branchName} already exist in ${forkRepo}`);
      } else {
        console.error(`Branch creation failed with code ${error.exitCode}`);
        console.error(error.stderr.toString());
        process.exit(1);
      }
    } else {
      console.error(error);
      process.exit(1);
    }
  }

  const librariesJsonSHA = (await $`gh api repos/${forkRepo}/contents/${LIBRARIES_FILE}?ref=${branchName} -q .sha`.text()).trim();
  const librariesJsonContent = await $`gh api repos/${forkRepo}/contents/${LIBRARIES_FILE}?ref=${branchName} -q .content`.text();
  const librariesArray: LibraryDataEntryType[] = JSON.parse(atob(librariesJsonContent));
  const isLibraryAlreadyPresent = librariesArray.some(({ githubUrl }) => githubUrl === repositoryUrl);

  if (isLibraryAlreadyPresent) {
    console.warn(`Skipping adding package since it already exist in the definitions file on the branch`);
  } else {
    // TODO: cleanup and improve entry
    librariesArray.push({
      githubUrl: repositoryUrl,
      ...(directoryExist('example')
        ? {
            examples: [`${repositoryUrl}/tree/HEAD/example`],
          }
        : {}),
      ios: directoryExist('ios'),
      android: directoryExist('android'),
    });
  }

  console.log('\nThe following entry will be proposed in the PR:');
  console.log(librariesArray.find(({ githubUrl }) => githubUrl === repositoryUrl));

  const answer = prompt('Would you like to continue the process? (y/n)')?.trim().toLowerCase();
  const yes = answer === 'y' || answer === 'yes';

  if (!yes) {
    console.warn('Submitting aborted on user request.');
    process.exit(1);
  }

  if (!isLibraryAlreadyPresent) {
    await Bun.write(LIBRARIES_FILE, JSON.stringify(librariesArray, null, 2));

    await $`bunx --silent oxfmt@latest ${LIBRARIES_FILE}`;

    const tempLibrariesFile = Bun.file(LIBRARIES_FILE);

    await Bun.write(
      'commit.json',
      JSON.stringify({
        message,
        branch: branchName,
        sha: librariesJsonSHA,
        content: btoa(await tempLibrariesFile.text()),
      })
    );

    await $`gh api repos/${forkRepo}/contents/${LIBRARIES_FILE} -X PUT -H "Content-Type: application/json" --input commit.json"`.quiet();

    await tempLibrariesFile.delete();

    const tempCommitFile = Bun.file('commit.json');
    await tempCommitFile.delete();
  }

  await Bun.write(
    'pr.md',
    `# 📝 Why & how

This PR adds \`${packageName}\` (${repositoryUrl}) package to the directory.

> [!NOTE]
> This is an automatic submission created via \`rnd-cli\`.

# ✅ Checklist

- [x] Added library to **\`react-native-libraries.json\`**
`
  );

  await $`gh pr create -R ${BASE_REPO} --head ${forkRepo.split('/')[0]}:${branchName} --base main --title "${message}" --body-file pr.md"`;

  const tempPRBodyFile = Bun.file('pr.md');
  await tempPRBodyFile.delete();
}
