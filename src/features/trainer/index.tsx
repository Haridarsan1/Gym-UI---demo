import { Route, Routes } from "react-router-dom";
import { AreaStub } from "@/app/AreaStub";

export default function TrainerArea() {
  return (
    <Routes>
      <Route path="*" element={<AreaStub title="Trainer" />} />
    </Routes>
  );
}
