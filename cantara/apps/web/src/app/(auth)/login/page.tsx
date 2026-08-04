import type { Metadata } from 'next';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
