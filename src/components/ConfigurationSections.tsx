"use client";
import { Accordion, Box, Tabs } from "@mantine/core";
import { useMobileDetection } from "@/hooks/useMobileDetection";
import {
  Children,
  isValidElement,
  ReactElement,
  ReactNode,
  useState,
} from "react";

const names: Record<string, string> = {
  server: "Server",
  event: "Event",
  cars: "Cars",
  sessions: "Sessions",
  json: "JSON",
};
type Panel = ReactElement<{ value: string; children: ReactNode }>;

// Match ACC's desktop tabs and mobile accordion using EVO sections.
export default function ConfigurationSections({
  children,
}: {
  children: ReactNode;
}) {
  const isMobile = useMobileDetection();
  const [active, setActive] = useState<string | null>(null);
  const panels = Children.toArray(children).filter(isValidElement) as Panel[];
  if (isMobile)
    return (
      <Accordion value={active} onChange={setActive}>
        {panels.map((panel) => (
          <Accordion.Item key={panel.props.value} value={panel.props.value}>
            <Accordion.Control>{names[panel.props.value]}</Accordion.Control>
            <Accordion.Panel>{panel.props.children}</Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    );
  return (
    <Tabs
      variant="default"
      value={active || "server"}
      onChange={setActive}
      keepMounted={false}
    >
      <Tabs.List grow justify="center">
        {panels.map((panel) => (
          <Tabs.Tab fw="500" key={panel.props.value} value={panel.props.value}>
            {names[panel.props.value]}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {panels.map((panel) => (
        <Tabs.Panel key={panel.props.value} value={panel.props.value}>
          <Box className="config-section" p="md">
            {panel.props.children}
          </Box>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
