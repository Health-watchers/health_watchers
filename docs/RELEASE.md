# Release Process

Health Watchers uses [Changesets](https://github.com/changesets/changesets) for automated versioning and release management. This ensures consistent semantic versioning across all packages in our monorepo.

## Versioning Policy

We follow [Semantic Versioning](https://semver.org/).

- **Major**: Breaking changes.
- **Minor**: New features, backward-compatible.
- **Patch**: Bug fixes, backward-compatible.

## Automated Release Workflow

1. **Development**: Create a branch and implement your changes (feature/fix/etc.).
2. **Changeset**: Run `npx changeset` to create a changeset file in the `.changeset` directory. This file describes the change and its impact (patch/minor/major) on the relevant packages.
3. **Commit**: Commit the changeset file along with your code changes using Conventional Commits.
4. **Pull Request**: Open a PR with your changes.
5. **Merge**: Once approved, merge into `main`.
6. **Automated Release**: The CI/CD pipeline on `main` will:
   - Detect the new changeset(s).
   - Automatically open a PR ("chore: version packages") that updates versions and the `CHANGELOG.md`.
   - Once that PR is merged, the pipeline will publish the new versions to npm (if applicable) and create a GitHub release.

## How to add a changeset

Run the following command in your terminal:

```bash
npx changeset
```

Follow the interactive prompts to:
- Select the package(s) affected.
- Specify the type of change (patch/minor/major).
- Write a summary of the change.

## CI/CD Pipeline

The release process is fully automated in `.github/workflows/release.yml`. Maintainers do not need to manually publish packages.
