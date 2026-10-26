import { NextResponse } from 'next/server';
import { isAccessProtectionConfigured } from '@/lib/auth';
import { AfroMessageClient } from '@/lib/afromessage';

export async function GET() {
  const client = new AfroMessageClient();
  const authRequired = isAccessProtectionConfigured();
  const providerConfigured = client.isConfigured();
  const senderName = client.getSenderName();

  const tariffStr = process.env.SMS_COST_PER_SEGMENT;
  const tariffPerSegment = tariffStr ? parseFloat(tariffStr) : 0.35; // Default reference tariff in ETB
  const currency = process.env.SMS_CURRENCY || 'ETB';

  // If token is configured, optionally fetch balance
  let balance = null;
  if (providerConfigured) {
    try {
      balance = await client.getBalance();
    } catch {
      balance = null;
    }
  }

  return NextResponse.json({
    authRequired,
    providerConfigured,
    senderName,
    tariffPerSegment: isNaN(tariffPerSegment) ? undefined : tariffPerSegment,
    currency,
    balance,
  });
}
