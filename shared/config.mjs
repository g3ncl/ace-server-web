import { carSelectionMode } from "./cars.mjs";
export const modes = ["GameModeType_PRACTICE", "GameModeType_RACE_WEEKEND"];
export const weathers = [
  "CLEAR",
  "SCATTERED_CLOUDS",
  "BROKEN_CLOUDS",
  "OVERCAST",
  "DRIZZLE",
  "RAIN",
  "HEAVY_RAIN",
  "DAMP",
];
export const sessions = ["practice", "qualify", "warmup", "race"];

export function defaultConfig() {
  return {
    version: 1,
    runtime: { registerLobby: false, carSelection: "selected", cpuEmulation: false },
    server: {
      server_name: "AC EVO Server",
      server_tcp_listener_port: 9700,
      server_udp_listener_port: 9700,
      server_tcp_internal_port: 9700,
      server_udp_internal_port: 9700,
      server_http_port: 8080,
      max_players: 8,
      cycle: true,
      type: "MultiplayerServerListSessionType_UNRANKED",
      tuning_type: "TuningAllowed",
      driver_password: "",
      spectator_password: "",
      admin_password: "",
      allowed_cars_list_full: [
        { car_name: "preset_695b_mech_1", ballast: 0, restrictor: 0 },
      ],
    },
    event: {
      game_type: modes[0],
      event: {
        track: "Brands Hatch",
        layout: "GP",
        event_name: "GP Time Attack",
        track_length: "3916",
      },
      weather_type: "GameModeSelectionWeatherType_CLEAR",
      weather_behaviour: "GameModeSelectionWeatherBehaviour_STATIC",
      initial_grip: "InitialGrip_OPTIMUM",
      export_json: false,
      game_config: Object.fromEntries([
        ...sessions.flatMap((name, i) => [
          [`${name}_duration`, [1800, 600, 0, 1200][i]],
          [
            `${name}_time_of_day`,
            {
              year: 2026,
              month: 10,
              day: 24,
              hour: 14,
              minute: 0,
              second: 0,
              time_multiplier: 1,
            },
          ],
          [`${name}_overtime_waiting_next_session`, 30],
          [`${name}_max_wait_to_box`, 30],
        ]),
        ["race_duration_type", "GameModeSelectionDuration_TIME"],
        ["min_waiting_for_players", 30],
        ["max_waiting_for_players", 60],
        ["mandatory_pit_stop", false],
        ["requires_tyre_change", false],
        ["requires_refuelling", false],
        ["pit_window", 600],
      ]),
    },
  };
}

const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function integer(value, min, max, label) {
  requireValue(
    Number.isInteger(value) && value >= min && value <= max,
    `${label} must be an integer between ${min} and ${max}`,
  );
}
function choice(value, values, label) {
  requireValue(values.includes(value), `${label} is invalid`);
}

