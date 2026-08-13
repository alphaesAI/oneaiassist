import { redirect } from 'next/navigation';

export default function BillingPageRedirect() {
  redirect('/dashboard/settings?tab=account');
}
