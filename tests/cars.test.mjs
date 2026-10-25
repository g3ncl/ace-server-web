import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, validateConfig } from "../shared/config.mjs";
import {
  resolveAllowedCars,
  setCarSelectionMode,
  updateCarAdjustment,
} from "../shared/cars.mjs";

const catalog = {
  cars: [{ name: "preset_695b_mech_1" }, { name: "another_car" }],
};
test("old configurations retain their explicit car selection", () => {
  const config = defaultConfig();
  delete config.runtime.carSelection;
  assert.deepEqual(
    resolveAllowedCars(config, catalog),
    config.server.allowed_cars_list_full,
  );
});
test("all mode stores sparse adjustments and includes catalog additions at launch", () => {
  let config = setCarSelectionMode(defaultConfig(), "all", catalog);
  assert.deepEqual(config.server.allowed_cars_list_full, []);
  assert.doesNotThrow(() => validateConfig(config));
  assert.equal(resolveAllowedCars(config, catalog).length, 2);
  config = updateCarAdjustment(config, "another_car", {
    ballast: 25,
    restrictor: 0.05,
  });
  assert.deepEqual(config.server.allowed_cars_list_full, [
    { car_name: "another_car", ballast: 25, restrictor: 0.05 },
  ]);
  const updatedCatalog = {
    cars: [...catalog.cars, { name: "newly_installed_car" }],
  };
  const native = resolveAllowedCars(config, updatedCatalog);
  assert.equal(native.length, 3);
  assert.equal(native.find((c) => c.car_name === "another_car").ballast, 25);
  assert.deepEqual(
    native.find((c) => c.car_name === "newly_installed_car"),
    { car_name: "newly_installed_car", ballast: 0, restrictor: 0 },
  );
  const selected = setCarSelectionMode(config, "selected", updatedCatalog);
  assert.deepEqual(selected.server.allowed_cars_list_full, native);
  const allAgain = setCarSelectionMode(selected, "all", updatedCatalog);
  assert.equal(allAgain.server.allowed_cars_list_full.length, 1);
  const reset = updateCarAdjustment(allAgain, "another_car", {
    ballast: 0,
    restrictor: 0,
  });
  assert.deepEqual(reset.server.allowed_cars_list_full, []);
  assert.equal(resolveAllowedCars(reset, updatedCatalog).length, 3);
});
test("selected mode still rejects an empty list and invalid allowance modes", () => {
  const config = defaultConfig();
  config.server.allowed_cars_list_full = [];
  assert.throws(() => validateConfig(config), /Select at least one car/);
  config.runtime.carSelection = "wildcard";
  assert.throws(() => validateConfig(config), /Car selection mode/);
});
