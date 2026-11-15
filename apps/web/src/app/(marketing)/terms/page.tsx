import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT, LegalDocument, type LegalSection } from "@/features/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement between you and Advo TZ for using advowifi.com: reseller and agent accounts, WiFi sales through the captive portal, payments, commissions, payouts and acceptable use.",
  alternates: { canonical: "/terms" },
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    blocks: [
      {
        kind: "paragraph",
        text: (
          <>
            These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between you and Advo TZ
            (&ldquo;Advo&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) for the use of
            advowifi.com and the Advo WiFi platform. By creating an account, using the dashboard, or
            continuing to use a captive portal powered by Advo, you accept these Terms.
          </>
        ),
      },
      {
        kind: "paragraph",
        text: (
          <>
            If you accept on behalf of a business, you confirm you are authorised to do so, and
            &ldquo;you&rdquo; means that business. If you do not accept, do not use the platform. Our{" "}
            <Link href="/privacy" className="font-semibold text-[#b15f00] underline underline-offset-2">
              Privacy Policy
            </Link>{" "}
            explains how personal data is handled and forms part of these Terms.
          </>
        ),
      },
    ],
  },
  {
    id: "definitions",
    title: "What the words mean",
    blocks: [
      {
        kind: "bullets",
        items: [
          <>
            <strong className="text-[#18212F]">Platform</strong> — advowifi.com, the dashboard, the
            captive portal and the APIs behind them.
          </>,
          <>
            <strong className="text-[#18212F]">Reseller</strong> — a business that sells WiFi access to
            its own customers through the Platform.
          </>,
          <>
            <strong className="text-[#18212F]">Agent</strong> — a person or business that refers
            resellers using a referral code and earns a commission.
          </>,
          <>
            <strong className="text-[#18212F]">Guest</strong> — an end customer who buys and uses WiFi
            access through a reseller&rsquo;s portal.
          </>,
          <>
            <strong className="text-[#18212F]">Portal</strong> — the page a guest sees after connecting
            to a reseller&rsquo;s hotspot, at <code className="rounded bg-[#F1F4F8] px-1 py-0.5 text-[13px]">slug.advowifi.com</code> or the
            reseller&rsquo;s own domain.
          </>,
          <>
            <strong className="text-[#18212F]">Package</strong> — a unit of WiFi access (for example a
            number of hours or days, at a price) that a reseller publishes.
          </>,
          <>
            <strong className="text-[#18212F]">Voucher</strong> — a code that activates access without
            a mobile money payment.
          </>,
        ],
      },
    ],
  },
  {
    id: "accounts",
    title: "Your account",
    blocks: [
      {
        kind: "bullets",
        items: [
          "You must be at least 18 and able to enter a binding contract.",
          "Give accurate information — name, business name, a working email and a phone number you control — and keep it current.",
          "One account per business. The business name and portal address you choose must not be misleading, and must not infringe someone else's name or trademark.",
          "You are responsible for everything done through your account. Use a strong password, keep it private, and ask us to reset it immediately if you suspect it is known to someone else.",
          "Administrators of your own team, if you add any, act on your behalf and you are responsible for them.",
        ],
      },
      {
        kind: "paragraph",
        text: "We may refuse or close an account that uses false identity, impersonates another business, or was opened to commit fraud.",
      },
    ],
  },
  {
    id: "google-signin",
    title: "Signing up with Google",
    blocks: [
      {
        kind: "paragraph",
        text: (
          <>
            You may register or sign in with your Google account instead of a password. Google then
            confirms your name and email address to us, and we use that verified email as proof that
            the address is yours. By choosing this option you agree that Google&rsquo;s own terms and
            privacy policy also apply to that sign-in.
          </>
        ),
      },
      {
        kind: "bullets",
        items: [
          "The account is yours, tied to the Google account you selected. If you pick the wrong Google account, change it during sign-up.",
          "You can stop using Google at any time. To set a password, use “Forgot password” with the same email address.",
          "Google sign-in is not available for Advo administrator accounts, which require a password and a two-factor code.",
          "If Google cannot verify your email address, use the email-and-code form instead.",
        ],
      },
    ],
  },
  {
    id: "reseller-duties",
    title: "Selling WiFi as a reseller",
    blocks: [
      {
        kind: "paragraph",
        text: "You are the one selling to the guest, under your own business, price and service promise. In particular:",
      },
      {
        kind: "bullets",
        items: [
          "Hold every licence, permit and registration your business needs to provide internet access to the public, and comply with the terms of your internet service provider.",
          "Be honest about what a package includes — speed, duration, data limit and coverage — and about any limit you apply.",
          "Do not sell access you are not authorised to resell, and do not use the Platform to provide internet to a location you do not control.",
          "Give guests a working way to reach you, and handle their complaints about your premises, your prices and your network.",
          "Keep the branding you upload lawful: you must own it or have permission to use it.",
        ],
      },
      {
        kind: "paragraph",
        text: "Advo provides the software. We do not own your hotspot, your packages, your network or your customer relationship.",
      },
    ],
  },
  {
    id: "agents",
    title: "Agents and referral codes",
    blocks: [
      {
        kind: "bullets",
        items: [
          "An agent earns commission on resellers attributed to their referral code, on the rates published in the dashboard at the time of the sale.",
          "Attribution follows the code a reseller enters when registering; it is recorded once and is not transferable afterwards.",
          "Do not promise income, results or Advo endorsement you cannot support, and do not register accounts yourself to manufacture commission.",
          "Self-referral, duplicate accounts and fabricated sales are a breach of these Terms and may result in lost commission and a closed account.",
          "Commission rates may change for future sales. A change never applies retroactively to sales already recorded.",
        ],
      },
    ],
  },
  {
    id: "plans-fees",
    title: "Plans, fees and taxes",
    blocks: [
      {
        kind: "bullets",
        items: [
          "Subscription plans, platform fees and feature limits are the ones shown in the dashboard and on the pricing page when you subscribe.",
          "Fees are charged in Tanzanian shillings. Where VAT or another tax applies, it is added or withheld as the law requires.",
          "A plan renews for the period you selected until you cancel. Cancelling stops the next renewal; it does not refund the current period.",
          "Upgrading takes effect immediately. Downgrading takes effect at the next renewal, and features above the new plan stop working then.",
          "We may change prices for future periods with reasonable notice in the dashboard or by email.",
          "Amounts already earned by guests' purchases, and money owed to you, are not affected by a plan change.",
        ],
      },
    ],
  },
  {
    id: "guest-sales",
    title: "Guest purchases",
    blocks: [
      {
        kind: "bullets",
        items: [
          "A guest pays by mobile money or redeems a voucher. A payment is confirmed when the mobile money provider confirms it; a pending prompt is not a completed sale.",
          "Access is granted to the device that bought it. Moving to another device may require a new purchase, depending on the package.",
          "Packages have an activation window. Access that is not activated inside that window may lapse; the window is shown before purchase.",
          "If a payment succeeds but access is not granted, the guest or reseller should contact support with the payment reference. We will investigate and, where the charge is confirmed and access was never delivered, correct it by extending access or refunding the guest.",
          "Except where the law requires otherwise, a purchase that has already been used is not refundable.",
        ],
      },
      {
        kind: "paragraph",
        text: "The reseller sets the price the guest pays. Refund decisions on a reseller's own sale are made with that reseller, and Advo may reverse the related platform fee and commission.",
      },
    ],
  },
  {
    id: "payouts",
    title: "Payouts and withdrawals",
    blocks: [
      {
        kind: "bullets",
        items: [
          "Money collected for a reseller is released for withdrawal after the settlement period shown in the dashboard, so that a reversed or disputed payment can be caught first.",
          "Withdrawals go to a mobile money account in the name of the account holder. We may ask for information to confirm that before releasing a payout.",
          "Withdrawal fees, minimum amounts and any holding period are shown before you confirm a withdrawal.",
          "We may hold a payout while a payment is being investigated, or where we are required to by law or by a payment provider.",
          "You are responsible for the accuracy of the number you withdraw to. Money sent to a number you supplied by mistake may not be recoverable.",
        ],
      },
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    blocks: [
      { kind: "paragraph", text: "You must not use the Platform to:" },
      {
        kind: "bullets",
        items: [
          "Break the law, infringe someone's rights, or help someone else do so.",
          "Attempt to access another account, another reseller's data, or our infrastructure without permission.",
          "Probe, scan, overload or reverse-engineer the Platform, or work around rate limits.",
          "Send spam or unsolicited bulk messages, or use the Platform to distribute malware.",
          "Resell platform access itself (for example selling dashboard accounts) without our written agreement.",
          "Misrepresent your identity, your business, or your relationship with Advo.",
        ],
      },
      {
        kind: "paragraph",
        text: "We may suspend an account while we investigate a suspected breach, and we will explain why.",
      },
    ],
  },
  {
    id: "ip",
    title: "Intellectual property",
    blocks: [
      {
        kind: "paragraph",
        text: (
          <>
            The Platform, its software, design and the Advo name and marks belong to us or our
            licensors. We grant you a limited, non-exclusive, non-transferable right to use the
            Platform while your account is open, for the purpose described in these Terms. You keep
            all rights to your own business name, your branding and your content, and you give us the
            permission needed to display them inside the Platform and on your portal.
          </>
        ),
      },
    ],
  },
  {
    id: "availability",
    title: "Availability and support",
    blocks: [
      {
        kind: "paragraph",
        text: "We work to keep the Platform available, but we do not promise uninterrupted service. Maintenance, upgrades, a failure at an internet provider, mobile money network or hosting provider, or an event outside our control can interrupt it. Where we plan maintenance that will interrupt sales, we aim to give notice in the dashboard.",
      },
      {
        kind: "paragraph",
        text: (
          <>
            Support is available through the contact details in the dashboard and at{" "}
            <a href={`mailto:${LEGAL_CONTACT.support}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
              {LEGAL_CONTACT.support}
            </a>
            . We do not provide support to your guests directly; direct them to you, and escalate to us
            when the problem is in the Platform.
          </>
        ),
      },
    ],
  },
  {
    id: "suspension",
    title: "Suspension and termination",
    blocks: [
      {
        kind: "bullets",
        items: [
          "You may close your account at any time. Money you have earned and are entitled to is settled after the final accounting period, less any amount you owe.",
          "We may suspend or close an account for a material breach of these Terms, non-payment, fraud, a legal requirement, or a risk to other users or to the Platform.",
          "Where the breach can be fixed, we will normally warn you first and give a reasonable time to fix it.",
          "On closure we may delete your data as described in the Privacy Policy, keeping only what the law requires.",
        ],
      },
    ],
  },
  {
    id: "liability",
    title: "Disclaimers and liability",
    blocks: [
      {
        kind: "paragraph",
        text: "The Platform is provided on an “as available” basis. To the extent the law allows, we exclude implied warranties that are not stated in these Terms, and we are not liable for lost profit, lost business, lost data or indirect loss.",
      },
      {
        kind: "paragraph",
        text: "Where liability cannot be excluded, our total liability for claims connected with the Platform is limited to the platform fees you paid us in the three months before the event giving rise to the claim. Nothing in these Terms limits liability for fraud, for death or personal injury caused by negligence, or for anything else the law does not allow us to limit.",
      },
      {
        kind: "paragraph",
        text: "You are responsible for your own sales, prices, service quality and legal compliance as a reseller, and you agree to indemnify us against a third-party claim that arises from your business, your content, or your breach of these Terms.",
      },
    ],
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    blocks: [
      {
        kind: "paragraph",
        text: "We may update these Terms as the Platform changes. The date at the top of this page shows the current version. If a change materially affects your rights or obligations, we will tell you by email or in the dashboard before it takes effect. Continuing to use the Platform after that means you accept the updated Terms.",
      },
    ],
  },
  {
    id: "law",
    title: "Governing law and disputes",
    blocks: [
      {
        kind: "paragraph",
        text: "These Terms are governed by the laws of the United Republic of Tanzania. If a dispute arises, tell us first at the contact below and give us 30 days to resolve it in good faith. If we cannot, the courts of Tanzania have exclusive jurisdiction, sitting in Dar es Salaam.",
      },
      {
        kind: "paragraph",
        text: "If any provision is found unenforceable, the rest stays in force. A failure to enforce a provision is not a waiver of it. These Terms, together with the Privacy Policy and the plan terms shown in the dashboard, are the whole agreement between us.",
      },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    blocks: [
      {
        kind: "bullets",
        items: [
          <>
            General and billing:{" "}
            <a href={`mailto:${LEGAL_CONTACT.support}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
              {LEGAL_CONTACT.support}
            </a>
          </>,
          <>
            Security:{" "}
            <a href={`mailto:${LEGAL_CONTACT.security}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
              {LEGAL_CONTACT.security}
            </a>
          </>,
          `Location: ${LEGAL_CONTACT.location}`,
        ],
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      badge="Legal"
      title="Terms of Service"
      intro="The agreement that covers a reseller account, an agent's referral commission, a guest's WiFi purchase and everything in between."
      updated="2026-11-14"
      sections={SECTIONS}
      footerNote={
        <>
          <strong className="text-[#18212F]">Plain-language summary.</strong> You run your own WiFi
          business; we provide the software and take the payment. Sell honestly, hold the licences your
          business needs, use your own account, and pay your plan. We keep the platform secure, pay
          what you earn after the settlement period, and tell you before a change affects you. Questions
          go to{" "}
          <a href={`mailto:${LEGAL_CONTACT.support}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
            {LEGAL_CONTACT.support}
          </a>
          . See also our{" "}
          <Link href="/privacy" className="font-semibold text-[#b15f00] underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </>
      }
    />
  );
}
