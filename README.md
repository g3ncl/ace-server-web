# ace-server-web

ace-server-web packages an Assetto Corsa EVO dedicated server running under Wine alongside a Next.js web application. The web UI lets you edit server settings, check server status, and start, stop or restart the server.

Based on [acc-server-web](https://github.com/g3ncl/acc-server-web), with EVO-specific configuration. The web UI uses Mantine v7.

## Getting started

### Prerequisites

- A Linux host with Docker or Podman.
- The Assetto Corsa EVO Dedicated Server tool installed through Steam. The game server files are mounted into the container and are not included in the image.

### Building and running

From the project directory, build the image:

```sh
docker build -t ace-server-web .
```

Run the container, replacing the server path with your Steam installation folder:

```sh
docker run -d --name ace-server-web \
  --restart unless-stopped \
  --network host \
  --security-opt label=disable \
  -v "/path/to/Assetto Corsa EVO Dedicated Server:/server:ro" \
  -v ace-data:/data \
  ace-server-web
```

The server folder must contain `AssettoCorsaEVOServer.exe` and its content files. The `ace-data` volume stores settings, backups, results and the Wine prefix, and survives container replacement.

Open http://localhost:3000. Configure the server, save, and click Start on the Status page. EVO is stopped by default when the container starts; add `-e ACE_AUTO_START=true` to enable automatic startup.

Keep the administration panel private. It binds to `127.0.0.1` by default. For remote access, use an SSH tunnel or an authenticated HTTPS reverse proxy. Set `ACE_WEB_PASSWORD` to enable HTTP Basic authentication; `ACE_WEB_USER` defaults to `admin`.

For rootless Podman, replace `docker` with `podman`. Build with `podman build --format docker -t ace-server-web .`. The `label=disable` option allows access to the Steam files on Fedora without relabeling the installation.

## Configuration

Edit settings in the web UI, then restart EVO through the Status page to apply them. The configuration uses EVO's own format; ACC configuration files cannot be imported.

You can configure practice events or race weekends, select tracks and sessions, and choose allowed cars. All installed cars includes the current catalog at each start. The car editor has search, filters and pagination for adjusting ballast and restrictors.

The panel also supports configuration import/export, logs, a local entry list, and result downloads. Leave Entry-list server URL and Results POST URL blank unless you use external services for those features.

### Ports

| Default port | Protocol | Purpose |
| --- | --- | --- |
| 3000 | TCP | Web administration, localhost only |
| 9700 | TCP and UDP | EVO game traffic |
| 8080 | TCP | EVO HTTP endpoint |

Set game TCP, game UDP and EVO HTTP ports under Configuration > Server. Save and restart EVO to apply them. Host networking lets the server use those ports directly without changing container mappings. TCP and UDP values can be set separately.

For public hosting, forward the configured game and EVO HTTP ports to the Linux host, allow them through its firewall, and enable lobby registration. Keep port 3000 private. EVO provides its own HTTP endpoint; you do not need to implement an API.

Linux startup and port binding have been tested. Internet joining still needs verification with an external game client and your network setup.

## Docker Compose

The repository includes `compose.yaml`. Copy the example environment file:

```sh
cp .env.example .env
```

Set `ACE_SERVER_DIR` in `.env` to the installed server folder, then run:

```sh
docker compose up --build -d
```

Optional settings in `.env` include `WEB_PORT`, `ACE_WEB_PASSWORD`, `ACE_WEB_USER` and `ACE_AUTO_START`. To follow logs or stop the application:

```sh
docker compose logs -f
docker compose down
```

## Releases

Push Conventional Commits to `main`. After lint, type checks, tests and the production build pass, the [Semantic Release Action](https://github.com/cycjimmy/semantic-release-action) creates releases directly, without pull requests.

`fix:` creates a patch release, `feat:` a minor release, and `feat!:` or `fix!:` a major release. Documentation and CI changes alone do not trigger a release. Keep commit subjects under 100 characters, with no body.

Releases update the package version, lockfile and changelog, then publish a GitHub release and GHCR images tagged with the full version, major/minor version and `latest`. Development images use `main`. The header displays the package version used to build the panel.

The initial version is tagged `0.1.0`. Include that tag when pushing this repository to GitHub so releases continue from the existing version.

The workflows use the built-in `GITHUB_TOKEN`. Allow it to write repository contents and packages, and allow the release bot to push version commits to `main`. Pull the bot's commit before your next push. Nothing is published to npm.

## Contributing

Contributions are welcome. Please submit a pull request with a description of the change.

## License

This project is licensed under the GNU General Public License v2.0. See [LICENSE](LICENSE) for details.

## Disclaimer

This project is not associated with, endorsed by, or affiliated with KUNOS Simulazioni. The official server and its content remain subject to their own licenses.
