import type { ReactNode } from "react";
import { Container } from "@/features/marketing/ui";

export type LegalBlock =
  | { kind: "paragraph"; text: ReactNode }
  | { kind: "bullets"; items: ReactNode[] }
  | { kind: "note"; text: ReactNode };

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

/**
 * Shared shell for `/privacy` and `/terms`.
 *
 * These pages carry the URLs Google requires on the OAuth consent screen, so
 * they are deliberately server-rendered with no client JavaScript of their own:
 * fast for a reviewer, readable without hydration, and printable in one piece.
 * The marketing header and footer still wrap them, so a visitor can leave for
 * the rest of the site.
 */
export function LegalDocument({
  title,
  badge,
  intro,
  updated,
  sections,
  footerNote,
}: {
  title: string;
  badge: string;
  intro: ReactNode;
  updated: string;
  sections: LegalSection[];
  footerNote?: ReactNode;
}) {
  return (
    <div className="w-full bg-[#F7F9FC]">
      {/* Masthead */}
      <div className="border-b border-[#DFE5EC] bg-white">
        <Container className="py-12 lg:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FBA102]/35 bg-[linear-gradient(135deg,rgba(251,161,2,0.15),rgba(241,99,4,0.15))] px-3.5 py-1 text-xs font-bold tracking-wider text-[#b15f00] uppercase">
            {badge}
          </span>
          <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-[#18212F] sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#526174] sm:text-base">{intro}</p>
          <p className="mt-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[#DFE5EC] bg-[#F7F9FC] px-3 py-2 text-xs text-[#526174]">
            <span className="font-bold text-[#18212F]">Last updated:</span>
            <time dateTime={updated}>{updated}</time>
            <span aria-hidden="true" className="text-[#DFE5EC]">
              ·
            </span>
            <span>Applies to advowifi.com and its subdomains</span>
          </p>
        </Container>
      </div>

      <Container className="py-12 lg:py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Contents */}
          <nav aria-label="Contents" className="lg:col-span-4 xl:col-span-3">
            <div className="lg:sticky lg:top-24">
              <h2 className="text-xs font-bold tracking-[0.14em] text-[#526174] uppercase">Contents</h2>
              <ol className="mt-4 space-y-1.5 border-l border-[#DFE5EC] pl-4">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="group flex gap-2 text-[13px] leading-snug text-[#526174] transition-colors hover:text-[#b15f00]"
                    >
                      <span className="tabular-nums text-[#9AA7B6]">{index + 1}.</span>
                      <span className="group-hover:underline">{section.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          {/* Body */}
          <div className="lg:col-span-8 xl:col-span-9">
            <div className="space-y-10">
              {sections.map((section, index) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="flex items-baseline gap-3 text-lg font-black tracking-tight text-[#18212F] sm:text-xl">
                    <span className="text-sm font-black tabular-nums text-[#FBA102]">{index + 1}</span>
                    <span>{section.title}</span>
                  </h2>
                  <div className="mt-3 space-y-3.5">
                    {section.blocks.map((block, blockIndex) => {
                      if (block.kind === "paragraph") {
                        return (
                          <p key={blockIndex} className="text-sm leading-relaxed text-[#526174]">
                            {block.text}
                          </p>
                        );
                      }
                      if (block.kind === "bullets") {
                        return (
                          <ul key={blockIndex} className="space-y-2">
                            {block.items.map((item, itemIndex) => (
                              <li
                                key={itemIndex}
                                className="flex gap-2.5 text-sm leading-relaxed text-[#526174]"
                              >
                                <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#FBA102]" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      return (
                        <div
                          key={blockIndex}
                          className="rounded-2xl border border-[#DFE5EC] bg-white p-4 text-sm leading-relaxed text-[#526174]"
                        >
                          {block.text}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {footerNote ? (
              <div className="mt-12 rounded-3xl border border-[#DFE5EC] bg-white p-6 text-sm leading-relaxed text-[#526174]">
                {footerNote}
              </div>
            ) : null}
          </div>
        </div>
      </Container>
    </div>
  );
}

/** Contact details reused across both documents, so they cannot drift apart. */
export const LEGAL_CONTACT = {
  support: "support@advotz.com",
  security: "security@advotz.com",
  location: "Dar es Salaam, Tanzania",
};