// Validate both form edits and imported JSON before persisting or launching.
export function validateConfig(config, catalog) {
  requireValue(
    object(config) && config.version === 1,
    "Expected an ace-server-web version 1 configuration bundle",
  );
  const { server: s, event: e, runtime: r } = config;
  requireValue(
    object(s) && object(e) && object(r),
    "Missing server, event or runtime settings",
  );
  requireValue(
    typeof r.registerLobby === "boolean",
    "Lobby registration must be a boolean",
  );
  requireValue(
    r.cpuEmulation === undefined || typeof r.cpuEmulation === "boolean",
    "CPU emulation must be a boolean",
  );
  choice(carSelectionMode(config), ["selected", "all"], "Car selection mode");
  requireValue(
    typeof s.server_name === "string" &&
      s.server_name.trim().length > 0 &&
      s.server_name.length <= 128,
    "Server name must contain 1–128 characters",
  );
  for (const key of [
    "server_tcp_listener_port",
    "server_udp_listener_port",
    "server_tcp_internal_port",
    "server_udp_internal_port",
    "server_http_port",
  ])
    integer(s[key], 1024, 65535, key);
  requireValue(
    s.server_http_port !== s.server_tcp_internal_port,
    "HTTP and game TCP ports must differ",
  );
  integer(s.max_players, 1, 100, "Maximum players");
  for (const key of ["driver_password", "spectator_password", "admin_password"])
    requireValue(
      typeof s[key] === "string" && s[key].length <= 256,
      `${key} must be a string of at most 256 characters`,
    );
  requireValue(typeof s.cycle === "boolean", "Cycle must be a boolean");
  choice(
    s.type,
    [
      "MultiplayerServerListSessionType_UNRANKED",
      "MultiplayerServerListSessionType_RANKED",
      "MultiplayerServerListSessionType_BOTH",
    ],
    "Server type",
  );
  choice(s.tuning_type, ["TuningAllowed", "TuningDenied"], "Tuning");
  requireValue(
    Array.isArray(s.allowed_cars_list_full) &&
      (carSelectionMode(config) === "all" ||
        s.allowed_cars_list_full.length > 0),
    "Select at least one car",
  );
  if (catalog && carSelectionMode(config) === "all")
    requireValue(catalog.cars.length > 0, "The installed car catalog is empty");
  for (const car of s.allowed_cars_list_full) {
    requireValue(
      object(car) && typeof car.car_name === "string",
      "Invalid car",
    );
    integer(car.ballast, 0, 1000, "Ballast");
    requireValue(
      Number.isFinite(car.restrictor) &&
        car.restrictor >= 0 &&
        car.restrictor <= 1,
      "Restrictor must be between 0 and 1",
    );
    if (catalog)
      requireValue(
        catalog.cars.some((c) => c.name === car.car_name),
        `Unknown car: ${car.car_name}`,
      );
  }
  requireValue(
    new Set(s.allowed_cars_list_full.map((c) => c.car_name)).size ===
      s.allowed_cars_list_full.length,
    "Duplicate cars",
  );
  choice(e.game_type, modes, "Event type");
  choice(
    e.weather_type,
    weathers.map((w) => `GameModeSelectionWeatherType_${w}`),
    "Weather",
  );
  choice(
    e.weather_behaviour,
    [
      "GameModeSelectionWeatherBehaviour_STATIC",
      "GameModeSelectionWeatherBehaviour_DYNAMIC",
    ],
    "Weather behaviour",
  );
  choice(
    e.initial_grip,
    ["InitialGrip_GREEN", "InitialGrip_FAST", "InitialGrip_OPTIMUM"],
    "Initial grip",
  );
  requireValue(
    object(e.event) && object(e.game_config),
    "Missing event or session settings",
  );
  if (catalog) {
    const events = e.game_type === modes[0] ? catalog.practice : catalog.race;
    const track = events.find(
      (t) =>
        t.track === e.event.track &&
        t.layout === e.event.layout &&
        t.event_name === e.event.event_name,
    );
    requireValue(
      track,
      "Track, layout and event must match the installed EVO catalog",
    );
    requireValue(
      String(track.track_length) === String(e.event.track_length),
      "Track length must match the installed catalog",
    );
    requireValue(
      s.max_players <= track.max_pit_slot,
      `This layout supports at most ${track.max_pit_slot} players`,
    );
  }
  const g = e.game_config;
  choice(
    g.race_duration_type,
    ["GameModeSelectionDuration_TIME", "GameModeSelectionDuration_LAPS"],
    "Race duration type",
  );
  for (const name of sessions) {
    integer(g[`${name}_duration`], 0, 604800, `${name} duration`);
    for (const suffix of ["max_wait_to_box", "overtime_waiting_next_session"])
      integer(g[`${name}_${suffix}`], 0, 3600, `${name} ${suffix}`);
    const time = g[`${name}_time_of_day`];
    requireValue(object(time), `Missing ${name} date and time`);
    for (const [key, min, max] of [
      ["year", 1970, 9999],
      ["month", 1, 12],
      ["day", 1, 31],
      ["hour", 0, 23],
      ["minute", 0, 59],
      ["second", 0, 59],
      ["time_multiplier", 1, 60],
    ])
      integer(time[key], min, max, `${name} ${key}`);
    const date = new Date(Date.UTC(time.year, time.month - 1, time.day));
    requireValue(
      date.getUTCMonth() === time.month - 1 && date.getUTCDate() === time.day,
      `${name} date does not exist`,
    );
  }
  requireValue(
    g.practice_duration > 0,
    "Practice must have a positive duration",
  );
  if (e.game_type === modes[1])
    requireValue(g.race_duration > 0, "Race must have a positive duration");
  integer(g.min_waiting_for_players, 0, 3600, "Minimum waiting time");
  integer(
    g.max_waiting_for_players,
    g.min_waiting_for_players,
    3600,
    "Maximum waiting time",
  );
  for (const key of [
    "mandatory_pit_stop",
    "requires_tyre_change",
    "requires_refuelling",
  ])
    requireValue(typeof g[key] === "boolean", `${key} must be a boolean`);
  integer(g.pit_window, 1, 604800, "Pit window");
  if (g.mandatory_pit_stop) {
    requireValue(
      e.game_type === modes[1] &&
        g.race_duration_type === "GameModeSelectionDuration_TIME" &&
        g.race_duration > 1200,
      "Mandatory pit stops require a timed race longer than 20 minutes",
    );
    requireValue(
      g.pit_window <= g.race_duration,
      "Pit window exceeds race duration",
    );
  }
  return config;
}
