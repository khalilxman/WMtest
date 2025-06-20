
import '../styles/globals.css';
import React from 'react';
import { Analytics } from '@vercel/analytics/react';

export const metadata = {
  title: 'Digit Span Test',
  description: 'Working memory assessment',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
