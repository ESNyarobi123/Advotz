import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    env: {
      SECRETS_ENCRYPTION_KEY: "test_only_secrets_key_0123456789abcdef",
      VOUCHER_LOOKUP_HMAC_KEY: "test_only_voucher_key_0123456789abcdef",
      DEV_FIXED_OTP: "",
    },
  },
});
