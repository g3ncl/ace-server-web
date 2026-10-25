# Linux compatibility investigation

Test date: 24 October 2026. Host: Fedora 44 x86-64, rootless Podman. The Docker CLI was installed but this account could not access `/var/run/docker.sock`.

## Installed files

Steam tool directory:

```text
/home/claudio/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/Assetto Corsa EVO Dedicated Server
```

`AssettoCorsaEVOServer.exe` is a PE32+ Windows x86-64 console executable. `ServerLauncher.exe` is a Windows GUI launcher. The supplied Linux Steam libraries are not a native Linux game-server executable.

The tested server identifies itself as **0.9.1+release.4**, revision `877dc5a16ab915ec3c01ff601c6cf79cde8726c8`, built 28 August 2026. This report describes the installed build; future Steam updates can change its configuration and Wine requirements.

## Successful direct test

An Ubuntu 24.04 container with Wine 9, Xvfb and Xauth ran the executable with the installed server directory mounted read-only. The working directory must be the server directory so EVO can find `content.kspkg`.

The executable's own `--help` exposes:

```text
-configjson       Server config as json file
-seasonjson       Season definition as json file
-no_lobby         No Lobby registration
-write_server_results
```

The JSON pair uses EVO's native `ServerConfiguration` and `BuildSeasonDefinitionRequest` formats. The latter is an event-building request despite the command-line name `seasonjson`.

The local test used Brands Hatch GP, `GP Time Attack`, the Abarth 695 mechanical preset `preset_695b_mech_1`, eight slots, clear/static weather and a 30-minute practice session. The server generated a season definition and logged:

```text
Listening to TCP 9700
Listening to UDP 9700
```

The HTTP endpoint on container port 8080 responded with a valid HTTP 404 to an unknown route, confirming that it was listening. A 404 from `/` is expected; this endpoint is not the administration panel.

No extra Microsoft VC runtime installer or Proton download was needed for this build. Wine's built-in runtime libraries were sufficient. The server emitted a `WeatherNoiseData` handler warning but continued running; it did not prevent local startup.

## Container details discovered during the test

- Fedora SELinux prevented reading the Steam directory until label isolation was disabled for the container. The Steam tree was not relabeled.
- Running `xvfb-run` as PID 1 stalled its startup signal handshake in an initial probe. An init process fixed that probe. The application image uses Tini and starts Xvfb explicitly before the Node supervisor.
- Running with the wrong working directory failed to locate content tables. The manager sets the server installation as the working directory.
- The web manager defaults to no lobby registration so local startup does not require public routing.

Raw probe files are under the ignored `.local/probe/` directory on the development machine; proprietary binaries and Wine prefixes are not part of the project.

## Limits of verification

Local event loading and TCP/UDP/HTTP listeners do not prove public reachability or successful driving. Router forwarding, public lobby registration, joining from an external game client, and results from a completed real multiplayer session require further live verification. No router or firewall rules were changed.

## Web manager checks

The production Next.js build, TypeScript check, ESLint and Node integration tests passed. The integration test exercises actual child-process start/stop/restart behaviour using a small server fixture, configuration persistence and rejection, password redaction, and result-download traversal/symlink protection.

Chromium browser checks passed for saving server settings, switching to race weekends, the session editor, logs, entry-list and results pages, and a 390 px mobile viewport without horizontal overflow or page errors. Optional web Basic authentication returned 401 without credentials and 200 with valid credentials.

The dependency audit reported zero known vulnerabilities at the time of verification. The lockfile includes a patched PostCSS override for the version used by Next.js 15.

The complete application image also passed a live smoke test as an unprivileged container user: start a practice event, confirm TCP/UDP game listeners and the EVO HTTP response, stop it, save and start a race weekend, then restore practice and restart. Browser checks passed against that production container as well as the local production build.

The image was used to recreate the container against the same named volume. Saved configuration survived unchanged, the existing Wine prefix was reused, and the practice server started successfully. The container health check passed. Initial validation used lobby registration disabled; administrator settings can subsequently differ.

## Ports controlled by the web configuration

