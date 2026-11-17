import { Route, Routes } from "react-router-dom";
import { AreaStub } from "@/app/AreaStub";

export default function OwnerArea() {
  return (
    <Routes>
      <Route path="*" element={<AreaStub title="Owner" />} />
    </Routes>
  );
}
