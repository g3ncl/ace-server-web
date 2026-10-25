"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { api } from "@/components/api";
export default function LogsPage() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [follow, setFollow] = useState(true);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const data = await api<{ text: string }>("logs");
        if (alive) {
          setText(data.text);
          setError("");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, follow]);
  return (
    <Stack className="page">
      <Title>Server logs</Title>
      <Text c="dimmed">
        Live output from the current run. Password fields are redacted.
      </Text>
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="space-between">
        <Switch
          label="Follow output"
          checked={follow}
          onChange={(e) => setFollow(e.currentTarget.checked)}
        />
        <Button
          variant="default"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([text], { type: "text/plain" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "ace-server.log";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download logs
        </Button>
      </Group>
      <pre className="log" ref={ref}>
        {text || "Start the server to see its output."}
      </pre>
    </Stack>
  );
}
