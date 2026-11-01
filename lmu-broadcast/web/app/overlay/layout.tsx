import "./overlay.css";

// Alle Overlay-Seiten: transparenter Hintergrund fuer die OBS-Browser-Source.
export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{"html,body{background:transparent !important;overflow:hidden;}body::before{display:none !important;}"}</style>
      {children}
    </>
  );
}
