export const carSelectionMode = (config) =>
  config.runtime.carSelection ?? "selected";
export const hasCarAdjustment = (car) =>
  car.ballast !== 0 || car.restrictor !== 0;

// EVO receives an explicit list. The manager can store a catalog-wide policy
// with sparse overrides so newly installed cars are included at the next start.
export function resolveAllowedCars(config, catalog) {
  if (carSelectionMode(config) !== "all")
    return config.server.allowed_cars_list_full;
  const overrides = new Map(
    config.server.allowed_cars_list_full.map((car) => [car.car_name, car]),
  );
  return catalog.cars.map(
    (car) =>
      overrides.get(car.name) || {
        car_name: car.name,
        ballast: 0,
        restrictor: 0,
      },
  );
}

export function setCarSelectionMode(config, mode, catalog) {
  const entries =
    mode === "all"
      ? config.server.allowed_cars_list_full.filter(hasCarAdjustment)
      : resolveAllowedCars(config, catalog);
  return {
    ...config,
    runtime: { ...config.runtime, carSelection: mode },
    server: { ...config.server, allowed_cars_list_full: entries },
  };
}

export function updateCarAdjustment(config, name, changes) {
  const entries = config.server.allowed_cars_list_full;
  const existing = entries.find((car) => car.car_name === name);
  const updated = {
    ...(existing || { car_name: name, ballast: 0, restrictor: 0 }),
    ...changes,
  };
  const next = entries.filter((car) => car.car_name !== name);
  if (carSelectionMode(config) !== "all" || hasCarAdjustment(updated))
    next.push(updated);
  return {
    ...config,
    server: { ...config.server, allowed_cars_list_full: next },
  };
}
