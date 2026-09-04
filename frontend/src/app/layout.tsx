import type { Metadata } from 'next';
import { Sora, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { WalletProvider } from '@/lib/wallet-context';
import { ToastProvider } from '@/components/Toast';
import { AmbientBackground } from '@/components/AmbientBackground';
import { CustomCursor } from '@/components/CustomCursor';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VerdiCred — Carbon Credit Verification',
  description:
    'Trusted digital carbon credit verification platform. Stage 7: Public Transparency Explorer.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sora.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-ink-950 font-sans text-content antialiased scrollbar-premium">
        <AuthProvider>
          <WalletProvider>
            <ToastProvider>
              <AmbientBackground />
              <CustomCursor />
              {children}
            </ToastProvider>
          </WalletProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
