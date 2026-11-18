import { Sheet } from "@/design/Sheet";
import type { BookingPolicy, BookingView } from "@/api";
import { BookFlow } from "@/features/member/bookings/BookFlow";

/** Book or move a session in a sheet: a bottom sheet on phones, a side panel from 640 px. Desktop books inline (see Bookings). */
export function BookSheet({ open, reschedule, credits, policy, onClose }: { open: boolean; reschedule?: BookingView; credits: number; policy: BookingPolicy; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label={reschedule ? "Move your session" : "Book a session"} className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <BookFlow layout="stacked" reschedule={reschedule} credits={credits} policy={policy} onClose={onClose} />
    </Sheet>
  );
}
