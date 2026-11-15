import {AuthForm} from '@/components/auth/auth-form';

export const metadata = {title: 'Sign up · Vidflow'};

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
