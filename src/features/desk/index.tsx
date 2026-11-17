import { Route, Routes } from "react-router-dom";
import { AreaStub } from "@/app/AreaStub";

export default function DeskArea() {
  return (
    <Routes>
      <Route path="*" element={<AreaStub title="Front desk" />} />
    </Routes>
  );
}
