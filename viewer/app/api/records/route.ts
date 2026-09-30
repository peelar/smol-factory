import { readRecords } from '../../../lib/records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const host = request.headers.get('host') || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    return new Response('Forbidden', { status: 403 });
  }
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    return Response.json({ records: readRecords() }, { headers });
  } catch {
    return Response.json({ error: 'Could not read records. Check SMOL_FACTORY_DATABASE, database version and access permissions.' }, { status: 503, headers });
  }
}
