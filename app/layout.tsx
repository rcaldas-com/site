import type { Metadata } from 'next';
import './globals.css';

// Metadata estatica -- sem generateMetadata dinamica, que exigiria runtime.
export const metadata: Metadata = {
  metadataBase: new URL('https://rcaldas.com'),
  title: {
    default: 'RCaldas',
    template: '%s — RCaldas',
  },
  description: 'Infraestrutura, automação e sistemas sob medida.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-50">
        {children}
      </body>
    </html>
  );
}
