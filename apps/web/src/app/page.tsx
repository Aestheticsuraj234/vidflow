import {redirect} from 'next/navigation';

/** The proxy sends signed-out visitors to /sign-in, so this only sees users. */
export default function Home() {
  redirect('/dashboard');
}
