import "./globals.css";
import SaveShortcut from "../components/SaveShortcut";

export const metadata = {
  title: "OBE Curriculum Governance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SaveShortcut />
        {children}
      </body>
    </html>
  );
}
