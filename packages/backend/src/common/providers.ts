import {
  FakePaymentProvider,
  SnippePaymentProvider,
  type PaymentProvider,
} from "@advo/payments";
import {
  FakeOmadaAdapter,
  LiveOmadaAdapter,
  loadOpenApiContract,
  openApiContractSchema,
  type CapabilityResult,
  type ControllerCapabilities,
  type OmadaControllerAdapter,
  type OpenApiContract,
  type PortalTimeSemantics,
} from "@advo/omada";
import { prisma, type Controller } from "@advo/db";
import { decryptSecret } from "./crypto.js";

const DEV_FAKE_WEBHOOK_SECRET = "dev_fake_webhook_secret_not_for_production";

let paymentProvider: PaymentProvider | null = null;

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

/** Simulated capabilities may enable features only outside production. */
export function allowSimulated() {
  return !isProduction();
}

export function getPaymentProvider(): PaymentProvider {
  if (paymentProvider) return paymentProvider;
  const mode = process.env.PAYMENT_PROVIDER ?? "fake";
  if (mode === "snippe") {
    paymentProvider = new SnippePaymentProvider({
      apiKey: process.env.SNIPPE_API_KEY ?? "",
      baseUrl: process.env.SNIPPE_BASE_URL ?? "https://api.snippe.sh",
      accountId: process.env.SNIPPE_ACCOUNT_ID || "snippe-primary",
    });
  } else {
    if (isProduction()) throw new Error("PAYMENT_PROVIDER=fake is not allowed in production");
    paymentProvider = new FakePaymentProvider("fake-merchant");
  }
  return paymentProvider;
}

/** Test hook: install a specific provider instance (e.g. a FakePaymentProvider to drive scenarios). */
export function setPaymentProviderForTests(provider: PaymentProvider | null) {
  paymentProvider = provider;
}

export function getWebhookSecret(): string {
  const secret = process.env.SNIPPE_WEBHOOK_SECRET ?? "";
  if (secret) return secret;
  if ((process.env.PAYMENT_PROVIDER ?? "fake") === "fake" && !isProduction()) {
    return DEV_FAKE_WEBHOOK_SECRET;
  }
  return "";
}

export function webhookUrl(): string | undefined {
  const explicit = process.env.SNIPPE_WEBHOOK_URL;
  if (explicit) return explicit;
  const api = process.env.API_PUBLIC_URL;
  return api ? `${api.replace(/\/$/, "")}/api/v1/webhooks/snippe` : undefined;
}

type ControllerCredentials = {
  clientId?: string;
  clientSecret?: string;
  operatorUsername?: string;
  operatorPassword?: string;
  openApiContract?: unknown;
};

const adapterCache = new Map<string, { stamp: number; adapter: OmadaControllerAdapter }>();

export function readControllerCredentials(controller: Controller): ControllerCredentials {
  if (!controller.credentialsEnc) return {};
  return JSON.parse(decryptSecret(controller.credentialsEnc)) as ControllerCredentials;
}

export async function getControllerAdapter(controllerId: string): Promise<{ controller: Controller; adapter: OmadaControllerAdapter }> {
  const controller = await prisma.controller.findUniqueOrThrow({
    where: { id: controllerId },
    include: { capabilities: true },
  });
  const stamp = controller.updatedAt.getTime() + controller.capabilities.reduce((a, c) => a + c.updatedAt.getTime(), 0);
  const cached = adapterCache.get(controllerId);
  if (cached && cached.stamp === stamp) return { controller, adapter: cached.adapter };

  let adapter: OmadaControllerAdapter;
  if (controller.mode === "FAKE") {
    if (isProduction()) throw new Error("FAKE controllers are not allowed in production");
    adapter = new FakeOmadaAdapter();
  } else {
    const creds = readControllerCredentials(controller);
    let contract: OpenApiContract | null = null;
    if (creds.openApiContract) {
      contract = openApiContractSchema.parse(creds.openApiContract);
    } else if (process.env.OMADA_OPENAPI_CONTRACT_PATH) {
      contract = loadOpenApiContract(process.env.OMADA_OPENAPI_CONTRACT_PATH);
    }
    const verified: Partial<Record<keyof ControllerCapabilities, CapabilityResult>> = {};
    for (const cap of controller.capabilities) {
      verified[cap.operation as keyof ControllerCapabilities] = {
        supported: cap.supported,
        verified: cap.verified,
        reason: cap.reason ?? undefined,
        limits: (cap.limits as Record<string, string | number> | null) ?? undefined,
      };
    }
    adapter = new LiveOmadaAdapter({
      baseUrl: controller.baseUrl ?? "",
      omadacId: controller.omadacId ?? "",
      version: controller.version ?? "",
      caCertPath: process.env.OMADA_CA_CERT_PATH || undefined,
      openApi:
        creds.clientId && creds.clientSecret
          ? { clientId: creds.clientId, clientSecret: creds.clientSecret, contract }
          : undefined,
      portal:
        creds.operatorUsername && creds.operatorPassword
          ? {
              operatorUsername: creds.operatorUsername,
              operatorPassword: creds.operatorPassword,
              timeSemantics: (controller.portalTimeSemantics as PortalTimeSemantics | null) ?? null,
            }
          : undefined,
      verifiedCapabilities: verified,
    });
  }
  adapterCache.set(controllerId, { stamp, adapter });
  return { controller, adapter };
}
