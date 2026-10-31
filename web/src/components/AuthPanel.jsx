import { useEffect, useState } from "react";
import { useApp } from "../lib/store.jsx";

/** লগইন / নতুন অ্যাকাউন্ট — ছোট মোডাল */
export default function AuthPanel({ onClose, title = "পথচিত্রে লগইন" }) {
  const { signIn, signUp, authBusy, notify, hasBackend } = useApp();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) return setError("সঠিক ইমেইল দিন।");
    if (password.length < 8) return setError("পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।");
    try {
      if (mode === "signin") await signIn({ email, password });
      else await signUp({ email, password, displayName });
      onClose?.();
    } catch (err) {
      const msg = String(err?.message || "");
      if (/invalid login credentials/i.test(msg))
        setError("ইমেইল বা পাসওয়ার্ড মেলেনি। নতুন হলে আগে অ্যাকাউন্ট খুলুন।");
      else if (/already registered|user already/i.test(msg))
        setError("এই ইমেইলে অ্যাকাউন্ট আছে। লগইন করুন।");
      else if (/password.*short|weak password/i.test(msg)) setError("আরও শক্ত পাসওয়ার্ড দিন।");
      else if (/rate limit/i.test(msg)) setError("বেশিবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।");
      else setError(msg || "কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।");
    }
  }

  if (!hasBackend) {
    return (
      <Modal onClose={onClose} title="ব্যাকএন্ড সংযুক্ত নেই">
        <p>
          এই মোডে অ্যাকাউন্ট খোলা যাচ্ছে না। ভ্রমণতালিকা এই ব্রাউজারেই সংরক্ষিত থাকবে।
        </p>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={title}>
      <div className="tabs two" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "signin"}
          className={mode === "signin" ? "active" : ""}
          onClick={() => {
            setMode("signin");
            setError("");
          }}
        >
          লগইন
        </button>
        <button
          role="tab"
          aria-selected={mode === "signup"}
          className={mode === "signup" ? "active" : ""}
          onClick={() => {
            setMode("signup");
            setError("");
          }}
        >
          নতুন অ্যাকাউন্ট
        </button>
      </div>

      <form className="form" onSubmit={submit}>
        {mode === "signup" && (
          <label className="field">
            <span>আপনার নাম</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="যে নামে দেখাবেন"
              autoComplete="name"
            />
          </label>
        )}
        <label className="field">
          <span>ইমেইল</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span>পাসওয়ার্ড</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="অন্তত ৮ অক্ষর"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="row">
          <button type="submit" className="btn primary" disabled={authBusy}>
            {authBusy ? "অপেক্ষা করুন…" : mode === "signin" ? "লগইন করুন" : "অ্যাকাউন্ট খুলুন"}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            বন্ধ করুন
          </button>
        </div>

        {mode === "signup" && (
          <p className="hint">
            অ্যাকাউন্ট খুললে এই ব্রাউজারের ভ্রমণতালিকা অ্যাকাউন্টে মার্জ হবে — যেকোনো ডিভাইস থেকে
            একই তালিকা দেখা যাবে।
          </p>
        )}
        {mode === "signup" && (
          <button
            type="button"
            className="link-btn"
            onClick={() => notify("পাসওয়ার্ড ভুলে গেলে ইমেইল নিশ্চিতকরণের লিংক ব্যবহার করুন।")}
          >
            পাসওয়ার্ড ভুলে গেছেন?
          </button>
        )}
      </form>
    </Modal>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn icon-only" aria-label="বন্ধ করুন" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
