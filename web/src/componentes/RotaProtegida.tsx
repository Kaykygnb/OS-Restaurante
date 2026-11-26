import { Navigate, Outlet } from "react-router-dom";
import { estaLogado } from "../auth/sessao";

export default function RotaProtegida() {
  if (!estaLogado()) return <Navigate to="/login" replace />;
  return <Outlet />;
}
