import type { NextConfig } from "next";
import { assertPreviewIsolation } from "./config/preview-isolation.mjs";

assertPreviewIsolation(process.env);

const nextConfig: NextConfig = {
  async headers() {
    // ARD: let registries/agent crawlers fetch the capability manifest cross-origin.
    return [
      {
        source: "/.well-known/ai-catalog.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Content-Type", value: "application/json" },
        ],
      },
    ];
  },
};

export default nextConfig;
