# Changesets

This folder contains changeset files that describe changes to be included in the next release.

## What are changesets?

Changesets are a way to manage versioning and changelogs with a focus on monorepos. Each changeset is a markdown file that describes changes made in a pull request.

## How to create a changeset

When you make changes that should be included in the changelog:

```bash
npm run changeset
```

This will prompt you to:
1. Select which packages have changed
2. Choose the type of version bump (major, minor, patch)
3. Write a summary of your changes

## Changeset workflow

1. Developer creates a changeset when making user-facing changes
2. Changeset files are committed with the PR
3. When merged to main, changesets accumulate
4. A bot creates a "Version Packages" PR that:
   - Bumps versions according to changesets
   - Updates CHANGELOG.md
   - Removes consumed changeset files
5. When the Version Packages PR is merged, releases are published

## Learn more

- [Changesets documentation](https://github.com/changesets/changesets)
- [Conventional Commits](https://www.conventionalcommits.org/)
