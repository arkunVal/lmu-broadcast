import Link from "next/link";

/** FLM gross, "Broadcast" klein darunter. */
export default function Logo({ href, small }: { href?: string; small?: boolean }) {
  const inner = (
    <>
      <b>FLM</b>
      <small>Broadcast</small>
    </>
  );
  const cls = `logo${small ? " sm" : ""}`;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <span className={cls}>{inner}</span>;
}
