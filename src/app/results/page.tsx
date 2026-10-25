"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { api, download } from "@/components/api";
type Result = { name: string; size: number; modified: string };
export default function ResultsPage() {
  const [files, setFiles] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setFiles(await api<Result[]>("results"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <Stack className="page">
      <Group justify="space-between">
        <Title>Results</Title>
        <Button variant="default" onClick={() => void refresh()}>
          Refresh
        </Button>
      </Group>
      <Text c="dimmed">
        JSON results written by the EVO server after a session finishes.
      </Text>
      {error && <Alert color="red">{error}</Alert>}
      {files.length === 0 && (
        <Card withBorder>
          <Text>No session results yet.</Text>
        </Card>
      )}
      {files
        .sort((a, b) => b.modified.localeCompare(a.modified))
        .map((file) => (
          <Card withBorder key={file.name}>
            <Group justify="space-between">
              <div>
                <Text fw={500}>{file.name}</Text>
                <Text size="sm" c="dimmed">
                  {new Date(file.modified).toLocaleString()} ·{" "}
                  {Math.ceil(file.size / 1024)} KB
                </Text>
              </div>
              <Button
                variant="light"
                onClick={async () => {
                  try {
                    download(
                      file.name,
                      await api(
                        `results/download?name=${encodeURIComponent(file.name)}`,
                      ),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Download
              </Button>
            </Group>
          </Card>
        ))}
    </Stack>
  );
}
