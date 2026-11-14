import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Kettlebell } from "@/components/gym/Equipment";
import { brand } from "@/config/brand";

/** Demo login. Any valid-looking email and password continues to the app placeholder. */
export default function LoginPage() {
  const navigate = useNavigate();
  const emailId = useId();
  const passId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Log in · ${brand.name}`;
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Enter the email you signed up with.");
    if (password.length < 1) return setError("Enter your password.");
    setError(null);
    navigate("/app");
  };

  const input =
    "clay-well h-[3.25rem] w-full !rounded-2xl px-4 text-base text-clay-ink placeholder:text-clay-subtle focus:outline-none focus:ring-2 focus:ring-ember-400";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[linear-gradient(180deg,#FFF6EF,#FBF8F4)] px-5 py-10 text-clay-ink">
      <div aria-hidden="true" className="absolute bottom-10 right-10 hidden w-32 md:block">
        <Kettlebell className="w-full" />
      </div>
      <div className="relative w-full max-w-sm">
        <Link to="/" aria-label={`${brand.name} home`} className="mx-auto block w-fit">
          <Logo />
        </Link>
        <form onSubmit={onSubmit} noValidate className="clay mt-8 p-7">
          <h1 className="text-2xl font-bold tracking-tight">Log in to your gym</h1>
          <p className="mt-1 text-sm text-clay-muted">Owners, staff, trainers and members all log in here.</p>
          <label htmlFor={emailId} className="mt-6 block text-sm font-semibold">
            Email
          </label>
          <input id={emailId} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="neha@pulsestudio.in" className={`${input} mt-1.5`} />
          <label htmlFor={passId} className="mt-4 block text-sm font-semibold">
            Password
          </label>
          <input id={passId} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} mt-1.5`} />
          {error && (
            <p role="alert" className="mt-3 text-sm text-status-danger-fg">
              {error}
            </p>
          )}
          <Button type="submit" variant="ink" size="lg" className="mt-6 w-full">
            Log in
          </Button>
          <p className="mt-5 text-center text-sm text-clay-muted">
            New to {brand.name}?{" "}
            <Link to="/signup" className="font-semibold text-clay-ink underline decoration-ember-500/70 decoration-2 underline-offset-4">
              Start a free trial
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
