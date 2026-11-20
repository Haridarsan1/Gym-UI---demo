import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useSaveSettings, useSettings } from "@/api/ownerHooks";
import type { SettingsView } from "@/api/settings";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Field, inputClass } from "@/design/Field";
import { GymMark } from "@/design/GymMark";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import { gstinState, validateProfile } from "@/domain/settings";
import { fileToLogo } from "@/lib/logo";

/**
 * Settings (R02), owner only: the gym’s name, registered name and address as they print on tax receipts, its GSTIN, and its logo. The logo and name show in the sidebar and header, on loading screens
 * and at the top of every receipt, for staff and members alike. Currency and time zone are shown: they are India’s and don’t change.
 */
export default function Settings() {
  const query = useSettings();
  return (
    <div className="max-w-4xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load the settings" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Settings</h1><SkeletonRows rows={5} /></>}>
        {(v) => <Form key={JSON.stringify([v.name, v.legalName, v.gstin, v.address, v.logoUrl?.length])} v={v} />}
      </QueryBoundary>
    </div>
  );
}

function Form({ v }: { v: SettingsView }) {
  const save = useSaveSettings();
  const toast = useToast();
  const [d, setD] = useState({ name: v.name, legalName: v.legalName, gstin: v.gstin, address: v.address });
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [logoError, setLogoError] = useState<string>();
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string>();
  const key = useRef(`settings-${crypto.randomUUID()}`);
  const file = useRef<HTMLInputElement>(null);
  const shownLogo = logo === undefined ? v.logoUrl : (logo ?? undefined);
  const errors = validateProfile(d, logo);
  const dirty = logo !== undefined || d.name !== v.name || d.legalName !== v.legalName || d.gstin !== v.gstin || d.address !== v.address;
  const state = d.gstin.trim() ? gstinState(d.gstin) : undefined;
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const pick = async (f: File | undefined) => {
    setLogoError(undefined);
    if (!f) return;
    try { setLogo(await fileToLogo(f)); } catch (e) { setLogoError(e instanceof Error ? e.message : "We couldn’t use that image."); }
    if (file.current) file.current.value = "";
  };
  const submit = async () => {
    setTried(true); setFailure(undefined);
    if (Object.keys(errors).length) return;
    try {
      const r = await save.mutateAsync({ key: key.current, ...d, logo });
      toast({ title: r.changes.length ? "Settings saved" : "Nothing changed", description: r.changes.length ? "The name and logo show in the header, the sidebar and on every receipt. The change is in the audit log." : undefined, tone: "success" });
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t save the settings. Try again."); }
  };
  const err = (k: keyof typeof d) => (tried ? errors[k] : undefined);

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label="Gym settings" className="space-y-5">
      <header>
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Settings</h1>
        <p className="max-w-[70ch] text-clay-muted">How your gym appears to staff and members, and what prints on tax receipts.</p>
      </header>

      <section aria-labelledby="logo-title" className="clay space-y-3 p-4 sm:p-5">
        <h2 id="logo-title" className="text-lg font-bold">Logo</h2>
        <div className="flex flex-wrap items-center gap-4">
          <GymMark name={d.name || v.name} logoUrl={shownLogo} className="!h-20 !w-20 !rounded-2xl !text-2xl" />
          <div className="space-y-2">
            <p className="max-w-[48ch] text-[0.95rem] text-clay-muted">{shownLogo ? "This is your logo. It shows in the sidebar, the header and at the top of every receipt." : "No logo yet, so your gym’s initials are shown. Add one and it replaces them everywhere."} A square image works best. PNG, JPG, WebP or SVG.</p>
            <div className="flex flex-wrap gap-3">
              <label className="clay-flat inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 px-4 font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ember-300"><ImagePlus className="h-4 w-4" aria-hidden="true" />{shownLogo ? "Choose another logo" : "Upload a logo"}<input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label="Logo file" onChange={(e) => void pick(e.target.files?.[0])} /></label>
              {shownLogo && <Button3D type="button" variant="white" size="md" onClick={() => setLogo(null)}><Trash2 className="h-4 w-4" aria-hidden="true" />Remove logo</Button3D>}
            </div>
            {(logoError || errors.logo) && <p role="alert" className="text-sm font-semibold text-status-danger-fg">{logoError ?? errors.logo}</p>}
            {logo !== undefined && !logoError && <p role="status" className="text-sm text-clay-muted">{logo === null ? "The logo will be removed when you save." : "The new logo is shown here. It is used everywhere once you save."}</p>}
          </div>
        </div>
      </section>

      <section aria-labelledby="gym-title" className="clay space-y-4 p-4 sm:p-5">
        <h2 id="gym-title" className="text-lg font-bold">Gym</h2>
        <Field label="Gym name" htmlFor="st-name" hint="Shown in the app and to your members." error={err("name")}><input id="st-name" value={d.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} autoComplete="off" /></Field>
        <Field label="Registered name" htmlFor="st-legal" hint="Printed at the top of tax receipts. Leave empty to use the gym name." error={err("legalName")}><input id="st-legal" value={d.legalName} onChange={(e) => set({ legalName: e.target.value })} className={inputClass} autoComplete="off" /></Field>
        <Field label="Registered address" htmlFor="st-address" hint="Printed on tax receipts." error={err("address")}><textarea id="st-address" rows={3} value={d.address} onChange={(e) => set({ address: e.target.value })} className={`${inputClass} py-2`} /></Field>
        <Field label="GSTIN" htmlFor="st-gstin" hint={state ? `Registered in ${state}. Receipts are taxed by this state.` : "15 characters, like 27AABCP1234F1Z5. Leave empty if the gym isn’t registered."} error={err("gstin")}><input id="st-gstin" value={d.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} className={inputClass} autoComplete="off" /></Field>
        <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-clay-muted">Currency</dt><dd className="font-semibold">{v.currency}, ₹ with Indian grouping</dd></div><div><dt className="text-sm text-clay-muted">Time zone</dt><dd className="font-semibold">{v.timeZone}</dd></div></dl>
        <p className="text-sm text-clay-muted">Your branches are in {v.branchStates.join(", ")}. GST on a membership is charged in the branch’s state.</p>
      </section>

      {failure && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
      <div className="flex flex-wrap gap-3"><Button3D type="submit" variant="ember" size="md" disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</Button3D>{dirty && <Button3D type="button" variant="white" size="md" onClick={() => { setD({ name: v.name, legalName: v.legalName, gstin: v.gstin, address: v.address }); setLogo(undefined); setLogoError(undefined); setTried(false); }}>Discard</Button3D>}</div>
    </form>
  );
}
