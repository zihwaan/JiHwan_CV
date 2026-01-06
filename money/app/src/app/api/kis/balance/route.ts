import { NextResponse } from 'next/server';
import kisService from '@/lib/kis';

export async function GET() {
  try {
    const data = await kisService.getAccountBalance();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
