import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, validateConfig } from "../shared/config.mjs";

const catalog = {
  cars: [{ name: "preset_695b_mech_1" }],
  practice: [
    {
      track: "Brands Hatch",
      layout: "GP",
      event_name: "GP Time Attack",
      track_length: 3916,
      max_pit_slot: 32,
    },
  ],
  race: [
    {
      track: "Brands Hatch",
      layout: "GP",
      event_name: "GP Race",
      track_length: 3916,
      max_pit_slot: 32,
    },
  ],
};
test("CPU emulation defaults off and remains optional for older configurations", () => {
  const config = defaultConfig();
  assert.equal(config.runtime.cpuEmulation, false);
  delete config.runtime.cpuEmulation;
  assert.doesNotThrow(() => validateConfig(config, catalog));
  config.runtime.cpuEmulation = true;
  assert.doesNotThrow(() => validateConfig(config, catalog));
  for (const invalid of ["true", "false", 0, 1, null, {}]) {
    config.runtime.cpuEmulation = invalid;
    assert.throws(() => validateConfig(config, catalog), /CPU emulation/);
  }
});
test("validates native EVO event selection and rejects mismatched catalogs", () => {
  assert.doesNotThrow(() => validateConfig(defaultConfig(), catalog));
  for (const mutate of [
    (c) => {
      c.server.max_players = 33;
    },
    (c) => {
      c.event.event.event_name = "ACC practice";
    },
    (c) => {
      c.server.allowed_cars_list_full[0].car_name = "not-installed";
    },
    (c) => {
      c.event.game_config.practice_time_of_day.month = 2;
      c.event.game_config.practice_time_of_day.day = 30;
    },
    (c) => {
      c.event.game_config.mandatory_pit_stop = true;
    },
  ]) {
    const c = defaultConfig();
    mutate(c);
    assert.throws(() => validateConfig(c, catalog));
  }
});
test("accepts a race weekend with a mandatory stop only for an eligible timed race", () => {
  const c = defaultConfig();
  c.event.game_type = "GameModeType_RACE_WEEKEND";
  c.event.event.event_name = "GP Race";
  c.event.game_config.race_duration = 1800;
  c.event.game_config.mandatory_pit_stop = true;
  assert.doesNotThrow(() => validateConfig(c, catalog));
  c.event.game_config.race_duration_type = "GameModeSelectionDuration_LAPS";
  assert.throws(() => validateConfig(c, catalog));
});

test("native TCP and UDP ports can be configured independently", () => {
  const config = defaultConfig();
  config.server.server_tcp_listener_port = 19700;
  config.server.server_tcp_internal_port = 19700;
  config.server.server_udp_listener_port = 19701;
  config.server.server_udp_internal_port = 19701;
  assert.doesNotThrow(() => validateConfig(config, catalog));
  config.server.server_http_port = 19700;
  assert.throws(
    () => validateConfig(config, catalog),
    /HTTP and game TCP ports must differ/,
  );
});
