import { NextRequest, NextResponse } from 'next/server';
import kisService from '@/lib/kis';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const period = searchParams.get('period') as 'D' | 'W' | 'M' || 'D';

  if (!code) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  }

  try {
    const data = await kisService.getDailyPrice(code, period);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
