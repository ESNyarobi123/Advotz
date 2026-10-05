import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://advo:replace_for_your_environment@localhost:5432/advo_test";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    globalSetup: ["./src/test/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      SECRETS_ENCRYPTION_KEY: "test_only_secrets_key_0123456789abcdef",
      VOUCHER_LOOKUP_HMAC_KEY: "test_only_voucher_key_0123456789abcdef",
      PAYMENT_PROVIDER: "fake",
      RATE_LIMIT_BACKEND: "memory",
      OUTBOX_INLINE: "false",
      ADMIN_MFA_REQUIRED: "true",
      // Keep the suite on real rotating TOTP so the MFA rotation/single-use tests stay meaningful.
      DEV_FIXED_OTP: "",
    },
  },
});
