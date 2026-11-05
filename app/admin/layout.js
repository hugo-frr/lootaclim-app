// Le back-office ne doit jamais apparaître dans Google.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
