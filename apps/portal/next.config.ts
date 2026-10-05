import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@advo/ui", "@advo/i18n", "@advo/api-client", "@advo/contracts"],
};

export default nextConfig;
