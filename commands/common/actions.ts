import { $ } from 'bun';

import { type LibraryDataEntryType } from '~/types.ts';
import { printError } from '~/utils.ts';

import { BASE_REPO, LIBRARIES_FILE, OXFMT_TMP_CONFIG } from './constants';

export async function forkRNDRepo() {
  const forkCreationResult = await $`gh repo fork ${BASE_REPO} --clone=false --default-branch-only`;

  let forkRepo;

  if (forkCreationResult.stderr.toString().length > 0) {
    forkRepo = forkCreationResult.stderr.toString().match(/([^/\s]+\/[^/\s]+)(?=\s+already exists\b)/)?.[1] ?? undefined;
  } else if (forkCreationResult.stdout.toString().length > 0) {
    forkRepo = forkCreationResult.stdout.toString().match(/(?<=Created fork\s)([^/\s]+\/[^/\s]+)/)?.[1] ?? undefined;
  }

  if (!forkRepo) {
    printError(`Cannot extract fork name from the GitHub CLI command output`);
    process.exit(1);
  }

  return forkRepo;
}

export async function createBranchInFork(forkRepo: string, branchName: string) {
  const forkSHA = (await $`gh api repos/${forkRepo}/git/ref/heads/main -q .object.sha`.text()).trim();

  try {
    await $`gh api repos/${forkRepo}/git/refs -f ref="refs/heads/${branchName}" -f sha="${forkSHA}"`.quiet();
  } catch (error) {
    if (error instanceof $.ShellError) {
      if (error.stderr.toString().includes('HTTP 422')) {
        console.warn(`Branch ${branchName} already exist in ${forkRepo}`);
      } else {
        printError(`Branch creation failed with code ${error.exitCode}`);
        console.error(error.stderr.toString());
        process.exit(1);
      }
    } else {
      console.error(error);
      process.exit(1);
    }
  }
}

export async function fetchLibrariesFromForkBranch(forkRepo: string, branchName: string) {
  const librariesJsonContent = await $`gh api repos/${forkRepo}/contents/${LIBRARIES_FILE}?ref=${branchName} -q .content`.text();
  return JSON.parse(atob(librariesJsonContent)) as LibraryDataEntryType[];
}

export function printSummaryAndConfirm(packageEntry: LibraryDataEntryType) {
  console.log('\nThe following entry will be proposed in the PR:');
  console.log(packageEntry);

  const continueAnswer = prompt('\nWould you like to continue the process? (y/n)')?.trim().toLowerCase();

  if (!continueAnswer || !['y', 'yes'].includes(continueAnswer)) {
    printError('Submitting aborted on user request');
    process.exit(1);
  }
}

export async function createAndPushCommit(forkRepo: string, branchName: string, librariesArray: LibraryDataEntryType[], message: string) {
  const librariesJsonSHA = (await $`gh api repos/${forkRepo}/contents/${LIBRARIES_FILE}?ref=${branchName} -q .sha`.text()).trim();

  await Bun.write(LIBRARIES_FILE, JSON.stringify(librariesArray, null, 2));
  await Bun.write(OXFMT_TMP_CONFIG, JSON.stringify({}));

  await $`bunx --silent oxfmt@latest ${LIBRARIES_FILE} -c ${OXFMT_TMP_CONFIG}`;

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

  const tempOxfmtConfig = Bun.file(OXFMT_TMP_CONFIG);
  await tempOxfmtConfig.delete();

  const tempCommitFile = Bun.file('commit.json');
  await tempCommitFile.delete();
}

export async function createPRForRND(forkRepo: string, branchName: string, message: string, packageName: string, repositoryUrl: string) {
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

  await $`gh pr create -R ${BASE_REPO} --head ${forkRepo.split('/')[0]}:${branchName} --base main --title "${message}" --body-file pr.md`;

  const tempPRBodyFile = Bun.file('pr.md');
  await tempPRBodyFile.delete();
}
