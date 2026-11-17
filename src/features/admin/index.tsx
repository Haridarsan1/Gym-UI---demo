import { Route, Routes } from "react-router-dom";
import { AreaStub } from "@/app/AreaStub";

export default function AdminArea() {
  return (
    <Routes>
      <Route path="*" element={<AreaStub title="Platform admin" />} />
    </Routes>
  );
}
