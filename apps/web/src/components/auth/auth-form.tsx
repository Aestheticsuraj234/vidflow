'use client';

import {signInSchema, signUpSchema} from '@vidflow/shared';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState, type FormEvent} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {authClient} from '@/lib/auth-client';

type Mode = 'sign-in' | 'sign-up';
type FieldErrors = Partial<Record<'name' | 'email' | 'password', string>>;

const COPY: Record<Mode, {title: string; submit: string; switchText: string; switchHref: string}> =
  {
    'sign-in': {
      title: 'Sign in to Vidflow',
      submit: 'Sign in',
      switchText: "Don't have an account? Sign up",
      switchHref: '/sign-up',
    },
    'sign-up': {
      title: 'Create your account',
      submit: 'Create account',
      switchText: 'Already have an account? Sign in',
      switchHref: '/sign-in',
    },
  };

/** Sign-in and sign-up form. Validates with the shared zod schemas first. */
export function AuthForm({mode}: {mode: Mode}) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const copy = COPY[mode];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed =
      mode === 'sign-up'
        ? ({mode, result: signUpSchema.safeParse(values)} as const)
        : ({mode, result: signInSchema.safeParse(values)} as const);
    if (!parsed.result.success) {
      setFieldErrors(toFieldErrors(parsed.result.error.issues));
      return;
    }
    setFieldErrors({});
    setPending(true);
    const {error} =
      parsed.mode === 'sign-up'
        ? await authClient.signUp.email(parsed.result.data)
        : await authClient.signIn.email(parsed.result.data);
    setPending(false);
    if (error) {
      setFormError(error.message ?? 'Something went wrong. Try again.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{copy.title}</h1>

      {mode === 'sign-up' && (
        <Field label="Name" name="name" autoComplete="name" error={fieldErrors.name} />
      )}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        error={fieldErrors.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        error={fieldErrors.password}
      />

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Please wait…' : copy.submit}
      </Button>

      <Link href={copy.switchHref} className="text-center text-sm text-muted hover:text-fg">
        {copy.switchText}
      </Link>
    </form>
  );
}

const FIELD_NAMES = new Set<string>(['name', 'email', 'password']);

function isFieldName(key: unknown): key is keyof FieldErrors {
  return typeof key === 'string' && FIELD_NAMES.has(key);
}

/** Keeps the first zod message for each form field. */
function toFieldErrors(issues: ReadonlyArray<{path: PropertyKey[]; message: string}>) {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (isFieldName(key)) errors[key] ??= issue.message;
  }
  return errors;
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  error?: string;
}

function Field({label, name, type = 'text', autoComplete, error}: FieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
