import type { Metadata } from 'next';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
