import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import RotaProtegida from "./componentes/RotaProtegida";
import Shell from "./componentes/layout/Shell";
import Cardapio from "./paginas/Cardapio";
import Configuracoes from "./paginas/Configuracoes";
import Caixa from "./paginas/Caixa";
import Conta from "./paginas/Conta";
import Login from "./paginas/Login";
import Mesas from "./paginas/Mesas";
import Painel from "./paginas/Painel";
import Pedidos from "./paginas/Pedidos";
import Pdv from "./paginas/Pdv";
import Usuarios from "./paginas/Usuarios";
import { estaLogado } from "./auth/sessao";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={estaLogado() ? <Navigate to="/painel" replace /> : <Login />}
        />

        <Route element={<RotaProtegida />}>
          <Route path="/painel" element={<Shell />}>
            <Route index element={<Painel />} />
            <Route path="cardapio" element={<Cardapio />} />
            <Route path="pedidos" element={<Pedidos />} />
            <Route path="mesas" element={<Mesas />} />
            <Route path="pdv/:atendimentoId" element={<Pdv />} />
            <Route path="conta/:atendimentoId" element={<Conta />} />
            <Route path="caixa" element={<Caixa />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={estaLogado() ? "/painel" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
