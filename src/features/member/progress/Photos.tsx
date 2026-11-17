import { useRef, useState } from "react";
import { Camera, Lock, X } from "lucide-react";
import { Link } from "react-router-dom";
import { isApiError, useAddPhoto, useDeletePhoto, usePhotos } from "@/api";
import type { PhotoView } from "@/api";
import { Button3D } from "@/design/Button3D";
import { Dialog } from "@/design/Dialog";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import { shrinkPhoto } from "@/features/member/progress/photo";
import { formatDate } from "@/lib/when";

/**
 * Progress photos (P01, S04). They exist only with the member’s photo consent. Without it the card says why and links to the
 * consent setting in Me. In demo mode photos are stored in the browser’s IndexedDB with the rest of the demo gym.
 */
export function Photos() {
  const query = usePhotos();
  return (
    <section aria-labelledby="photos-title" className="clay p-5">
      <h2 id="photos-title" className="text-lg font-bold">Progress photos</h2>
      <QueryBoundary query={query} errorTitle="We couldn’t load your photos" skeleton={<SkeletonRows rows={2} label="Loading your photos" />}>
        {({ consent, photos }) => (consent ? <PhotoGrid photos={photos} /> : <NoConsent />)}
      </QueryBoundary>
    </section>
  );
}

function NoConsent() {
  return (
    <div className="mt-2">
      <p className="flex items-start gap-3 rounded-2xl bg-clay-lavender px-4 py-4 text-[0.95rem]">
        <Lock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          Progress photos are private, so we only keep them if you agree. Only you and your trainer can see them. The front desk and finance team never can.
        </span>
      </p>
      <Link to="/m/me#consent" className="mt-3 inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">
        Turn on photo consent in Me
      </Link>
    </div>
  );
}

function PhotoGrid({ photos }: { photos: PhotoView[] }) {
  const add = useAddPhoto();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<PhotoView | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    try {
      await add.mutateAsync({ dataUrl: await shrinkPhoto(file) });
      toast({ title: "Photo saved", description: "Only you and your trainer can see it.", tone: "success" });
    } catch (e) {
      toast({ title: "Photo wasn’t saved", description: isApiError(e) ? e.message : "Choose a photo from your camera or gallery and try again.", tone: "error" });
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-2">
      <p className="text-sm text-clay-muted">Only you and your trainer can see these. Add one every few weeks to see the change.</p>
      <input ref={input} id="photo-input" type="file" accept="image/*" className="sr-only" aria-label="Choose a progress photo" onChange={(e) => void onPick(e.target.files?.[0])} />
      <Button3D variant="white" className="mt-3 w-full" disabled={add.isPending} onClick={() => input.current?.click()}>
        <Camera className="h-5 w-5" aria-hidden="true" />
        {add.isPending ? "Saving photo…" : "Add a photo"}
      </Button3D>
      {photos.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-clay-lavender px-4 py-4 text-[0.95rem]">No photos yet. Add your first one today, and it becomes your starting point.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="Your progress photos, newest first">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" aria-haspopup="dialog" onClick={() => setOpen(p)} className="block aspect-[3/4] w-full overflow-hidden rounded-xl bg-clay-lavender">
                <img src={p.dataUrl} alt={`Progress photo from ${formatDate(p.takenOn)}`} className="h-full w-full object-cover" />
              </button>
              <p className="mt-1 text-center text-xs text-clay-muted">{formatDate(p.takenOn)}</p>
            </li>
          ))}
        </ul>
      )}
      <PhotoDialog photo={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function PhotoDialog({ photo, onClose }: { photo: PhotoView | null; onClose: () => void }) {
  const remove = useDeletePhoto();
  const [confirm, setConfirm] = useState(false);
  const close = () => {
    setConfirm(false);
    onClose();
  };
  return (
    <Dialog open={photo !== null} onClose={close} label="Progress photo" placement="bottom" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      {photo && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{formatDate(photo.takenOn)}</h2>
            <button type="button" onClick={close} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender" data-autofocus>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <img src={photo.dataUrl} alt={`Progress photo from ${formatDate(photo.takenOn)}`} className="mt-3 max-h-[55dvh] w-full rounded-2xl object-contain" />
          {confirm ? (
            <div className="mt-4">
              <p className="font-semibold">Remove this photo? This can’t be undone.</p>
              <div className="mt-3 flex gap-3">
                <Button3D variant="ink" className="flex-1" disabled={remove.isPending} onClick={() => remove.mutate(photo.id, { onSuccess: close })}>
                  Remove photo
                </Button3D>
                <Button3D variant="white" onClick={() => setConfirm(false)}>Keep it</Button3D>
              </div>
            </div>
          ) : (
            <Button3D variant="white" className="mt-4 w-full" onClick={() => setConfirm(true)}>
              Remove photo
            </Button3D>
          )}
        </>
      )}
    </Dialog>
  );
}
