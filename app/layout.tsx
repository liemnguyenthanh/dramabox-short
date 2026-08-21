import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "@/index.css"
import { ThemeProvider } from "@/components/theme-provider"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "DramaBox Short",
  description: "Xem phim ngắn DramaBox",
}

export const viewport: Viewport = {
  themeColor: "#09090b",
  userScalable: false,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="bg-background dark">
      <body className={`${geist.variable} ${geistMono.variable} font-sans`}>
        <ThemeProvider defaultTheme="dark">
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
