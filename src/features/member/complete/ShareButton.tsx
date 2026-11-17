import { Share2 } from "lucide-react";
import { Button3D } from "@/design/Button3D";

/** Whether this browser can share. The button is left out where it can’t, instead of showing something that does nothing. */
export const canShare = (): boolean => typeof navigator !== "undefined" && typeof navigator.share === "function";

/** Shares a plain-text summary with the phone’s share sheet. Closing the sheet is not an error. */
export function ShareButton({ text }: { text: string }) {
  if (!canShare()) return null;
  return (
    <Button3D
      variant="white"
      size="lg"
      onClick={() => {
        navigator.share({ title: "Workout", text }).catch(() => undefined);
      }}
    >
      <Share2 className="h-5 w-5" aria-hidden="true" />
      Share
    </Button3D>
  );
}
