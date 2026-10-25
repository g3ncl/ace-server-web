"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Box,
  Container,
  FileButton,
  Group,
  Skeleton,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import CarEditor from "@/components/CarEditor";
import ConfigurationSections from "@/components/ConfigurationSections";
import { Download, Upload } from "lucide-react";
import { api, download } from "@/components/api";
import type { Catalog, Config, Time, Track } from "@/components/types";
import {
  modes,
  sessions,
  weathers,
  validateConfig,
} from "../../../shared/config.mjs";

const label = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
const shortEnum = (value: string) =>
  label(value.slice(value.lastIndexOf("_") + 1));
const trackKey = (t: Track) => `${t.track}|${t.layout}|${t.event_name}`;

export default function ConfigurationPage() {
  const [config, setConfig] = useState<Config>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [raw, setRaw] = useState("");
  const [rawDirty, setRawDirty] = useState(false);
  useEffect(() => {
    Promise.all([api<Config>("config"), api<Catalog>("catalog")])
      .then(([c, cat]) => {
        setConfig(c);
        setCatalog(cat);
        setRaw(JSON.stringify(c, null, 2));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty || rawDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, rawDirty]);
  function edit(next: Config) {
    setConfig(next);
    setDirty(true);
    setMessage("");
    setRaw(JSON.stringify(next, null, 2));
  }
  function server(key: keyof Config["server"], value: unknown) {
    if (config) edit({ ...config, server: { ...config.server, [key]: value } });
  }
  function event(key: keyof Config["event"], value: unknown) {
    if (config) edit({ ...config, event: { ...config.event, [key]: value } });
  }
  function game(key: string, value: unknown) {
    if (config)
      event("game_config", { ...config.event.game_config, [key]: value });
  }
  function time(name: string, key: keyof Time, value: number) {
    if (config)
      game(`${name}_time_of_day`, {
        ...(config.event.game_config[`${name}_time_of_day`] as Time),
        [key]: value,
      });
  }
  function applyJSON(text: string) {
    try {
      const value = validateConfig(JSON.parse(text), catalog);
      edit(value);
      setRawDirty(false);
      setError("");
      setMessage("JSON loaded into the editor. Save to persist it.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save() {
    if (rawDirty) {
      setError("Apply your JSON edits first, or discard them.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      validateConfig(config, catalog);
      const result = await api<{ restartRequired: boolean }>("config", config);
      setDirty(false);
      setMessage(
        result.restartRequired
          ? "Saved. Restart the server to apply these changes."
          : "Saved. These settings will be used on the next start.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const number = (
    title: string,
    value: unknown,
    change: (v: number) => void,
    min = 0,
    max = 604800,
    description?: string,
  ) => (
    <NumberInput
      label={title}
      description={description}
      value={typeof value === "number" ? value : 0}
      min={min}
      max={max}
      allowDecimal={false}
      onChange={(v) => change(Number(v))}
    />
  );
  const options = (values: string[]) =>
    values.map((value) => ({ value, label: shortEnum(value) }));
  const tracks =
    catalog && config
      ? config.event.game_type === modes[0]
        ? catalog.practice
        : catalog.race
      : [];
  const selectedTrack = tracks.find(
    (t) => trackKey(t) === trackKey(config?.event.event || ({} as Track)),
  );
  function selectMode(mode: string) {
    if (!catalog || !config) return;
    const list = mode === modes[0] ? catalog.practice : catalog.race;
    const selected =
      list.find(
        (t) =>
          t.track === config.event.event.track &&
          t.layout === config.event.event.layout,
      ) || list[0];
    edit({
      ...config,
      event: {
        ...config.event,
        game_type: mode,
        event: nativeTrack(selected),
        game_config: { ...config.event.game_config, mandatory_pit_stop: false },
      },
      server: {
        ...config.server,
        max_players: Math.min(
          config.server.max_players,
          selected.max_pit_slot || 100,
        ),
      },
    });
  }
  function nativeTrack(t: Track): Track {
    return {
      track: t.track,
      layout: t.layout,
      event_name: t.event_name,
      track_length: String(t.track_length),
    };
  }

  return (
    <Container size="sm">
      <Stack gap={32}>
        {error && (
          <Alert color="red" title="Configuration error">
            {error}
          </Alert>
        )}
        {message && <Alert color="green">{message}</Alert>}
        {!config || !catalog ? (
          !error && <Stack gap="md"><Skeleton height={40} radius="md" /><Skeleton height={200} radius="md" /><Skeleton height={40} radius="md" /></Stack>
        ) : (
          <>
            <Group justify="flex-end" gap="sm">
              {(dirty || rawDirty) && (
                <Badge color="yellow">Unsaved changes</Badge>
              )}
              <FileButton
                accept="application/json,.json"
                onChange={async (file) => {
                  if (!file) return;
                  if (file.size > 1024 * 1024) {
                    setError("Import exceeds 1 MiB");
                    return;
                  }
                  applyJSON(await file.text());
                }}
              >
                {(props) => (
                  <Button
                    variant="light"
                    leftSection={<Upload size={16} />}
                    {...props}
                  >
                    Import
                  </Button>
                )}
              </FileButton>
              <Button
                variant="light"
                leftSection={<Download size={16} />}
                title="Export includes server passwords"
                onClick={() => download("ace-configuration.json", config)}
              >
                Export
              </Button>
            </Group>
            {rawDirty && (
              <Alert color="yellow">
                JSON edits are pending. Apply or discard them in the JSON tab
                before editing the form.
              </Alert>
            )}
            <ConfigurationSections>
              <Tabs.Panel value="server" pt="lg">
                <Stack
                  style={
                    rawDirty ? { pointerEvents: "none", opacity: 0.5 } : {}
                  }
                >
                  <Box>
                    <Stack>
                      <TextInput
                        label="Server name"
                        value={config.server.server_name}
                        onChange={(e) =>
                          server("server_name", e.currentTarget.value)
                        }
                      />
                      <Stack>
                        {number(
                          "Maximum players",
                          config.server.max_players,
                          (v) => server("max_players", v),
                          1,
                          selectedTrack?.max_pit_slot || 100,
                        )}
                        <Select
                          label="Server type"
                          data={options([
                            "MultiplayerServerListSessionType_UNRANKED",
                            "MultiplayerServerListSessionType_RANKED",
                            "MultiplayerServerListSessionType_BOTH",
                          ])}
                          value={config.server.type}
                          onChange={(v) => server("type", v)}
                        />
                      </Stack>
                      <Select
                        label="Car tuning"
                        data={[
                          { value: "TuningAllowed", label: "Allowed" },
                          { value: "TuningDenied", label: "Denied" },
                        ]}
                        value={config.server.tuning_type}
                        onChange={(v) => server("tuning_type", v)}
                      />
                      <Switch
                        label="Cycle sessions and events"
                        checked={config.server.cycle}
                        onChange={(e) =>
                          server("cycle", e.currentTarget.checked)
                        }
                      />
                      <Switch
                        label="Register in the public EVO lobby"
                        description="Enable when the game and HTTP ports are reachable by players."
                        checked={config.runtime.registerLobby}
                        onChange={(e) =>
                          edit({
                            ...config,
                            runtime: {
                              ...config.runtime,
                              registerLobby: e.currentTarget.checked,
                            },
                          })
                        }
                      />
                    </Stack>
                  </Box>
                  <Box>
                    <Stack>
                      <Text size="sm" c="dimmed">
                        Choose the game and HTTP ports here, save, then restart
                        the server. Router forwarding and firewall rules must
                        match these values.
                      </Text>
                      <Stack>
                        {number(
                          "Game TCP port",
                          config.server.server_tcp_internal_port,
                          (v) =>
                            edit({
                              ...config,
                              server: {
                                ...config.server,
                                server_tcp_listener_port: v,
                                server_tcp_internal_port: v,
                              },
                            }),
                          1024,
                          65535,
                          "Forward this port as TCP on your router for internet players.",
                        )}
                        {number(
                          "Game UDP port",
                          config.server.server_udp_internal_port,
                          (v) =>
                            edit({
                              ...config,
                              server: {
                                ...config.server,
                                server_udp_listener_port: v,
                                server_udp_internal_port: v,
                              },
                            }),
                          1024,
                          65535,
                          "Forward this port as UDP on your router. Both game ports default to 9700; they can be configured separately.",
                        )}
                        {number(
                          "EVO HTTP port (TCP)",
                          config.server.server_http_port,
                          (v) => server("server_http_port", v),
                          1024,
                          65535,
                          "EVO provides this HTTP endpoint automatically; you do not need to implement an API. Keep 8080 unless it is in use, and forward it as TCP for public hosting. The admin panel uses a separate port (3000 by default).",
                        )}
                      </Stack>
                    </Stack>
                  </Box>
                  <Box>
                    <Stack>
                      <Stack>
                        {(
                          [
                            "driver_password",
                            "spectator_password",
                            "admin_password",
                          ] as const
                        ).map((key) => (
                          <PasswordInput
                            key={key}
                            label={label(key)}
                            value={config.server[key]}
                            onChange={(e) => server(key, e.currentTarget.value)}
                          />
                        ))}
                      </Stack>
                      <Text size="sm" c="dimmed">
                        These passwords belong to the game server. Web panel
                        authentication uses ACE_WEB_PASSWORD.
                      </Text>
                    </Stack>
                  </Box>
                  <Box>
                    <Stack>
                      <TextInput
                        label="Entry-list server URL (optional)"
                        description="Optional external service supplying driver/car entry lists. Leave blank when using the local Entry list page."
                        value={config.server.entry_list_server_url || ""}
                        onChange={(e) =>
                          server("entry_list_server_url", e.currentTarget.value)
                        }
                      />
                      <TextInput
                        label="Results POST URL (optional)"
                        description="Optional external service that receives EVO session results. Leave blank to keep results locally."
                        value={config.server.results_post_url || ""}
                        onChange={(e) =>
                          server("results_post_url", e.currentTarget.value)
                        }
                      />
                    </Stack>
                  </Box>
                </Stack>
              </Tabs.Panel>
              <Tabs.Panel value="event" pt="lg">
                <Stack
                  style={
                    rawDirty ? { pointerEvents: "none", opacity: 0.5 } : {}
                  }
                >
                  <Box>
                    <Stack>
                      <Select
                        label="Event format"
                        value={config.event.game_type}
                        data={[
                          { value: modes[0], label: "Practice / track day" },
                          { value: modes[1], label: "Race weekend" },
                        ]}
                        onChange={(v) => v && selectMode(v)}
                      />
                      <Select
                        label="Track and layout"
                        searchable
                        value={trackKey(config.event.event)}
                        data={tracks.map((t) => ({
                          value: trackKey(t),
                          label: `${t.track} · ${t.layout}`,
                        }))}
                        onChange={(v) => {
                          const t = tracks.find((t) => trackKey(t) === v);
                          if (t)
                            edit({
                              ...config,
                              event: { ...config.event, event: nativeTrack(t) },
                              server: {
                                ...config.server,
                                max_players: Math.min(
                                  config.server.max_players,
                                  t.max_pit_slot || 100,
                                ),
                              },
                            });
                        }}
                      />
                      <Text size="sm" c="dimmed">
                        {selectedTrack?.max_pit_slot} pit slots ·{" "}
                        {Number(
                          config.event.event.track_length,
                        ).toLocaleString()}{" "}
                        m · {config.event.event.event_name}
                      </Text>
                    </Stack>
                  </Box>
                  <Box>
                    <Stack>
                      <Stack>
                        <Select
                          label="Weather"
                          value={config.event.weather_type}
                          data={weathers.map((w) => ({
                            value: `GameModeSelectionWeatherType_${w}`,
                            label: label(w),
                          }))}
                          onChange={(v) => event("weather_type", v)}
                        />
                        <Select
                          label="Weather behaviour"
                          value={config.event.weather_behaviour}
                          data={options([
                            "GameModeSelectionWeatherBehaviour_STATIC",
                            "GameModeSelectionWeatherBehaviour_DYNAMIC",
                          ])}
                          onChange={(v) => event("weather_behaviour", v)}
                        />
                        <Select
                          label="Initial grip"
                          value={config.event.initial_grip}
                          data={options([
                            "InitialGrip_GREEN",
                            "InitialGrip_FAST",
                            "InitialGrip_OPTIMUM",
                          ])}
                          onChange={(v) => event("initial_grip", v)}
                        />
                      </Stack>
                    </Stack>
                  </Box>
                </Stack>
              </Tabs.Panel>
              <Tabs.Panel value="cars" pt="lg">
                <CarEditor
                  value={config}
                  cars={catalog.cars}
                  onChange={edit}
                  disabled={rawDirty}
                />
              </Tabs.Panel>
              <Tabs.Panel value="sessions" pt="lg">
                <Stack
                  style={
                    rawDirty ? { pointerEvents: "none", opacity: 0.5 } : {}
                  }
                >
                  <Text size="sm" c="dimmed">
                    Durations use seconds. A lap-based race uses laps instead.
                    Set optional session durations to zero to skip them.
                  </Text>
                  {sessions
                    .filter(
                      (name) =>
                        config.event.game_type !== modes[0] ||
                        name === "practice",
                    )
                    .map((name) => {
                      const g = config.event.game_config;
                      const t = g[`${name}_time_of_day`] as Time;
                      return (
                        <Box key={name} className="session-box">
                          <Stack>
                            <Title order={5}>{label(name)}</Title>
                            <Stack>
                              {name === "race" && (
                                <Select
                                  label="Race duration type"
                                  data={options([
                                    "GameModeSelectionDuration_TIME",
                                    "GameModeSelectionDuration_LAPS",
                                  ])}
                                  value={String(g.race_duration_type)}
                                  onChange={(v) =>
                                    game("race_duration_type", v)
                                  }
                                />
                              )}
                              {number(
                                name === "race" &&
                                  g.race_duration_type ===
                                    "GameModeSelectionDuration_LAPS"
                                  ? "Duration (laps)"
                                  : "Duration (seconds)",
                                g[`${name}_duration`],
                                (v) => game(`${name}_duration`, v),
                              )}
                              {number(
                                "Overtime before next session (seconds)",
                                g[`${name}_overtime_waiting_next_session`],
                                (v) =>
                                  game(
                                    `${name}_overtime_waiting_next_session`,
                                    v,
                                  ),
                                0,
                                3600,
                              )}
                              {number(
                                "Maximum wait to pit (seconds)",
                                g[`${name}_max_wait_to_box`],
                                (v) => game(`${name}_max_wait_to_box`, v),
                                0,
                                3600,
                              )}
                            </Stack>
                            <Stack>
                              {(
                                [
                                  "year",
                                  "month",
                                  "day",
                                  "hour",
                                  "minute",
                                  "time_multiplier",
                                ] as const
                              ).map((key) => (
                                <div key={key}>
                                  {number(
                                    label(key),
                                    t[key],
                                    (v) => time(name, key, v),
                                    key === "year"
                                      ? 1970
                                      : key === "hour" || key === "minute"
                                        ? 0
                                        : 1,
                                    {
                                      year: 9999,
                                      month: 12,
                                      day: 31,
                                      hour: 23,
                                      minute: 59,
                                      time_multiplier: 60,
                                    }[key],
                                  )}
                                </div>
                              ))}
                            </Stack>
                          </Stack>
                        </Box>
                      );
                    })}
                  {config.event.game_type === modes[1] && (
                    <Box>
                      <Stack>
                        <Title order={5}>Race procedure</Title>
                        <Stack>
                          {number(
                            "Minimum waiting for players (seconds)",
                            config.event.game_config.min_waiting_for_players,
                            (v) => game("min_waiting_for_players", v),
                            0,
                            3600,
                          )}
                          {number(
                            "Maximum waiting for players (seconds)",
                            config.event.game_config.max_waiting_for_players,
                            (v) => game("max_waiting_for_players", v),
                            0,
                            3600,
                          )}
                        </Stack>
                        <Switch
                          label="Mandatory pit stop"
                          description="Requires a timed race longer than 20 minutes."
                          checked={Boolean(
                            config.event.game_config.mandatory_pit_stop,
                          )}
                          onChange={(e) =>
                            game("mandatory_pit_stop", e.currentTarget.checked)
                          }
                        />
                        {Boolean(
                          config.event.game_config.mandatory_pit_stop,
                        ) && (
                          <>
                            <Switch
                              label="Require tyre change"
                              checked={Boolean(
                                config.event.game_config.requires_tyre_change,
                              )}
                              onChange={(e) =>
                                game(
                                  "requires_tyre_change",
                                  e.currentTarget.checked,
                                )
                              }
                            />
                            <Switch
                              label="Require refuelling"
                              checked={Boolean(
                                config.event.game_config.requires_refuelling,
                              )}
                              onChange={(e) =>
                                game(
                                  "requires_refuelling",
                                  e.currentTarget.checked,
                                )
                              }
                            />
                            {number(
                              "Pit window (seconds)",
                              config.event.game_config.pit_window,
                              (v) => game("pit_window", v),
                              1,
                            )}
                          </>
                        )}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </Tabs.Panel>
              <Tabs.Panel value="json" pt="lg">
                <Stack>
                  <Text size="sm" c="dimmed">
                    This bundle contains native EVO server and event JSON plus
                    the manager’s lobby setting. Launch files are generated from
                    these values. The manager sets local entry-list and results
                    paths.
                  </Text>
                  <Textarea
                    label="Configuration bundle"
                    className="json"
                    autosize
                    minRows={22}
                    maxRows={35}
                    value={raw}
                    onChange={(e) => {
                      setRaw(e.currentTarget.value);
                      setRawDirty(true);
                    }}
                  />
                  <Group>
                    <Button onClick={() => applyJSON(raw)}>
                      Apply JSON to editor
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => {
                        setRaw(JSON.stringify(config, null, 2));
                        setRawDirty(false);
                      }}
                    >
                      Discard JSON edits
                    </Button>
                  </Group>
                </Stack>
              </Tabs.Panel>
            </ConfigurationSections>
            <Button
              fullWidth
              loading={busy}
              disabled={rawDirty}
              onClick={() => void save()}
              style={{ bottom: 16 }}
            >
              Save Configuration
            </Button>
          </>
        )}
      </Stack>
    </Container>
  );
}
