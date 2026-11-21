import { useRef, useState } from "react";
import { X } from "lucide-react";
import { useCommsActions } from "@/api/ownerHooks";
import type { TemplateView } from "@/api/communications";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Field, inputClass } from "@/design/Field";
import { useToast } from "@/design/Toast";
import { fill, templateDef, validateTemplate } from "@/domain/emailTemplates";

/** The wording of one email, with the placeholders it may use and a preview filled with a sample member as you type. Only the owner can change it. */
export function TemplateEditor({ t, canEdit, onClose }: { t: TemplateView; canEdit: boolean; onClose: () => void }) {
  const { template } = useCommsActions();
  const toast = useToast();
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string>();
  const key = useRef(`tpl-${crypto.randomUUID()}`);
  const def = templateDef(t.id)!;
  const errors = validateTemplate(def, { subject, body });
  const save = async (s: string, b: string, reset = false) => {
    setTried(true);
    setFailure(undefined);
    if (!reset && Object.keys(errors).length) return;
    try {
      await template.mutateAsync({ id: t.id, subject: s, body: b, key: key.current });
      toast({ title: reset ? "Back to Ember’s wording" : "Wording saved", description: "The next email of this kind uses it. The change is in the audit log.", tone: "success" });
      onClose();
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t save the wording. Try again."); }
  };
  const preview = { subject: fill(subject, t.sample), body: fill(body, t.sample) };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(subject, body); }} noValidate aria-label={`Email: ${t.title}`} className="flex min-h-full flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div><h2 className="text-xl font-bold">{t.title}</h2><p className="text-sm text-clay-muted">{t.about}</p><p className="text-sm text-clay-muted">{t.rule}</p></div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-clay-canvas"><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>
      <fieldset disabled={!canEdit} className="min-w-0 flex-1 space-y-4 border-0 px-5 pb-4 pt-2">
        {!canEdit && <p className="text-sm text-clay-muted">Only the owner can change the wording.</p>}
        <Field label="Subject" htmlFor="tp-subject" error={tried ? errors.subject : undefined}><input id="tp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} data-autofocus aria-invalid={tried && errors.subject ? true : undefined} aria-describedby={tried && errors.subject ? "tp-subject-error" : undefined} /></Field>
        <Field label="Email" htmlFor="tp-body" error={tried ? errors.body : undefined}><textarea id="tp-body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} py-2`} aria-invalid={tried && errors.body ? true : undefined} aria-describedby={tried && errors.body ? "tp-body-error" : undefined} /></Field>
        <div><p className="text-sm font-semibold">You can use</p><ul aria-label="Placeholders" className="mt-1 space-y-0.5 text-sm">{t.placeholders.map((p) => <li key={p.key}><code className="rounded bg-clay-canvas px-1.5 py-0.5">{`{{${p.key}}}`}</code> <span className="text-clay-muted">{p.about}</span></li>)}</ul></div>
        <section aria-label="Preview" aria-live="polite" className="rounded-2xl bg-clay-canvas p-4">
          <h3 className="font-bold">Preview</h3>
          <p className="mt-1 text-sm text-clay-muted">With a sample member, Priya on a Monthly plan.</p>
          <p className="mt-2 font-semibold">{preview.subject}</p>
          <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[0.95rem]">{preview.body}</p>
        </section>
      </fieldset>
      {failure && <p role="alert" className="mx-5 mb-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-clay-line bg-white/95 px-5 py-3 backdrop-blur">
        {canEdit ? (
          <>
            <Button3D type="submit" variant="ember" size="md" disabled={template.isPending}>{template.isPending ? "Saving…" : "Save wording"}</Button3D>
            <Button3D type="button" variant="white" size="md" onClick={onClose}>Cancel</Button3D>
            {t.custom && <button type="button" onClick={() => void save(t.defaultSubject, t.defaultBody, true)} className="ml-auto min-h-[2.75rem] cursor-pointer px-2 text-sm font-semibold underline underline-offset-2">Use Ember’s wording</button>}
          </>
        ) : <Button3D type="button" variant="white" size="md" onClick={onClose}>Close</Button3D>}
      </footer>
    </form>
  );
}
