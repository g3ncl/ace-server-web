import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@fontsource/ubuntu/latin-400.css";
import "@fontsource/ubuntu/latin-500.css";
import "@fontsource/ubuntu/latin-700.css";
import "./globals.css";
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import Layout from "@/components/Layout/Layout";

export const metadata: Metadata = {
  title: "ACE Server Web",
  description: "Assetto Corsa EVO dedicated server management",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <MantineProvider
          defaultColorScheme="auto"
          theme={{ primaryColor: "red", fontFamily: "Ubuntu, sans-serif" }}
        >
          <Notifications position="bottom-right" />
          <Layout>{children}</Layout>
        </MantineProvider>
      </body>
    </html>
  );
}
