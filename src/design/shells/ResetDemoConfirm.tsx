import { useResetDemo } from "@/app/useSessionActions";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";

/** Asks before putting the sample gym back to how it started (demo mode). Keeping the changes is the first, focused choice. */
export default function ResetDemoConfirm({ onClose }: { onClose: () => void }) {
  const resetDemo = useResetDemo();
  return (
    <Sheet open onClose={onClose} label="Reset demo data" kind="confirm">
      <div className="p-5">
        <h2 className="text-lg font-bold">Reset demo data?</h2>
        <p className="mt-2 text-[0.95rem] text-clay-muted">Everything you changed in the demo goes back to how it started: members, payments, bookings and workouts. You stay signed in.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button3D type="button" variant="white" onClick={onClose} data-autofocus>Keep my changes</Button3D>
          <Button3D type="button" variant="ember" onClick={() => { onClose(); void resetDemo(); }}>Reset demo data</Button3D>
        </div>
      </div>
    </Sheet>
  );
}
