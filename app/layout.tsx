import '../styles/globals.css'; // ✅ updated path
import React from 'react';

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
      <body>{children}</body>
    </html>
  );
}
