import LegalPage from '@/components/legal-page';

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="September 6, 2026"
      intro="These terms govern your use of Teksboy. By using the service, you agree to use it responsibly and only for lawful collection-related purposes."
      sections={[
        {
          title: 'Using Teksboy',
          paragraphs: [
            'You may browse the public card database without an account. A Google account is required to create and save checklists. You are responsible for activity performed through your account and for keeping access to it secure.',
          ],
        },
        {
          title: 'Acceptable use',
          paragraphs: [
            'Do not interfere with the service, attempt to access another user’s data, automate abusive traffic, upload malicious material, or use generated missing-card images for unlawful or misleading purposes.',
          ],
        },
        {
          title: 'Card images and availability',
          paragraphs: [
            'Card images and names are presented for identification and collection tracking. Rights in third-party characters, artwork, and marks remain with their respective owners. Teksboy may correct catalog information, remove content, or change features when necessary.',
            'The service is provided as available. We work to keep checklist data accurate and accessible but cannot promise uninterrupted operation or that every catalog entry is complete.',
          ],
        },
        {
          title: 'Account suspension and termination',
          paragraphs: [
            'We may restrict accounts that abuse the service or violate these terms. You may stop using Teksboy at any time and request deletion of your account and checklist data by contacting reymagsino@gmail.com.',
          ],
        },
        {
          title: 'Contact',
          paragraphs: [
            'Questions about these terms can be sent to reymagsino@gmail.com.',
          ],
        },
      ]}
    />
  );
}
