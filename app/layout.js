export const metadata = {
  title: "Internship Radar",
  description: "Internship Radar Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
