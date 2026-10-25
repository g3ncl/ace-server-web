import type { NextConfig } from "next";
import { version } from "./package.json";
const config: NextConfig = {
  output: "standalone",
  env: { version },
  poweredByHeader: false,
  devIndicators: false,
};
export default config;
