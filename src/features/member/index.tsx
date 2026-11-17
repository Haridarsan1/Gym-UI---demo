import { Route, Routes } from "react-router-dom";
import { AreaStub } from "@/app/AreaStub";

export default function MemberArea() {
  return (
    <Routes>
      <Route path="*" element={<AreaStub title="Member" />} />
    </Routes>
  );
}
