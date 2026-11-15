import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT, LegalDocument, type LegalSection } from "@/features/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Advo TZ collects, uses and protects personal data for resellers, agents and guests using advowifi.com, the captive portal and the Advo dashboard.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    blocks: [
      {
        kind: "paragraph",
        text: (
          <>
            Advo TZ (&ldquo;Advo&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the Advo WiFi
            platform at <strong className="text-[#18212F]">advowifi.com</strong>: a dashboard where
            resellers sell WiFi access, and a captive portal where their guests buy it. This policy
            explains what personal data we collect, why, how long we keep it, and the choices you
            have.
          </>
        ),
      },
      {
        kind: "paragraph",
        text: (
          <>
            We are the <strong className="text-[#18212F]">controller</strong> of account data for
            resellers, agents and visitors to our website. When a reseller uses the portal to sell
            WiFi access, the reseller decides what is sold and to whom, and we process the guest data
            needed to operate that sale. Our registered place of business is {LEGAL_CONTACT.location}.
          </>
        ),
      },
    ],
  },
  {
    id: "scope",
    title: "Where this policy applies",
    blocks: [
      {
        kind: "bullets",
        items: [
          <>
            <strong className="text-[#18212F]">The website</strong> at advowifi.com, /pricing, /hotspots
            and the other public pages.
          </>,
          <>
            <strong className="text-[#18212F]">The dashboard</strong> where resellers and agents manage
            their WiFi business.
          </>,
          <>
            <strong className="text-[#18212F]">The captive portal</strong> that guests see after
            connecting to a reseller&rsquo;s hotspot, including the pages that sell and activate
            internet access.
          </>,
          <>
            <strong className="text-[#18212F]">Support and email</strong> we exchange with you.
          </>,
        ],
      },
      {
        kind: "paragraph",
        text: "It does not cover third-party sites we link to, or a reseller's own policies for their premises.",
      },
    ],
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    blocks: [
      { kind: "paragraph", text: "Account and business information:" },
      {
        kind: "bullets",
        items: [
          "Your name, email address and phone number.",
          "Your business name, portal address (slug), branding and the packages you publish.",
          "Your password, stored only as an Argon2id hash. We never store or see the password itself.",
          "If you register or sign in with Google: your Google account identifier, email address, name and profile picture URL. See section 5.",
          "Referral codes and the agent relationship that applies to your account.",
        ],
      },
      { kind: "paragraph", text: "Guest and transaction information:" },
      {
        kind: "bullets",
        items: [
          "The mobile money number a guest pays from, and the payment reference returned by the payment provider.",
          "The device MAC address and IP address used to connect, so access can be granted to the right device and so the same device is not charged twice.",
          "Voucher codes, packages purchased, activation state, and the session start and end times.",
          "Amounts paid to a reseller, platform fees, agent commissions and payout records.",
        ],
      },
      { kind: "paragraph", text: "Technical and security information:" },
      {
        kind: "bullets",
        items: [
          "IP address, browser user agent, and the times of sign-in, sign-out and other account events.",
          "An audit trail of administrative and financial actions, so a disputed charge or a suspicious change can be investigated.",
          "Error and performance logs from our servers, which may include request paths but not passwords or full payment credentials.",
        ],
      },
      {
        kind: "paragraph",
        text: "We do not collect your mobile money PIN, your card number, or your national ID unless a payout review specifically requires it and you provide it.",
      },
    ],
  },
  {
    id: "why",
    title: "Why we use it",
    blocks: [
      {
        kind: "bullets",
        items: [
          <>
            <strong className="text-[#18212F]">To run your account</strong> — create it, sign you in,
            verify your email, protect it with two-factor authentication, and reset your password when
            you ask.
          </>,
          <>
            <strong className="text-[#18212F]">To sell WiFi access</strong> — show packages, take
            payment, issue vouchers, activate the guest&rsquo;s device, and stop the session when the
            time or data is used up.
          </>,
          <>
            <strong className="text-[#18212F]">To pay people</strong> — compute commissions and
            platform fees, and process withdrawals to a reseller or agent.
          </>,
          <>
            <strong className="text-[#18212F]">To keep the service safe</strong> — detect fraud,
            rate-limit abusive requests, investigate incidents and keep the audit trail described
            above.
          </>,
          <>
            <strong className="text-[#18212F]">To support you</strong> — answer your message, and
            diagnose the problem you reported.
          </>,
          <>
            <strong className="text-[#18212F]">To meet the law</strong> — keep the financial and tax
            records we are required to keep, and respond to a lawful request from an authority.
          </>,
        ],
      },
      {
        kind: "paragraph",
        text: (
          <>
            We rely on the performance of our contract with you for account, sales and payout data; on
            our legitimate interest in keeping the platform secure and reliable for technical and
            audit data; on your consent where we ask for it; and on legal obligation for records we
            must retain. We do not use your data for advertising, and we do not build advertising
            profiles.
          </>
        ),
      },
    ],
  },
  {
    id: "google",
    title: "Signing in with Google",
    blocks: [
      {
        kind: "paragraph",
        text: (
          <>
            &ldquo;Continue with Google&rdquo; is optional. If you use it, Google tells us your Google
            account identifier, email address, name, profile picture URL, and whether Google has
            verified that email address. We use those values to create or find your Advo account and
            to sign you in. We use your verified email as proof that the address belongs to you,
            which is why a Google sign-up does not need an emailed code.
          </>
        ),
      },
      {
        kind: "paragraph",
        text: "What we deliberately never receive or request from Google:",
      },
      {
        kind: "bullets",
        items: [
          "Gmail messages, contacts, calendar, Drive files or photos.",
          "Any Google scope beyond your basic profile and email address.",
          "Your Google password.",
        ],
      },
      {
        kind: "note",
        text: (
          <>
            Advo&rsquo;s use and transfer to any other app of information received from Google APIs
            adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              rel="noopener noreferrer"
              target="_blank"
              className="font-semibold text-[#b15f00] underline underline-offset-2"
            >
              Google API Services User Data Policy
            </a>
            , including its Limited Use requirements. We do not use Google user data to serve ads, to
            train generalised AI models, or to sell it.
          </>
        ),
      },
      {
        kind: "paragraph",
        text: "You can revoke Advo's access at any time at myaccount.google.com → Security → Third-party apps and services. Revoking stops future sign-ins with Google; your Advo account and password (if you set one through “Forgot password”) keep working.",
      },
    ],
  },
  {
    id: "cookies",
    title: "Cookies and similar storage",
    blocks: [
      {
        kind: "paragraph",
        text: "We use the minimum needed to keep you signed in and to keep the site safe:",
      },
      {
        kind: "bullets",
        items: [
          <>
            <strong className="text-[#18212F]">advo_session</strong> — the session cookie. It is
            HttpOnly (unreadable by page scripts), SameSite=Lax, Secure on HTTPS, and expires after 24
            hours or when you sign out.
          </>,
          <>
            <strong className="text-[#18212F]">advo_impersonation</strong> — set only while an
            authorised Advo administrator is viewing your account with a recorded reason, so the
            administrator can leave that mode. It is short-lived.
          </>,
          "A language preference, kept locally, so the site stays in the language you chose.",
        ],
      },
      {
        kind: "paragraph",
        text: "We do not use advertising or cross-site tracking cookies, and we do not embed third-party advertising pixels. Because the cookies above are strictly necessary, they are set without a consent banner.",
      },
    ],
  },
  {
    id: "sharing",
    title: "Who we share data with",
    blocks: [
      { kind: "paragraph", text: "We do not sell personal data. We share only what a task requires:" },
      {
        kind: "bullets",
        items: [
          <>
            <strong className="text-[#18212F]">Mobile money provider (Snippe)</strong> — the guest&rsquo;s
            phone number and the amount, to collect payment, and to send a payout to a reseller or
            agent.
          </>,
          <>
            <strong className="text-[#18212F]">Network controller (TP-Link Omada)</strong> — the
            device MAC address and session state, so the access point knows who may be online.
          </>,
          <>
            <strong className="text-[#18212F]">Email delivery</strong> — your email address, to send
            verification codes, receipts and security notices.
          </>,
          <>
            <strong className="text-[#18212F]">Google</strong> — only if you choose Google sign-in, and
            only to complete the sign-in you started.
          </>,
          <>
            <strong className="text-[#18212F]">Hosting and infrastructure</strong> — our servers and
            database, which process data on our instructions.
          </>,
          <>
            <strong className="text-[#18212F]">Authorities</strong> — where the law requires it, or to
            investigate fraud or protect someone&rsquo;s safety.
          </>,
        ],
      },
      {
        kind: "paragraph",
        text: "A reseller can see the guests who bought access through their own portal: the mobile number used, the package bought, and the device that was granted. A reseller cannot see another reseller's guests.",
      },
    ],
  },
  {
    id: "transfers",
    title: "Where data is processed",
    blocks: [
      {
        kind: "paragraph",
        text: "Our servers are hosted in data centres outside Tanzania, and some providers above (payment, email, Google) process data internationally. Where data leaves Tanzania we rely on the transfer conditions in the Personal Data Protection Act, 2022, and we require providers to protect it to a comparable standard.",
      },
    ],
  },
  {
    id: "retention",
    title: "How long we keep it",
    blocks: [
      {
        kind: "bullets",
        items: [
          "Account and business data: while your account is open, then up to 90 days after closure so a mistaken deletion can be reversed. After that it is deleted or anonymised.",
          "Payment, payout and commission records: kept for the period tax and accounting law requires, in a form that is no longer linked to a guest's phone number where that is possible.",
          "Guest session and device records: kept only as long as needed to run the session and resolve a billing dispute, then expired by a scheduled cleanup.",
          "Security and audit logs: typically 12 months, longer where a specific investigation is open.",
          "Sign-in and verification codes: minutes to hours; they are single-use and expire.",
        ],
      },
      {
        kind: "paragraph",
        text: "If you ask us to delete your account, we delete what we are not required to keep. Records we must retain are restricted to that purpose.",
      },
    ],
  },
  {
    id: "security",
    title: "How we protect it",
    blocks: [
      {
        kind: "bullets",
        items: [
          "TLS for all traffic between your browser and advowifi.com.",
          "Passwords hashed with Argon2id; secrets encrypted with AES-256-GCM and a key held outside the database.",
          "Session tokens stored only as hashes, so a database copy cannot be replayed as a login.",
          "Two-factor authentication available for sensitive accounts, and required for Advo administrators.",
          "Rate limits on sign-in, registration and code verification, and an audit trail for administrative actions.",
          "Access to production is limited to the people who need it, and each action is attributable.",
        ],
      },
      {
        kind: "paragraph",
        text: (
          <>
            No system is perfectly secure. If a breach affects your data, we will tell you and the
            relevant authority without undue delay, as the law requires. Please report a suspected
            vulnerability to{" "}
            <a href={`mailto:${LEGAL_CONTACT.security}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
              {LEGAL_CONTACT.security}
            </a>{" "}
            rather than testing it against real accounts.
          </>
        ),
      },
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    blocks: [
      { kind: "paragraph", text: "Subject to the Personal Data Protection Act, 2022, you may ask us to:" },
      {
        kind: "bullets",
        items: [
          "Confirm whether we hold your data and give you a copy.",
          "Correct data that is wrong or incomplete.",
          "Delete data we no longer have a lawful reason to keep.",
          "Restrict or object to processing based on our legitimate interests.",
          "Give you your data in a portable, machine-readable form.",
          "Withdraw a consent you gave, without affecting what was done before you withdrew it.",
        ],
      },
      {
        kind: "paragraph",
        text: (
          <>
            Write to{" "}
            <a href={`mailto:${LEGAL_CONTACT.support}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
              {LEGAL_CONTACT.support}
            </a>{" "}
            with the subject &ldquo;Data request&rdquo;. We aim to reply within 30 days and may ask you
            to prove you control the account or the email address before we act. If you are not
            satisfied, you may complain to the Personal Data Protection Commission of Tanzania.
          </>
        ),
      },
      {
        kind: "paragraph",
        text: "Guests whose data was collected by a reseller's portal can also raise the matter with that reseller, who chose to offer the service.",
      },
    ],
  },
  {
    id: "children",
    title: "Children",
    blocks: [
      {
        kind: "paragraph",
        text: "The platform is for businesses and their adult customers. You must be at least 18 to open a reseller or agent account. A reseller's portal is not directed at children, and we do not knowingly create accounts for anyone under 18. If you believe a child's data reached us, contact us and we will remove it.",
      },
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    blocks: [
      {
        kind: "paragraph",
        text: "We will update this page when our practices change and change the date at the top. If a change materially affects your rights, we will also tell you by email or in the dashboard before it takes effect.",
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
            Privacy and general questions:{" "}
            <a href={`mailto:${LEGAL_CONTACT.support}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
              {LEGAL_CONTACT.support}
            </a>
          </>,
          <>
            Security reports:{" "}
            <a href={`mailto:${LEGAL_CONTACT.security}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
              {LEGAL_CONTACT.security}
            </a>
          </>,
          `Postal location: ${LEGAL_CONTACT.location}`,
        ],
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      badge="Legal"
      title="Privacy Policy"
      intro="What Advo collects when you run a WiFi business on advowifi.com, sell access through a captive portal, or simply visit the site — and the control you keep over it."
      updated="2026-11-14"
      sections={SECTIONS}
      footerNote={
        <>
          <strong className="text-[#18212F]">Plain-language summary.</strong> We collect what is
          needed to open your account, sell WiFi access, pay commissions and keep the service secure.
          We never ask Google for anything beyond your name and email, we never sell data, and we do
          not run advertising trackers. Ask us at{" "}
          <a href={`mailto:${LEGAL_CONTACT.support}`} className="font-semibold text-[#b15f00] underline underline-offset-2">
            {LEGAL_CONTACT.support}
          </a>{" "}
          and we will show, correct or delete what we hold. See also our{" "}
          <Link href="/terms" className="font-semibold text-[#b15f00] underline underline-offset-2">
            Terms of Service
          </Link>
          .
        </>
      }
    />
  );
}
