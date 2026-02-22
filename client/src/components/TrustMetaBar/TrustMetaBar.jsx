export default function TrustMetaBar({ text = "", className = "" }) {
  if (!text) return null;
  return <p className={className}>{text}</p>;
}