The default Linux deployment now uses host networking. The panel binds directly to localhost port 3000, and EVO binds the ports selected in its configuration. No container port mappings are involved.

A live test on the same running container moved the game/HTTP ports from 19700/18080 to 19800/18081 by saving configuration and restarting the game server. The new listeners responded, the old listeners closed, and the container ID stayed unchanged. The test then restored 9700 TCP/UDP and 8080 TCP. Router forwarding and firewall changes were outside the test.

The rebuilt production image also passed this flow through Chromium: edit both port fields, click Save Configuration, open Status, and click Restart. TCP connections, the UDP binding and the HTTP response were checked on the new ports, and the previous ports were released. The same container remained in use throughout. Default ports were restored afterwards.

The Node integration test also covers saving new port values while the server runs, retaining the old active-port display until restart, applying the new values on restart, and releasing the old listener.

## ACC presentation comparison

The first implementation reused the shell but differed from ACC in font, header size, content width, status cards and configuration layout. Those differences were corrected using the local ACC source as a reference. EVO retains its own fields and additional navigation tools.

A Chromium comparison at 1440 × 1000 rendered both status pages with the same running state and Ubuntu font. Their status cards matched in position (496, 76), width (688 px), height (134.796875 px), padding (20 px), corner radius (8 px), button height (36 px) and button font size (14 px). Screenshots and measurements are under the ignored `.local/browser/` directory. The configuration page follows ACC's centered container, import/export toolbar, single-column controls, desktop tabs, mobile accordion and full-width save button; its EVO content is intentionally different.

## Car allowance, per-car editing and independent ports

The car editor now uses search, pagination, allowed/adjusted filters, inline ballast/restrictor controls and per-car reset. Mobile uses compact rows with labeled controls. Chromium checks passed for editing a model on page two, searching by preset ID, changing another model, filtering adjusted cars, resetting one model without affecting another, saving sparse overrides and mobile layout without horizontal overflow.

All installed cars is a manager policy, not an invented native flag. The saved bundle stores `runtime.carSelection: "all"` and only non-default car adjustments. The manager regenerates the native explicit allowance list from the installed catalog on every start. Unit/integration tests cover old configurations, switching policies, sparse overrides, reset, and newly added catalog cars appearing after restart.

The previous UI restriction that forced TCP and UDP values to match was removed. An isolated instance of the production image passed a browser/server check with TCP 19700, UDP 19701 and HTTP 18080. The native launch JSON contained all 100 installed cars, preserved a 25 kg / 0.05 restrictor adjustment, and the actual TCP, UDP and HTTP listeners responded. This verifies separate binding; a game-client join with different TCP/UDP values remains untested. The normal server's settings were restored, and the isolated test instance was removed.

The form descriptions now explain that the external entry-list/results URLs are optional and that EVO supplies its own HTTP endpoint without requiring the administrator to implement an API.

## Status details and shared ACC presentation

Both project sources now display public server details directly inside the main status card, between the status badge and controls. EVO no longer uses a details accordion. ACC exposes only selected non-secret configuration fields through its status endpoint; unavailable configuration does not prevent reporting the process state.

The regular EVO shell uses ACC header sizing, navigation styling, content spacing and configuration skeletons. Navigation styles in both projects have enough specificity to remain consistent regardless of Mantine stylesheet ordering. The EVO mobile footer accommodates its additional tools.

Read-only Chromium checks at 1440 × 1000 and 390 × 844 verified visible card details, no status accordion, no horizontal overflow, and matching shared header/sidebar/card/control styles. Game names and detail content naturally affect text widths and card height. Both projects' TypeScript checks, lint checks, and all seven EVO tests passed. The initial checks ran against source before deployment.


The updated image `45e897728ecb` was subsequently deployed to the port-3000 container. The saved configuration compared equal before and after replacement. EVO returned to running state with no pending changes, TCP/UDP 22700 and HTTP 22800. The manager health check passed, both TCP listeners responded, the EVO HTTP endpoint returned 200, and read-only Chromium checks passed against the deployed status card at desktop and mobile sizes. The previous container is retained stopped as `ace-server-web-previous` for rollback.
