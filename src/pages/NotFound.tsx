import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-clay-canvas text-clay-ink px-5 text-center">
      <div>
        <p className="font-display text-[6rem] font-extrabold leading-none">404</p>
        <h1 className="mt-2 text-xl font-bold">This page doesn’t exist</h1>
        <p className="mt-2 text-clay-muted">Check the address, or head back to the home page.</p>
        <ButtonLink to="/" variant="primary" className="mt-8">
          Go to home page
        </ButtonLink>
      </div>
    </main>
  );
}
