import {AuthForm} from '@/components/auth/auth-form';

export const metadata = {title: 'Sign in · Vidflow'};

export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
