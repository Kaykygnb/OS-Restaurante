import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { estaLogado, lerUsuario, sair, telaInicial } from "./auth/sessao";
import AppLayout from "./componentes/layout/AppLayout";
import ConectarCelulares from "./paginas/conectar/ConectarCelulares";
import RequerCaixa from "./componentes/RequerCaixa";
import RotaProtegida from "./componentes/RotaProtegida";
import SistemaProvider from "./estado/Sistema";
import Aparelho from "./paginas/Aparelho";
import Auditoria from "./paginas/auditoria/Auditoria";
import CaixaTela from "./paginas/caixa/CaixaTela";
import Cardapio from "./paginas/Cardapio";
import Configuracoes from "./paginas/Configuracoes";
import Conta from "./paginas/Conta";
import Clientes from "./paginas/clientes/Clientes";
import Delivery from "./paginas/delivery/Delivery";
import VendaRapida from "./paginas/venda/VendaRapida";
import Entrar from "./paginas/Entrar";
import Estoque from "./paginas/estoque/Estoque";
import Inicio from "./paginas/Inicio";
import MapaMesas from "./paginas/mesas/MapaMesas";
import Pdv from "./paginas/Pdv";
import Relatorios from "./paginas/relatorios/Relatorios";
import Promocoes from "./paginas/promocoes/Promocoes";
import Cozinha from "./paginas/cozinha/Cozinha";
import Usuarios from "./paginas/Usuarios";
import { registrarAoExpirarSessao } from "./servicos/api";

// 401 em qualquer tela (sessão vencida, usuário desativado): volta ao login em vez de ficar com erros soltos.
registrarAoExpirarSessao(() => {
  sair();
  if (!location.pathname.startsWith("/login")) location.assign("/login?expirou=1");
});

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={estaLogado() ? <Navigate to={telaInicial(lerUsuario()?.tipo)} replace /> : <Entrar />} />

        <Route element={<RotaProtegida />}>
          <Route
            path="/painel"
            element={
              <SistemaProvider>
                <AppLayout />
              </SistemaProvider>
            }
          >
            <Route index element={<Inicio />} />
            <Route path="venda" element={<RequerCaixa><VendaRapida /></RequerCaixa>} />
            <Route path="balcao" element={<VendaRapida key="balcao" modo="balcao" />} />
            <Route path="mesas" element={<MapaMesas />} />
            <Route path="pdv/:atendimentoId" element={<Pdv />} />
            <Route path="conta/:atendimentoId" element={<RequerCaixa><Conta /></RequerCaixa>} />
            <Route path="delivery/*" element={<Delivery />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="pedidos" element={<Cozinha />} />
            <Route path="cozinha" element={<Cozinha />} />
            <Route path="caixa" element={<RequerCaixa><CaixaTela /></RequerCaixa>} />
            <Route path="cardapio" element={<Cardapio />} />
            <Route path="promocoes" element={<Promocoes />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="auditoria" element={<Auditoria />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="conectar" element={<ConectarCelulares />} />
            <Route path="aparelho" element={<Aparelho />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={estaLogado() ? "/painel" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
