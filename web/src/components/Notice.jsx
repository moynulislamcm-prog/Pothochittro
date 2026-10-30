import { useApp } from "../lib/store.jsx";

export default function Notice() {
  const { notice, liveError } = useApp();
  const text = notice || liveError;
  if (!text) return null;
  return (
    <div className="notice" role="status" aria-live="polite">
      {text}
    </div>
  );
}
