import { handle } from '@/server/backend.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
