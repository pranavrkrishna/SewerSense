import type { Metadata } from "next";
import "./globals.css"; // Make sure to import your global styles
import { ThemeProvider } from "../src/components/ThemeProvider";

// This is a named export, which is fine for metadata
export const metadata: Metadata = {
  title: "SewerSense",
  description: "Network Monitoring & Risk Assessment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased dark:bg-gray-900 bg-white`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}