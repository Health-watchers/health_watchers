# Versioning Strategy

Health Watchers follows [Semantic Versioning](https://semver.org/) (SemVer) for version numbering.

## Version Format

Versions are formatted as `MAJOR.MINOR.PATCH`:

- **MAJOR**: Incremented for incompatible API changes or breaking changes
- **MINOR**: Incremented for new features that are backward compatible
- **PATCH**: Incremented for backward compatible bug fixes

### Pre-1.0.0 Versions

During initial development (0.x.x versions):
- Breaking changes may occur in minor versions
- The API is not considered stable
- Version 1.0.0 will mark the first stable release

## Changelog Management

We use [Changesets](https://github.com/changesets/changesets) to manage versioning and changelog generation.

### Creating a Changeset

When you make changes that affect users:

```bash
npm run changeset
```

This will:
1. Prompt you to select affected packages
2. Ask for the type of change (major, minor, patch)
3. Request a description of the changes
4. Create a markdown file in `.changeset/`

### When to Create a Changeset

Create a changeset for:
- ✅ New features
- ✅ Bug fixes
- ✅ Breaking changes
- ✅ Performance improvements
- ✅ Security fixes

Skip changesets for:
- ❌ Documentation updates
- ❌ Test changes
- ❌ Internal refactoring with no user impact
- ❌ CI/CD configuration changes
- ❌ Development dependency updates

## Release Process

### Automated Release Workflow

1. **Development**: Developers create changesets with their PRs
2. **Merge to Main**: When PRs are merged, changesets accumulate
3. **Version PR**: GitHub Actions automatically creates a "Version Packages" PR that:
   - Bumps package versions based on changesets
   - Updates CHANGELOG.md
   - Removes consumed changeset files
4. **Release**: When the Version PR is merged:
   - Packages are published (if applicable)
   - GitHub Release is created
   - Release notes are generated from changelog

### Manual Release (if needed)

```bash
# Update versions and changelog
npm run version

# Commit the changes
git add .
git commit -m "chore: version packages"

# Create release
npm run release
```

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature (triggers MINOR version bump)
- `fix`: Bug fix (triggers PATCH version bump)
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test changes
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Other changes

### Breaking Changes

Indicate breaking changes with `!` after the type:

```bash
feat(api)!: change patient response structure

BREAKING CHANGE: Patient API now returns nested address object
```

This triggers a MAJOR version bump.

## Healthcare Compliance Considerations

For healthcare applications, maintaining a detailed changelog is critical for:

- **Audit Trails**: Demonstrating what changed and when
- **Compliance**: Meeting regulatory requirements (HIPAA, GDPR, etc.)
- **Security**: Tracking security fixes and updates
- **Validation**: Supporting software validation processes

### Best Practices

1. **Be Specific**: Clearly describe what changed and why
2. **Security First**: Highlight security-related changes
3. **Breaking Changes**: Always document breaking changes thoroughly
4. **Migration Guides**: Provide upgrade instructions for major versions
5. **Deprecation Notices**: Give advance warning before removing features

## Version History

- **v0.1.0** (2026-03-25): Initial release with core functionality
  - Patient management
  - Encounter tracking
  - Payment processing
  - Authentication system

## References

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Changesets Documentation](https://github.com/changesets/changesets)
