import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Money | JiHwan Investment",
  description: "AI Powered Investment Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
      </head>
      <body className="antialiased min-h-screen bg-black text-white">
        <Script 
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js" 
          integrity="sha384-DKYJZ8NLiK8MN4/C5NYUZf8E5GryzUY+M93URqQjOTLI48VF0c0HAKSJm/zzh7Qt" 
          crossOrigin="anonymous" 
          strategy="lazyOnload"
        />
        {children}
      </body>
    </html>
  );
}