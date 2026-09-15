import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FLOAT Dashboard",
  description: "Idle Capital Yield Router for the Agent Economy on Arc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Barlow:wght@300;400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script src="https://cdn.tailwindcss.com" async></script>
        <script dangerouslySetInnerHTML={{ __html: `
          window.tailwind = window.tailwind || {};
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  heading: ["'Instrument Serif'", 'serif'],
                  body: ["'Barlow'", 'sans-serif'],
                },
                borderRadius: {
                  DEFAULT: '9999px',
                }
              }
            }
          }
        `}} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
