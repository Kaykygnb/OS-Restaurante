import GuardiaoEdicao from "./componentes/GuardiaoEdicao";
import AbaMesas from "./paginas/configuracoes/AbaMesas";
import FilaImpressao from "./paginas/FilaImpressao";
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from "react-router-dom";
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

function RotaLogin() { return estaLogado() ? <Navigate to={telaInicial(lerUsuario()?.tipo)} replace /> : <Entrar />; }
const router = createBrowserRouter(createRoutesFromElements(
      <Route element={<GuardiaoEdicao />}>
        <Route path="/login" element={<RotaLogin />} />

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
            <Route path="cadastro-mesas" element={<AbaMesas />} />
            <Route path="impressao" element={<FilaImpressao />} />
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
            <Route path="configuracoes/entrega" element={<Navigate to="/painel/configuracoes?aba=entrega" replace />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="conectar" element={<ConectarCelulares />} />
            <Route path="aparelho" element={<Aparelho />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={estaLogado() ? "/painel" : "/login"} replace />} />
      </Route>
));
export default function App() { return <RouterProvider router={router} />; }
