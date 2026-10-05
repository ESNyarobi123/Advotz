-- CreateEnum
CREATE TYPE "SubscriptionState" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ControllerMode" AS ENUM ('FAKE', 'LIVE');

-- CreateEnum
CREATE TYPE "SiteState" AS ENUM ('REQUESTED', 'PROVISIONING', 'AWAITING_DEVICE', 'READY', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "MappingState" AS ENUM ('PENDING', 'PROVISIONING', 'PROVISIONED', 'MANUAL_REQUIRED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "DeviceClaimState" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'ADOPTION_PENDING', 'ADOPTED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuotaType" AS ENUM ('UNLIMITED', 'TOTAL', 'DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderPurpose" AS ENUM ('WIFI_PACKAGE', 'PLATFORM_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "OrderPaymentState" AS ENUM ('UNPAID', 'PAID', 'OVERPAID', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "FulfillmentState" AS ENUM ('NOT_STARTED', 'PENDING', 'FULFILLED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "PaymentAttemptState" AS ENUM ('CREATED', 'DISPATCHING', 'PENDING', 'UNKNOWN', 'COMPLETED', 'FAILED', 'VOIDED', 'EXPIRED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "InboxState" AS ENUM ('RECEIVED', 'PROCESSED', 'QUARANTINED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "VoucherGroupState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VoucherState" AS ENUM ('UNUSED', 'REDEEMED', 'REVOKED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "GrantState" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'EXPIRED', 'QUOTA_EXHAUSTED', 'REVOKED', 'ACTIVATION_FAILED');

-- CreateEnum
CREATE TYPE "GrantDeviceAuthState" AS ENUM ('RESERVED', 'AUTHORIZING', 'AUTHORIZED', 'UNKNOWN', 'REVOKE_PENDING', 'REVOKED', 'FAILED');

-- CreateEnum
CREATE TYPE "TerminationCategory" AS ENUM ('USER_DISCONNECTED', 'CONNECTION_LOST', 'ENTITLEMENT_EXPIRED', 'QUOTA_ACTION', 'EXPLICIT_REVOKE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CommissionTrigger" AS ENUM ('FIRST_SUBSCRIPTION_PAYMENT', 'SUBSCRIPTION_RENEWAL');

-- CreateEnum
CREATE TYPE "CommissionMode" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "CommissionState" AS ENUM ('PENDING_HOLD', 'AVAILABLE', 'RESERVED_FOR_WITHDRAWAL', 'PAID', 'REVERSED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "LedgerOwnerType" AS ENUM ('PLATFORM', 'RESELLER', 'AGENT');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('PROVIDER_CLEARING', 'PLATFORM_SUBSCRIPTION_REVENUE', 'PLATFORM_SALE_FEE_REVENUE', 'PROVIDER_FEE_EXPENSE', 'COMMISSION_EXPENSE', 'OVERPAYMENT_LIABILITY', 'RESELLER_PAYABLE', 'AGENT_PENDING_PAYABLE', 'AGENT_AVAILABLE_PAYABLE', 'WITHDRAWAL_RESERVE', 'PAYOUT_CLEARING');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "BeneficiaryType" AS ENUM ('RESELLER', 'AGENT');

-- CreateEnum
CREATE TYPE "WithdrawalState" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'UNKNOWN', 'COMPLETED', 'FAILED', 'REVERSED', 'REJECTED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "PayoutAttemptState" AS ENUM ('CREATED', 'DISPATCHING', 'PENDING', 'UNKNOWN', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "OperationState" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'NEEDS_REVIEW', 'UNSUPPORTED');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "resellerId" UUID;

-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "mfaPassed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "lastError" TEXT;

-- CreateTable
CREATE TABLE "PlatformPlan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "priceTzs" BIGINT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "trialEligible" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER,
    "maxSites" INTEGER NOT NULL,
    "maxDevices" INTEGER NOT NULL,
    "maxPackages" INTEGER NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "state" "SubscriptionState" NOT NULL DEFAULT 'NONE',
    "planId" UUID,
    "entitlements" JSONB,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialUsedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "amountTzs" BIGINT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "isFirstPayment" BOOLEAN,
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Controller" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'software',
    "mode" "ControllerMode" NOT NULL,
    "baseUrl" TEXT,
    "omadacId" TEXT,
    "version" TEXT,
    "portalTimeSemantics" TEXT,
    "credentialsEnc" TEXT,
    "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastHealthAt" TIMESTAMP(3),
    "lastHealthError" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Controller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControllerCapability" (
    "id" UUID NOT NULL,
    "controllerId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "supported" BOOLEAN NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "reason" TEXT,
    "limits" JSONB,
    "evidence" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControllerCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    "slug" TEXT NOT NULL,
    "state" "SiteState" NOT NULL DEFAULT 'REQUESTED',
    "portalTitle" TEXT,
    "portalMessage" TEXT,
    "landingUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControllerSiteMapping" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "controllerId" UUID NOT NULL,
    "remoteSiteId" TEXT,
    "remoteName" TEXT NOT NULL,
    "state" "MappingState" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControllerSiteMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceClaim" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "mac" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "hardwareVersion" TEXT,
    "serial" TEXT,
    "state" "DeviceClaimState" NOT NULL DEFAULT 'SUBMITTED',
    "reviewReason" TEXT,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "deviceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "controllerId" UUID,
    "mac" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "hardwareVersion" TEXT,
    "firmware" TEXT,
    "observedStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WifiPackage" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentRevisionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WifiPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageRevision" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "priceTzs" BIGINT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "downloadKbps" INTEGER,
    "uploadKbps" INTEGER,
    "quotaType" "QuotaType" NOT NULL DEFAULT 'UNLIMITED',
    "quotaBytes" BIGINT,
    "maxDevices" INTEGER NOT NULL DEFAULT 1,
    "activationWindowSeconds" INTEGER NOT NULL DEFAULT 86400,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageSiteAssignment" (
    "packageId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageSiteAssignment_pkey" PRIMARY KEY ("packageId","siteId")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalContext" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "siteId" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "clientMac" TEXT NOT NULL,
    "clientIp" TEXT,
    "apMac" TEXT,
    "gatewayMac" TEXT,
    "ssidName" TEXT,
    "radioId" TEXT,
    "vid" TEXT,
    "remoteSiteId" TEXT,
    "redirectUrl" TEXT,
    "corroborated" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "purpose" "OrderPurpose" NOT NULL,
    "resellerId" UUID NOT NULL,
    "siteId" UUID,
    "customerId" UUID,
    "packageRevisionId" UUID,
    "invoiceId" UUID,
    "amountTzs" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "priceSnapshot" JSONB NOT NULL,
    "paymentState" "OrderPaymentState" NOT NULL DEFAULT 'UNPAID',
    "fulfillmentState" "FulfillmentState" NOT NULL DEFAULT 'NOT_STARTED',
    "publicTokenHash" TEXT,
    "portalContextId" UUID,
    "clientMac" TEXT,
    "requestIdempotencyKey" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "state" "PaymentAttemptState" NOT NULL DEFAULT 'CREATED',
    "expiresAt" TIMESTAMP(3),
    "amountReceivedTzs" BIGINT,
    "feeTzs" BIGINT,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookInboxEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "state" "InboxState" NOT NULL DEFAULT 'RECEIVED',
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookInboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherGroup" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "packageRevisionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "VoucherGroupState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "codeLookup" TEXT NOT NULL,
    "codeEnc" TEXT NOT NULL,
    "state" "VoucherState" NOT NULL DEFAULT 'UNUSED',
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "orderId" UUID,
    "voucherId" UUID,
    "packageRevisionId" UUID NOT NULL,
    "packageSnapshot" JSONB NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "maxDevices" INTEGER NOT NULL,
    "state" "GrantState" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "activationDeadline" TIMESTAMP(3) NOT NULL,
    "candidateActivatedAt" TIMESTAMP(3),
    "candidateExpiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "recoveryTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrantDevice" (
    "id" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "clientMac" TEXT NOT NULL,
    "portalContextId" UUID,
    "authState" "GrantDeviceAuthState" NOT NULL DEFAULT 'RESERVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "controllerResponse" JSONB,
    "authorizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessGrantDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkSession" (
    "id" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "grantDeviceId" UUID NOT NULL,
    "clientMac" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "terminationCategory" "TerminationCategory",

    CONSTRAINT "NetworkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPolicy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "agentId" UUID,
    "trigger" "CommissionTrigger" NOT NULL,
    "mode" "CommissionMode" NOT NULL,
    "fixedTzs" BIGINT,
    "basisPoints" INTEGER,
    "eligiblePlanCodes" TEXT[],
    "referralEligibilityDays" INTEGER,
    "holdDays" INTEGER NOT NULL DEFAULT 0,
    "maxPerInvoiceTzs" BIGINT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionAccrual" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "resellerId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "sourcePaymentId" UUID NOT NULL,
    "trigger" "CommissionTrigger" NOT NULL,
    "policyId" UUID NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "eligibleBaseTzs" BIGINT NOT NULL,
    "amountTzs" BIGINT NOT NULL,
    "reservedTzs" BIGINT NOT NULL DEFAULT 0,
    "paidTzs" BIGINT NOT NULL DEFAULT 0,
    "reversedTzs" BIGINT NOT NULL DEFAULT 0,
    "state" "CommissionState" NOT NULL DEFAULT 'PENDING_HOLD',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" UUID NOT NULL,
    "ownerType" "LedgerOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "normalBalance" "NormalBalance" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reversesJournalId" UUID,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "debitTzs" BIGINT NOT NULL DEFAULT 0,
    "creditTzs" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutDestination" (
    "id" UUID NOT NULL,
    "ownerType" "BeneficiaryType" NOT NULL,
    "ownerId" UUID NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" UUID NOT NULL,
    "ownerType" "BeneficiaryType" NOT NULL,
    "ownerId" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "destinationSnapshot" JSONB NOT NULL,
    "amountTzs" BIGINT NOT NULL,
    "providerFeeTzs" BIGINT NOT NULL,
    "platformFeeTzs" BIGINT NOT NULL,
    "totalDebitTzs" BIGINT NOT NULL,
    "feeQuoteSnapshot" JSONB NOT NULL,
    "quotedAt" TIMESTAMP(3) NOT NULL,
    "state" "WithdrawalState" NOT NULL DEFAULT 'REQUESTED',
    "reviewReason" TEXT,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "requestIdempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalAllocation" (
    "id" UUID NOT NULL,
    "withdrawalId" UUID NOT NULL,
    "accrualId" UUID,
    "amountTzs" BIGINT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAttempt" (
    "id" UUID NOT NULL,
    "withdrawalId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "state" "PayoutAttemptState" NOT NULL DEFAULT 'CREATED',
    "feeTzs" BIGINT,
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkOperation" (
    "id" UUID NOT NULL,
    "resellerId" UUID,
    "siteId" UUID,
    "kind" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "state" "OperationState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "responseSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientUserId" UUID,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "assignedAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PlatformPlan_active_idx" ON "PlatformPlan"("active");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPlan_code_version_key" ON "PlatformPlan"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_resellerId_key" ON "Subscription"("resellerId");

-- CreateIndex
CREATE INDEX "Subscription_state_currentPeriodEnd_idx" ON "Subscription"("state", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_resellerId_createdAt_idx" ON "SubscriptionInvoice"("resellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ControllerCapability_controllerId_operation_key" ON "ControllerCapability"("controllerId", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "Site_slug_key" ON "Site"("slug");

-- CreateIndex
CREATE INDEX "Site_resellerId_state_idx" ON "Site"("resellerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Site_id_resellerId_key" ON "Site"("id", "resellerId");

-- CreateIndex
CREATE UNIQUE INDEX "ControllerSiteMapping_siteId_key" ON "ControllerSiteMapping"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "ControllerSiteMapping_controllerId_remoteSiteId_key" ON "ControllerSiteMapping"("controllerId", "remoteSiteId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceClaim_deviceId_key" ON "DeviceClaim"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceClaim_resellerId_state_idx" ON "DeviceClaim"("resellerId", "state");

-- CreateIndex
CREATE INDEX "DeviceClaim_mac_idx" ON "DeviceClaim"("mac");

-- CreateIndex
CREATE UNIQUE INDEX "Device_mac_key" ON "Device"("mac");

-- CreateIndex
CREATE INDEX "Device_resellerId_siteId_idx" ON "Device"("resellerId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "WifiPackage_currentRevisionId_key" ON "WifiPackage"("currentRevisionId");

-- CreateIndex
CREATE INDEX "WifiPackage_resellerId_status_idx" ON "WifiPackage"("resellerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WifiPackage_id_resellerId_key" ON "WifiPackage"("id", "resellerId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageRevision_packageId_revision_key" ON "PackageRevision"("packageId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "PackageRevision_id_resellerId_key" ON "PackageRevision"("id", "resellerId");

-- CreateIndex
CREATE INDEX "PackageSiteAssignment_siteId_idx" ON "PackageSiteAssignment"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_resellerId_phone_key" ON "Customer"("resellerId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "PortalContext_tokenHash_key" ON "PortalContext"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalContext_clientMac_idx" ON "PortalContext"("clientMac");

-- CreateIndex
CREATE INDEX "PortalContext_expiresAt_idx" ON "PortalContext"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceId_key" ON "Order"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicTokenHash_key" ON "Order"("publicTokenHash");

-- CreateIndex
CREATE INDEX "Order_resellerId_createdAt_idx" ON "Order"("resellerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentState_fulfillmentState_idx" ON "Order"("paymentState", "fulfillmentState");

-- CreateIndex
CREATE UNIQUE INDEX "Order_resellerId_requestIdempotencyKey_key" ON "Order"("resellerId", "requestIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAttempt_state_updatedAt_idx" ON "PaymentAttempt"("state", "updatedAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerAccountId_providerReference_key" ON "PaymentAttempt"("providerAccountId", "providerReference");

-- CreateIndex
CREATE INDEX "WebhookInboxEvent_state_receivedAt_idx" ON "WebhookInboxEvent"("state", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookInboxEvent_providerAccountId_eventId_key" ON "WebhookInboxEvent"("providerAccountId", "eventId");

-- CreateIndex
CREATE INDEX "VoucherGroup_resellerId_state_idx" ON "VoucherGroup"("resellerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_codeLookup_key" ON "Voucher"("codeLookup");

-- CreateIndex
CREATE INDEX "Voucher_resellerId_state_idx" ON "Voucher"("resellerId", "state");

-- CreateIndex
CREATE INDEX "Voucher_groupId_idx" ON "Voucher"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_orderId_key" ON "AccessGrant"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_voucherId_key" ON "AccessGrant"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_recoveryTokenHash_key" ON "AccessGrant"("recoveryTokenHash");

-- CreateIndex
CREATE INDEX "AccessGrant_resellerId_state_idx" ON "AccessGrant"("resellerId", "state");

-- CreateIndex
CREATE INDEX "AccessGrant_state_expiresAt_idx" ON "AccessGrant"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "AccessGrantDevice_authState_idx" ON "AccessGrantDevice"("authState");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrantDevice_grantId_clientMac_key" ON "AccessGrantDevice"("grantId", "clientMac");

-- CreateIndex
CREATE INDEX "NetworkSession_grantId_idx" ON "NetworkSession"("grantId");

-- CreateIndex
CREATE INDEX "CommissionPolicy_trigger_effectiveFrom_idx" ON "CommissionPolicy"("trigger", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommissionAccrual_agentId_state_idx" ON "CommissionAccrual"("agentId", "state");

-- CreateIndex
CREATE INDEX "CommissionAccrual_state_availableAt_idx" ON "CommissionAccrual"("state", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionAccrual_sourcePaymentId_agentId_trigger_key" ON "CommissionAccrual"("sourcePaymentId", "agentId", "trigger");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_ownerType_ownerId_type_currency_key" ON "LedgerAccount"("ownerType", "ownerId", "type", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_sourceKey_key" ON "Journal"("sourceKey");

-- CreateIndex
CREATE INDEX "Journal_sourceType_createdAt_idx" ON "Journal"("sourceType", "createdAt");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_createdAt_idx" ON "JournalLine"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalLine_journalId_idx" ON "JournalLine"("journalId");

-- CreateIndex
CREATE INDEX "PayoutDestination_ownerType_ownerId_idx" ON "PayoutDestination"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Withdrawal_state_createdAt_idx" ON "Withdrawal"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_ownerType_ownerId_requestIdempotencyKey_key" ON "Withdrawal"("ownerType", "ownerId", "requestIdempotencyKey");

-- CreateIndex
CREATE INDEX "WithdrawalAllocation_withdrawalId_idx" ON "WithdrawalAllocation"("withdrawalId");

-- CreateIndex
CREATE INDEX "WithdrawalAllocation_accrualId_idx" ON "WithdrawalAllocation"("accrualId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_idempotencyKey_key" ON "PayoutAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PayoutAttempt_state_updatedAt_idx" ON "PayoutAttempt"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_providerAccountId_providerReference_key" ON "PayoutAttempt"("providerAccountId", "providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkOperation_idempotencyKey_key" ON "NetworkOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NetworkOperation_resellerId_createdAt_idx" ON "NetworkOperation"("resellerId", "createdAt");

-- CreateIndex
CREATE INDEX "NetworkOperation_state_nextRetryAt_idx" ON "NetworkOperation"("state", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_createdAt_idx" ON "Notification"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_ownerUserId_state_idx" ON "SupportTicket"("ownerUserId", "state");

-- CreateIndex
CREATE INDEX "SupportTicket_state_createdAt_idx" ON "SupportTicket"("state", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resellerId_createdAt_idx" ON "AuditEvent"("resellerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControllerCapability" ADD CONSTRAINT "ControllerCapability_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "Controller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControllerSiteMapping" ADD CONSTRAINT "ControllerSiteMapping_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControllerSiteMapping" ADD CONSTRAINT "ControllerSiteMapping_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "Controller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceClaim" ADD CONSTRAINT "DeviceClaim_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceClaim" ADD CONSTRAINT "DeviceClaim_siteId_resellerId_fkey" FOREIGN KEY ("siteId", "resellerId") REFERENCES "Site"("id", "resellerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceClaim" ADD CONSTRAINT "DeviceClaim_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_siteId_resellerId_fkey" FOREIGN KEY ("siteId", "resellerId") REFERENCES "Site"("id", "resellerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "Controller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WifiPackage" ADD CONSTRAINT "WifiPackage_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WifiPackage" ADD CONSTRAINT "WifiPackage_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "PackageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageRevision" ADD CONSTRAINT "PackageRevision_packageId_resellerId_fkey" FOREIGN KEY ("packageId", "resellerId") REFERENCES "WifiPackage"("id", "resellerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageSiteAssignment" ADD CONSTRAINT "PackageSiteAssignment_packageId_resellerId_fkey" FOREIGN KEY ("packageId", "resellerId") REFERENCES "WifiPackage"("id", "resellerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageSiteAssignment" ADD CONSTRAINT "PackageSiteAssignment_siteId_resellerId_fkey" FOREIGN KEY ("siteId", "resellerId") REFERENCES "Site"("id", "resellerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalContext" ADD CONSTRAINT "PortalContext_siteId_resellerId_fkey" FOREIGN KEY ("siteId", "resellerId") REFERENCES "Site"("id", "resellerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packageRevisionId_fkey" FOREIGN KEY ("packageRevisionId") REFERENCES "PackageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SubscriptionInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherGroup" ADD CONSTRAINT "VoucherGroup_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherGroup" ADD CONSTRAINT "VoucherGroup_packageRevisionId_resellerId_fkey" FOREIGN KEY ("packageRevisionId", "resellerId") REFERENCES "PackageRevision"("id", "resellerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "VoucherGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_packageRevisionId_fkey" FOREIGN KEY ("packageRevisionId") REFERENCES "PackageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrantDevice" ADD CONSTRAINT "AccessGrantDevice_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AccessGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkSession" ADD CONSTRAINT "NetworkSession_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AccessGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkSession" ADD CONSTRAINT "NetworkSession_grantDeviceId_fkey" FOREIGN KEY ("grantDeviceId") REFERENCES "AccessGrantDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "CommissionPolicy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SubscriptionInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "CommissionPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "PayoutDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalAllocation" ADD CONSTRAINT "WithdrawalAllocation_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalAllocation" ADD CONSTRAINT "WithdrawalAllocation_accrualId_fkey" FOREIGN KEY ("accrualId") REFERENCES "CommissionAccrual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Invariants Prisma cannot express ─────────────

-- Money columns must be non-negative.
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_amounts_check"
  CHECK ("debitTzs" >= 0 AND "creditTzs" >= 0 AND ("debitTzs" = 0) <> ("creditTzs" = 0));
ALTER TABLE "Order" ADD CONSTRAINT "Order_amount_check" CHECK ("amountTzs" > 0);
ALTER TABLE "PackageRevision" ADD CONSTRAINT "PackageRevision_values_check"
  CHECK ("priceTzs" > 0 AND "durationSeconds" > 0 AND "maxDevices" >= 1);
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "CommissionPolicy_mode_check"
  CHECK (("mode" = 'FIXED' AND "fixedTzs" > 0) OR ("mode" = 'PERCENTAGE' AND "basisPoints" BETWEEN 1 AND 10000));
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_amounts_check"
  CHECK ("amountTzs" >= 0 AND "reservedTzs" >= 0 AND "paidTzs" >= 0 AND "reversedTzs" >= 0
         AND "reservedTzs" + "paidTzs" + "reversedTzs" <= "amountTzs");
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_amounts_check"
  CHECK ("amountTzs" > 0 AND "providerFeeTzs" >= 0 AND "platformFeeTzs" >= 0
         AND "totalDebitTzs" = "amountTzs" + "providerFeeTzs" + "platformFeeTzs");

-- Journals are append-only.
CREATE FUNCTION advo_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ledger rows are append-only (% on %)', TG_OP, TG_TABLE_NAME;
END $$;
CREATE TRIGGER "JournalLine_append_only" BEFORE UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION advo_forbid_mutation();
CREATE TRIGGER "Journal_append_only" BEFORE UPDATE OR DELETE ON "Journal"
  FOR EACH ROW EXECUTE FUNCTION advo_forbid_mutation();

-- Every journal must balance at commit time.
CREATE FUNCTION advo_check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  diff NUMERIC;
  cnt INT;
BEGIN
  SELECT COALESCE(SUM("debitTzs") - SUM("creditTzs"), 0), COUNT(*) INTO diff, cnt
    FROM "JournalLine" WHERE "journalId" = NEW."journalId";
  IF cnt < 2 OR diff <> 0 THEN
    RAISE EXCEPTION 'Journal % is unbalanced (lines=%, diff=%)', NEW."journalId", cnt, diff;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "JournalLine_balanced" AFTER INSERT ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION advo_check_journal_balance();

-- One open withdrawal reserve per beneficiary.
CREATE UNIQUE INDEX "Withdrawal_active_reserve_key" ON "Withdrawal" ("ownerType", "ownerId")
  WHERE "state" IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'UNKNOWN', 'NEEDS_REVIEW');

-- A MAC may have only one open claim at a time.
CREATE UNIQUE INDEX "DeviceClaim_open_mac_key" ON "DeviceClaim" ("mac")
  WHERE "state" IN ('SUBMITTED', 'APPROVED', 'ADOPTION_PENDING');

-- At most one active grant-device per client MAC per site is enforced in service code;
-- one reserved/authorized slot per (grant, mac) is enforced by the unique key.
