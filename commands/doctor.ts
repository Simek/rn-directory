import { cancel, intro, note, outro } from '@clack/prompts';
import { blue, bold, gray, green, red, yellow } from 'picocolors';
import parseSpdxExpression from 'spdx-expression-parse';

import { type PackageJsonRepository } from '../types.ts';
import { checkIsPackagePrivate, fileExist, isValidGHUrl, parseRepositoryData } from '../utils.ts';

type PackageJsonValue = string | number | boolean | null | PackageJsonValue[] | PackageJsonObject;
type PackageJsonObject = { [key: string]: PackageJsonValue };
type DoctorCheck = { field: string; valid: boolean; expectation: string };

function isRecord(value: PackageJsonValue): value is PackageJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatChecks(checks: DoctorCheck[], type: 'field' | 'file') {
  return checks
    .map(check => {
      const icon = check.valid ? '✓' : '×';
      const status = check.valid
        ? 'present and valid'
        : `missing${type === 'field' ? ' or invalid, expected' : ','} ${check.expectation}`;

      return `${icon} ${bold(check.field)} ${type} is ${status}.`;
    })
    .join('\n');
}

function isPackageJsonRepository(value?: PackageJsonValue): value is PackageJsonRepository {
  if (typeof value === 'string') {
    return true;
  }

  return (
    value !== undefined &&
    isRecord(value) &&
    value.type === 'git' &&
    typeof value.url === 'string' &&
    (value.directory === undefined || typeof value.directory === 'string')
  );
}

function hasValidRepository(value?: PackageJsonValue) {
  if (!isPackageJsonRepository(value)) {
    return false;
  }

  const repositoryData = typeof value === 'string' && /^[^/]+\/[^/]+$/.test(value) ? `github:${value}` : value;
  const { repositoryUrl, repositoryError } = parseRepositoryData(repositoryData);

  return !repositoryError && !!repositoryUrl && isValidGHUrl(repositoryUrl);
}

async function hasValidLicense(value?: PackageJsonValue) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  const license = value.trim();
  if (license === 'UNLICENSED') {
    return true;
  }

  const customLicense = /^SEE LICENSE IN ([^/\\]+)$/.exec(license);
  const customLicenseFilename = customLicense?.[1];

  if (customLicenseFilename !== undefined) {
    return (
      customLicenseFilename !== '.' &&
      customLicenseFilename !== '..' &&
      (await Bun.file(customLicenseFilename).exists())
    );
  }

  try {
    parseSpdxExpression(license);
    return true;
  } catch {
    return false;
  }
}

export default async function doctor() {
  intro(`${blue('React Native Directory CLI')} ${blue(bold('[doctor]'))}`);

  const packageJson = Bun.file('./package.json');

  if (!(await packageJson.exists())) {
    cancel(`You need to run the command inside the library repository, where ${bold('package.json')} file is located.`);
    process.exit(1);
  }

  const packageJsonContent: PackageJsonValue = await packageJson.json();

  if (!isRecord(packageJsonContent)) {
    cancel(`${bold('package.json')} must contain a JSON object.`);
    process.exit(1);
  }

  checkIsPackagePrivate(packageJsonContent.private === true);

  const packageChecks = [
    {
      field: 'description',
      valid: typeof packageJsonContent.description === 'string' && packageJsonContent.description.trim().length > 0,
      expectation: 'a non-empty string',
    },
    {
      field: 'keywords',
      valid:
        Array.isArray(packageJsonContent.keywords) &&
        packageJsonContent.keywords.length > 0 &&
        packageJsonContent.keywords.every(
          (keyword: PackageJsonValue) => typeof keyword === 'string' && keyword.trim() !== ''
        ),
      expectation: 'a non-empty array of non-empty strings',
    },
    {
      field: 'repository',
      valid: hasValidRepository(packageJsonContent.repository),
      expectation: 'a valid GitHub repository URL or owner/repository shorthand',
    },
    {
      field: 'license',
      valid: await hasValidLicense(packageJsonContent.license),
      expectation: 'a valid SPDX expression or an existing top-level file via "SEE LICENSE IN <filename>"',
    },
  ];
  const fileChecks = [
    {
      field: 'README.md',
      valid: fileExist('README.md'),
      expectation: 'an existing README.md file',
    },
    {
      field: 'CONTRIBUTING.md',
      valid: fileExist('CONTRIBUTING.md'),
      expectation: 'consider adding it',
    },
    {
      field: 'AGENTS.md',
      valid: fileExist('AGENTS.md'),
      expectation: 'consider adding it',
    },
  ];

  note(formatChecks(packageChecks, 'field'), 'package.json checks', {
    format: (line: string) => (line.startsWith('✓') ? green(line) : red(line)),
  });
  note(formatChecks(fileChecks, 'file'), 'Files checks', {
    format: (line: string) => (line.startsWith('✓') ? green(line) : gray(line)),
  });

  const allChecksPassed = packageChecks.every(check => check.valid);
  outro(
    allChecksPassed
      ? green('All package doctor checks passed.')
      : yellow('Package doctor checks found issues, see the failed checks above.')
  );

  if (!allChecksPassed) {
    process.exitCode = 1;
  }
}
