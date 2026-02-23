export const metadata = {
  title: "Internship Radar",
  description: "MBA Internship Radar",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        background: "#070709",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif"
      }}>
        {children}
      </body>
    </html>
  );
}
