import { shareMetadata } from '@/lib/share-metadata';
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return shareMetadata(searchParams, true);
}
import TeksApp from '@/components/teks-app';
export default function Page() {
  return <TeksApp view="collectors" />;
}
