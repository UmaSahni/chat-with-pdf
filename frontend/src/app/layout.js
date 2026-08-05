import './globals.css';

export const metadata = {
  title: 'Multi-Document Synthesis - Veritas AI',
  description: 'AI-assisted RAG synthesis from multiple scientific documents',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Fallback to ensure Material icons load immediately */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-background text-on-surface font-body select-none">
        {children}
      </body>
    </html>
  );
}
