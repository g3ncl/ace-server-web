"use client";
import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { RotateCcw, Search } from "lucide-react";
import { useMobileDetection } from "@/hooks/useMobileDetection";
import type { Car, Config } from "./types";
import {
  carSelectionMode,
  hasCarAdjustment,
  setCarSelectionMode,
  updateCarAdjustment,
} from "../../shared/cars.mjs";

type Props = {
  value: Config;
  cars: Car[];
  onChange: (config: Config) => void;
  disabled?: boolean;
};

export default function CarEditor({
  value,
  cars,
  onChange,
  disabled = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const isMobile = useMobileDetection();
  const mode = carSelectionMode(value);
  const all = mode === "all";
  const entries = useMemo(
    () =>
      new Map(
        value.server.allowed_cars_list_full.map((car) => [car.car_name, car]),
      ),
    [value.server.allowed_cars_list_full],
  );
  const allowedCount = all ? cars.length : entries.size;
  const adjustedCount =
    value.server.allowed_cars_list_full.filter(hasCarAdjustment).length;
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cars
      .filter((car) => {
        const entry = entries.get(car.name);
        if (filter === "allowed" && !all && !entry) return false;
        if (filter === "adjusted" && (!entry || !hasCarAdjustment(entry)))
          return false;
        return `${car.display_name} ${car.name}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [cars, search, filter, entries, all]);
  const count = Number(pageSize);
  const pages = Math.max(1, Math.ceil(visible.length / count));
  const currentPage = Math.min(page, pages);
  const rows = visible.slice((currentPage - 1) * count, currentPage * count);

  function toggle(name: string, allowed: boolean) {
    if (all) return;
    const next = value.server.allowed_cars_list_full.filter(
      (car) => car.car_name !== name,
    );
    if (allowed) next.push({ car_name: name, ballast: 0, restrictor: 0 });
    onChange({
      ...value,
      server: { ...value.server, allowed_cars_list_full: next },
    });
  }
  function inputs(car: Car) {
    const entry = entries.get(car.name);
    const allowed = all || !!entry;
    return [
      <NumberInput
        key="ballast"
        aria-label={`Ballast for ${car.display_name}`}
        label={isMobile ? "Ballast (kg)" : undefined}
        value={entry?.ballast || 0}
        min={0}
        max={1000}
        allowDecimal={false}
        disabled={disabled || !allowed}
        w={isMobile ? undefined : 90}
        onChange={(v) =>
          onChange(updateCarAdjustment(value, car.name, { ballast: Number(v) }))
        }
      />,
      <NumberInput
        key="restrictor"
        aria-label={`Restrictor for ${car.display_name}`}
        label={isMobile ? "Restrictor (0–1)" : undefined}
        value={entry?.restrictor || 0}
        min={0}
        max={1}
        step={0.01}
        decimalScale={3}
        disabled={disabled || !allowed}
        w={isMobile ? undefined : 100}
        onChange={(v) =>
          onChange(
            updateCarAdjustment(value, car.name, { restrictor: Number(v) }),
          )
        }
      />,
      <Tooltip key="reset" label="Reset ballast and restrictor">
        <ActionIcon
          aria-label={`Reset adjustments for ${car.display_name}`}
          variant="subtle"
          disabled={disabled || !entry || !hasCarAdjustment(entry)}
          onClick={() =>
            onChange(
              updateCarAdjustment(value, car.name, {
                ballast: 0,
                restrictor: 0,
              }),
            )
          }
        >
          <RotateCcw size={16} />
        </ActionIcon>
      </Tooltip>,
    ];
  }
  function allowControl(car: Car) {
    return all ? (
      <Badge size="xs" color="green" variant="light">
        Allowed
      </Badge>
    ) : (
      <Checkbox
        aria-label={`Allow ${car.display_name}`}
        checked={entries.has(car.name)}
        disabled={disabled}
        onChange={(e) => toggle(car.name, e.currentTarget.checked)}
      />
    );
  }
  function identity(car: Car) {
    return (
      <div>
        <Text size="sm" fw={500}>
          {car.display_name}
        </Text>
        <Text size="xs" c="dimmed">
          PI {car.performance_indicator.toFixed(1)}
          {entries.has(car.name) && hasCarAdjustment(entries.get(car.name)!)
            ? " · Adjusted"
            : ""}
        </Text>
      </div>
    );
  }
  return (
    <Stack gap="md">
      <Select
        label="Car allowance"
        description="Allow every installed car, or select individual models."
        value={mode}
        disabled={disabled}
        allowDeselect={false}
        data={[
          { value: "selected", label: "Selected cars" },
          { value: "all", label: "All installed cars" },
        ]}
        onChange={(next) => {
          if (!next) return;
          onChange(setCarSelectionMode(value, next, { cars }));
          setFilter("all");
          setPage(1);
        }}
      />
      {all && (
        <Text size="sm" c="dimmed">
          New catalog cars are included after updates. Your per-car adjustments
          are preserved.
        </Text>
      )}
      <Group justify="space-between">
        <Text size="sm">
          {allowedCount} of {cars.length} cars allowed · {adjustedCount}{" "}
          adjusted
        </Text>
        {!all && (
          <Button
            size="compact-sm"
            variant="subtle"
            disabled={disabled || entries.size === 0}
            onClick={() =>
              onChange({
                ...value,
                server: { ...value.server, allowed_cars_list_full: [] },
              })
            }
          >
            Clear selection
          </Button>
        )}
      </Group>
      <div className="car-toolbar">
        <TextInput
          label="Search cars"
          placeholder="Name, model or preset ID"
          leftSection={<Search size={16} />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Select
          label="Show"
          value={filter}
          allowDeselect={false}
          data={[
            { value: "all", label: "All cars" },
            ...(!all ? [{ value: "allowed", label: "Allowed only" }] : []),
            { value: "adjusted", label: "Adjusted only" },
          ]}
          onChange={(next) => {
            setFilter(next || "all");
            setPage(1);
          }}
        />
        <Select
          label="Rows per page"
          w={105}
          value={pageSize}
          allowDeselect={false}
          data={["10", "20", "50"]}
          onChange={(next) => {
            setPageSize(next || "10");
            setPage(1);
          }}
        />
      </div>
      {visible.length === 0 ? (
        <Text size="sm" c="dimmed">
          No cars match these filters.
        </Text>
      ) : isMobile ? (
        <Stack gap="sm">
          {rows.map((car) => (
            <Stack gap="xs" className="session-box" key={car.name}>
              <Group wrap="nowrap" justify="space-between">
                {identity(car)}
                {allowControl(car)}
              </Group>
              <div className="car-mobile-inputs">{inputs(car)}</div>
            </Stack>
          ))}
        </Stack>
      ) : (
        <div className="car-table">
          <Table
            verticalSpacing="xs"
            horizontalSpacing="xs"
            withRowBorders
            layout="fixed"
          >
            <Table.Thead>
              <Table.Tr>
                {!all && <Table.Th w={72}>Allowed</Table.Th>}
                <Table.Th>Car</Table.Th>
                <Table.Th w={100}>Ballast (kg)</Table.Th>
                <Table.Th w={110}>Restrictor <span className="no-wrap">(0–1)</span></Table.Th>
                <Table.Th w={36}>
                  <span className="sr-only">Reset</span>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((car) => {
                const [ballast, restrictor, reset] = inputs(car);
                return (
                  <Table.Tr key={car.name}>
                    {!all && <Table.Td>{allowControl(car)}</Table.Td>}
                    <Table.Td>{identity(car)}</Table.Td>
                    <Table.Td>{ballast}</Table.Td>
                    <Table.Td>{restrictor}</Table.Td>
                    <Table.Td>{reset}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {visible.length ? (currentPage - 1) * count + 1 : 0}–
          {Math.min(currentPage * count, visible.length)} of {visible.length}{" "}
          matching cars
        </Text>
        <Pagination
          total={pages}
          value={currentPage}
          onChange={setPage}
          size="sm"
          siblings={1}
          boundaries={1}
        />
      </Group>
      <Text size="xs" c="dimmed">
        Save Configuration, then restart the server to apply allowance and
        adjustment changes.
      </Text>
    </Stack>
  );
}
