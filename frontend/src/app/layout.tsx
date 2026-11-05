import "../../styles/globals.css"
import { Toaster } from "@/components/ui/toaster"

export const metadata = {
  title: "Chili POS",
  description: "Sistema de punto de venta para restaurantes",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
