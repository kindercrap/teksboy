'use client';
/* eslint-disable next/no-html-link-for-pages -- Full-page links avoid unreliable client routing on the deployed Worker. */
import Image from 'next/image';

type LegalSection = {
  title: string;
  paragraphs: string[];
};

export default function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <a
          className="brand"
          href="/"
          aria-label="Teksboy home"
          onClick={(event) => {
            event.preventDefault();
            window.location.assign('/');
          }}
        >
          <Image
            src="/images/general/logo.svg"
            alt="Teksboy"
            width={210}
            height={34}
            priority
          />
        </a>
        <a
          className="button"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            window.location.assign('/');
          }}
        >
          Back to database
        </a>
      </header>
      <article className="legal-card">
        <p className="eyebrow">TEKSBOY</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        <p className="legal-intro">{intro}</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <div className="legal-links">
          <a
            href="/privacy"
            onClick={(event) => {
              event.preventDefault();
              window.location.assign('/privacy');
            }}
          >
            Privacy
          </a>
          <a
            href="/terms"
            onClick={(event) => {
              event.preventDefault();
              window.location.assign('/terms');
            }}
          >
            Terms
          </a>
          <a href="mailto:reymagsino@gmail.com">Contact</a>
        </div>
      </article>
    </main>
  );
}
