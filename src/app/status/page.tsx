"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Divider,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Flex,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "@/components/api";
import type { Status } from "@/components/types";
import { useMobileDetection } from "@/hooks/useMobileDetection";
import classes from "@/notifications/notifications.module.css";

export default function StatusPage() {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const pending = useRef("");
  const isMobile = useMobileDetection();
  const position = isMobile
    ? ("bottom-center" as const)
    : ("bottom-right" as const);
  const refresh = useCallback(async () => {
    try {
      const next = await api<Status>("status");
      setStatus(next);
      const action = pending.current;
      if (action && ["running", "stopped", "failed"].includes(next.state)) {
        const success =
          action === "stop"
            ? next.state === "stopped"
            : next.state === "running";
        notifications.update({
          id: "server-control",
          color: success ? "green" : "red",
          title: success
            ? `Server ${action === "stop" ? "stopped" : action === "restart" ? "restarted" : "started"}`
            : "Server control error",
          message: success
            ? "Operation completed successfully."
            : next.lastExit?.error || "Server failed to start. Check the logs.",
          loading: false,
          autoClose: 2000,
          classNames: classes,
          position,
        });
        pending.current = "";
        setBusy("");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [position]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function control(action: string) {
    setBusy(action);
    setError("");
    notifications.show({
      id: "server-control",
      color: "gray",
      title: `${action === "stop" ? "Stopping" : action === "restart" ? "Restarting" : "Starting"} server`,
      message: "Please wait while the operation completes...",
      loading: true,
      autoClose: false,
      classNames: classes,
      position,
    });
    try {
      const next = await api<Status>(action, {});
      setStatus(next);
      pending.current = action;
      await refresh();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      pending.current = "";
      setBusy("");
      notifications.update({
        id: "server-control",
        color: "red",
        title: "Server control error",
        message,
        loading: false,
        autoClose: 4000,
        classNames: classes,
        position,
      });
    }
  }
  const active = !!status?.pid;
  return (
    <Container size="sm">
      <Stack gap="md">
        {error && (
          <Alert color="red" title="Server status error">
            {error}
          </Alert>
        )}
        {status && !status.installed && (
          <Alert color="red">
            Server files are missing. Set ACE_SERVER_DIR to the installed
            dedicated server folder.
          </Alert>
        )}
        {status?.pendingChanges && (
          <Alert color="yellow">
            Saved configuration has changed. Restart the server to apply it.
          </Alert>
        )}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="xl">
            <Flex align="center" justify="flex-start" gap={16}>
              <Text fw={500}>Server Status:</Text>
              <Badge
                color={
                  !status
                    ? "gray"
                    : status.state === "running"
                      ? "green"
                      : ["stopped", "failed"].includes(status.state)
                        ? "red"
                        : "gray"
                }
              >
                {status ? status.state : "Retrieving status..."}
              </Badge>
            </Flex>
            {status && (
              <Stack gap="md">
                <Divider />
                <Stack gap="xs">
                  <Text fw={500}>{status.serverName}</Text>
                  <Text size="sm">
                    {status.track.track} · {status.track.layout}
                  </Text>
                  <Text size="sm">
                    Game TCP: {status.ports.tcp} · Game UDP: {status.ports.udp}{" "}
                    · EVO HTTP: {status.ports.http} TCP
                  </Text>
                  <Text size="sm">
                    Lobby registration:{" "}
                    {status.registerLobby ? "Enabled" : "Disabled"}
                  </Text>
                  {status.startedAt && (
                    <Text size="sm" c="dimmed">
                      Last started:{" "}
                      {new Date(status.startedAt).toLocaleString()}
                    </Text>
                  )}
                  {status.lastExit && (
                    <Text size="sm" c="dimmed">
                      Last exit:{" "}
                      {status.lastExit.error ||
                        status.lastExit.signal ||
                        status.lastExit.code}
                    </Text>
                  )}
                </Stack>
              </Stack>
            )}
            <Group justify="flex-end">
              {!active && (
                <Button
                  variant="filled"
                  color="green"
                  onClick={() => void control("start")}
                  disabled={!status?.installed || !!busy}
                  loading={busy === "start"}
                >
                  Start
                </Button>
              )}
              {active && (
                <>
                  <Button
                    variant="filled"
                    color="red"
                    onClick={() => void control("stop")}
                    disabled={!!busy}
                    loading={busy === "stop"}
                  >
                    Stop
                  </Button>
                  <Button
                    variant="light"
                    color="blue"
                    onClick={() => void control("restart")}
                    disabled={!!busy}
                    loading={busy === "restart"}
                  >
                    Restart
                  </Button>
                </>
              )}
            </Group>
          </Stack>
        </Card>

      </Stack>
    </Container>
  );
}
