import TeksApp from '@/components/teks-app';
import { shareMetadata } from '@/lib/share-metadata';
export async function generateMetadata({params}: {params: Promise<{collector:string[]}>}) {
  const {collector} = await params;
  return shareMetadata({slug:collector[0], set:collector[1] || ''}, true);
}
export default function Page() { return <TeksApp view="collectors" />; }
