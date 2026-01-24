# rnd-cli

Propose new entries to [React Native Directory](https://reactnative.directory) directly from your terminal.

The `rnd-cli` CLI gathers the required information manually or automatically, creates a fork, and opens a pull request on behalf of the user currently logged in to the GitHub CLI.

## Prerequisites

- Bun
- GitHub CLI

## Usage

```sh
bunx rnd-cli submit # manually enter package data
# OR
bunx rnd-cli autoSubmit # create entry automatically for the package in current directory
```

## Development

```sh
bun install
bun link
```
