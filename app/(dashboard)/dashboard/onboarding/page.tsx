import { redirect } from 'next/navigation';

export default function OnboardingPageRedirect() {
  redirect('/dashboard');
}
