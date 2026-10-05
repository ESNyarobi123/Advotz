import "@advo/config/load-env";
import { AuthService } from "@advo/backend";
import { loadServerEnvSafe } from "./bootstrap-helpers.js";

async function main() {
  loadServerEnvSafe();

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "Advo Admin";

  if (!email || !password) {
    console.error(
      "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before running admin:bootstrap",
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters");
    process.exit(1);
  }

  const auth = new AuthService();
  const result = await auth.bootstrapAdmin({ email, password, name });
  console.log("Admin bootstrapped:", result);
}

main().catch((err) => {
  const body = (err as { response?: { message?: unknown } }).response;
  console.error(typeof body?.message === "string" ? `admin:bootstrap refused: ${body.message}` : err);
  process.exit(1);
});
