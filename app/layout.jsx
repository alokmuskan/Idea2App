import "../styles/globals.css";
import { Space_Grotesk, Teko } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const teko = Teko({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: "Idea2App Builder",
  description: "AI product builder for hackathons",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${teko.variable} font-sans`}>{children}</body>
    </html>
  );
}
