"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { api, download } from "@/components/api";
export default function EntryListPage() {
  const [text, setText] = useState("null");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api("entry-list")
      .then((data) => {
        setText(JSON.stringify(data, null, 2));
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = JSON.parse(text);
      await api("entry-list", value);
      setMessage("Entry list saved. Restart the server to apply it.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack className="page">
      <Title>Entry list</Title>
      <Text c="dimmed">
        Use an EVO entry-list JSON object exported from the official tool. Set
        this to null to disable the local entry list. The server validates its
        contents when it starts.
      </Text>
      {error && <Alert color="red">{error}</Alert>}
      {message && <Alert color="green">{message}</Alert>}
      <Textarea
        label="EVO entry-list JSON"
        className="json"
        autosize
        minRows={18}
        maxRows={30}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        disabled={!loaded}
      />
      <Group>
        <Button loading={busy} disabled={!loaded} onClick={() => void save()}>
          Save entry list
        </Button>
        <Button
          variant="default"
          disabled={!loaded}
          onClick={() => {
            try {
              download("entry-list.json", JSON.parse(text));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Export
        </Button>
      </Group>
    </Stack>
  );
}
