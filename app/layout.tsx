import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
  title: 'Arroyo Campus Walk — Explore outdoors',
  description:
    'Explore the outdoor campus of Arroyo High School in El Monte. An independent 3D campus prototype based on public map data.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
