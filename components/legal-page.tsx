import Link from 'next/link';
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
        <Link className="brand" href="/" aria-label="Teksboy home">
          <Image
            src="/images/general/logo.svg"
            alt="Teksboy"
            width={210}
            height={34}
            priority
          />
        </Link>
        <Link className="button" href="/">
          Back to database
        </Link>
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
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="mailto:reymagsino@gmail.com">Contact</a>
        </div>
      </article>
    </main>
  );
}
