import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { WalletProvider } from '@/lib/wallet-context';

export const metadata: Metadata = {
  title: 'VerdiCred — Carbon Credit Verification',
  description:
    'Trusted digital carbon credit verification platform. Stage 1: Project Registration & Onboarding.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>
          <WalletProvider>{children}</WalletProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
