# Dev Container Configuration

This directory contains the configuration for GitHub Codespaces and VS Code Dev Containers.

## Features

✅ **Pre-configured Environment**
- Node.js 20 (LTS)
- Docker-in-Docker support
- GitHub CLI
- Zsh with Oh My Zsh

✅ **VS Code Extensions**
- ESLint & Prettier
- Tailwind CSS IntelliSense
- Playwright & Jest test runners
- Docker & Kubernetes tools
- MongoDB support
- GitLens & GitHub integration

✅ **Automatic Setup**
- `npm ci` installs dependencies
- `.env` created from template
- Docker Compose starts core services (API, web, MongoDB, Redis)
- Git hooks installed
- Port forwarding configured

✅ **Pre-configured Port Forwarding**
- 3000 (Web UI) - auto-notifies on forward
- 3001 (API) - silent forward
- 3002 (Stellar Service)
- 27017 (MongoDB)
- 6379 (Redis)
- 16686 (Jaeger UI)
- And more...

## Using GitHub Codespaces

### Quick Start

1. Click "Code" → "Codespaces" → "Create codespace on main"
2. Wait for the environment to build (~3-5 minutes first time)
3. Once ready, the postCreate script runs automatically
4. Start developing immediately!

### Starting the Application

The post-create script starts Docker services automatically. To start the development servers:

```bash
# Terminal 1: Start API
npm run dev --workspace=api

# Terminal 2: Start web app
npm run dev --workspace=web
```

Access the app at the forwarded ports (VS Code will show notifications).

### Managing Docker Services

```bash
# View running services
docker compose ps

# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop services
docker compose --profile core down

# Start with additional profiles
docker compose --profile core --profile dev-tools up -d
```

### Updating Dependencies

```bash
# Install new dependency in API
npm install <package> --workspace=api

# Update all dependencies
npm update
```

## Using Local Dev Containers

### Prerequisites

- Docker Desktop
- VS Code with "Dev Containers" extension

### Opening in Dev Container

1. Open the repository in VS Code
2. Press `F1` → "Dev Containers: Reopen in Container"
3. Wait for container to build
4. Start developing!

## Customization

### Adding VS Code Extensions

Edit `.devcontainer/devcontainer.json`:

```json
{
  "customizations": {
    "vscode": {
      "extensions": [
        "your.extension-id"
      ]
    }
  }
}
```

### Adding System Packages

Add a `features` entry:

```json
{
  "features": {
    "ghcr.io/devcontainers/features/your-feature:1": {}
  }
}
```

### Modifying Post-Create Script

Edit `.devcontainer/postCreate.sh` to add custom setup steps.

## Troubleshooting

### MongoDB Won't Start

```bash
# Check MongoDB logs
docker compose logs mongodb

# Restart MongoDB
docker compose restart mongodb

# Or recreate from scratch
docker compose down
docker compose --profile core up -d
```

### Ports Already in Use

If ports are already bound, find and kill the process:

```bash
# Linux/macOS
lsof -ti:3000 | xargs kill -9

# Or change ports in docker-compose.yml
```

### Dependencies Out of Sync

```bash
# Clean install
rm -rf node_modules package-lock.json
npm ci

# Or in specific workspace
npm ci --workspace=api
```

### Docker Issues

```bash
# Restart Docker daemon
sudo systemctl restart docker  # Linux
# Or restart Docker Desktop (macOS/Windows)

# Clean Docker system
docker system prune -a
```

## Performance Tips

### Codespaces

- Use a larger machine type for faster builds (Settings → Machine type)
- Enable prebuilds for instant startup (Repository → Codespaces → Set up prebuild)
- Keep Codespaces running during active development
- Use `docker compose --profile core` only (avoid starting all profiles)

### Local Dev Containers

- Allocate more resources to Docker Desktop (Preferences → Resources)
- Use volume mounts carefully (performance impact on macOS/Windows)
- Consider using named volumes for node_modules

## Links

- [Dev Containers Documentation](https://code.visualstudio.com/docs/devcontainers/containers)
- [GitHub Codespaces Documentation](https://docs.github.com/en/codespaces)
- [Dev Container Features](https://containers.dev/features)
