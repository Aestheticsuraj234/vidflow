import type {ReactNode} from 'react';

import {Logo} from '@/components/logo';
import {Card} from '@/components/ui/card';

export default function AuthLayout({children}: {children: ReactNode}) {
  return (
    <main className="bg-grid flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Logo />
      <Card className="w-full max-w-sm">{children}</Card>
    </main>
  );
}
