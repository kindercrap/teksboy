import LegalPage from '@/components/legal-page';

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="September 6, 2026"
      intro="Teksboy is a collection checklist for Filipino teks cards. This policy explains the limited information the service uses to save and display your collection."
      sections={[
        {
          title: 'Information we collect',
          paragraphs: [
            'When you sign in with Google, Teksboy receives your Google account identifier, email address, display name, and profile image. We store the checklist sets you add and the cards you mark as collected.',
            'The service may also process routine technical information needed to operate securely, such as request timestamps and authentication events.',
          ],
        },
        {
          title: 'How we use information',
          paragraphs: [
            'We use this information to authenticate you, synchronize your checklist across devices, calculate collection progress, generate missing-card images, provide support, and protect the service from abuse.',
            'We do not sell personal information or use checklist data for advertising.',
          ],
        },
        {
          title: 'Storage and sharing',
          paragraphs: [
            'Account and checklist data are stored with Supabase. Google provides sign-in. These providers process information under their own privacy terms. We disclose information only when needed to operate the service, comply with law, or protect users and the service.',
          ],
        },
        {
          title: 'Your choices',
          paragraphs: [
            'You can stop using Google sign-in at any time and revoke Teksboy access from your Google Account. To request access to, correction of, or deletion of your Teksboy account and checklist data, contact reymagsino@gmail.com.',
          ],
        },
        {
          title: 'Children and changes',
          paragraphs: [
            'Teksboy is not directed to children under 13. We may update this policy as the service changes and will post the current version on this page.',
          ],
        },
      ]}
    />
  );
}
