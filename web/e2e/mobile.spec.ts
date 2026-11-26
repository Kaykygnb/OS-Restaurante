import { test, expect } from "@playwright/test";
import { entrar } from "./apoio.ts";
const rotas=["/painel","/painel/venda","/painel/balcao","/painel/mesas","/painel/pdv/1","/painel/conta/1","/painel/delivery","/painel/delivery/novo","/painel/clientes","/painel/cardapio","/painel/usuarios","/painel/configuracoes?aba=operacao","/painel/configuracoes?aba=entrega","/painel/cadastro-mesas","/painel/impressao","/painel/caixa","/painel/relatorios","/painel/auditoria","/painel/promocoes","/painel/conectar"];
for (const largura of [320,360,430]) test(`telas de celular sem cortes em ${largura}px`,async({page},info)=>{
 test.setTimeout(120000); await page.setViewportSize({width:largura,height:740}); await entrar(page,"ze");
 const falhas=[];
 for(const rota of rotas){ await page.goto(rota); await expect(page.locator("main")).toBeVisible(); await page.locator("main").getByText(/Carregando/).first().waitFor({state:"hidden",timeout:5000}).catch(()=>{});
 const excesso=await page.evaluate((limite)=>({total:document.documentElement.scrollWidth,limite:innerWidth,elementos:Array.from(document.querySelectorAll("main *")).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>limite+2||r.left< -2)&&getComputedStyle(e).position!=="fixed"}).slice(0,8).map(e=>({tag:e.tagName,classe:e.className,texto:e.textContent?.slice(0,65)}))}),largura);
 if(excesso.total>largura+1){falhas.push({rota,...excesso});await page.screenshot({path:info.outputPath(`overflow-${rota.replace(/[^a-z]/g,"-")}.png`)});}
 }
 expect(falhas).toEqual([]);
});

test("menu mobile mantém foco, bloqueia fundo e devolve o foco ao fechar",async({page})=>{
 await page.setViewportSize({width:360,height:740}); await entrar(page,"ze"); const mais=page.getByRole("button",{name:"Mais",exact:true}); await mais.click(); const dlg=page.getByRole("dialog"); await expect(dlg).toBeVisible();
 await expect(dlg.getByRole("link").first()).toBeFocused(); expect(await page.evaluate(()=>document.body.style.overflow)).toBe("hidden"); await page.keyboard.press("Shift+Tab"); expect(await dlg.evaluate(el=>el.contains(document.activeElement))).toBe(true); await page.keyboard.press("Escape"); await expect(dlg).toHaveCount(0); await expect(mais).toBeFocused(); expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
});

test("editor em 320px mantém etapas, campos e ação final dentro da tela",async({page})=>{
 await page.setViewportSize({width:320,height:640}); await entrar(page,"ze"); await page.goto("/painel/cardapio"); await page.getByRole("button",{name:"Novo produto",exact:true}).click(); const dlg=page.getByRole("dialog");
 await dlg.getByLabel("Nome do produto").fill("Produto com nome longo para conferir a quebra em celulares"); await dlg.getByRole("button",{name:"Continuar",exact:true}).click(); await dlg.locator(".linha-preco").getByLabel("Preço",{exact:false}).fill("25,00"); await dlg.getByRole("button",{name:"Adicionar apresentação"}).click(); await dlg.locator(".linha-preco").getByLabel("Nome",{exact:false}).nth(1).fill("Apresentação grande com um nome comprido"); await dlg.locator(".linha-preco").getByLabel("Preço",{exact:false}).nth(1).fill("40,00");
 const continuar=dlg.getByRole("button",{name:"Continuar",exact:true}); const box=await continuar.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x+box!.width).toBeLessThanOrEqual(320); expect(box!.y+box!.height).toBeLessThanOrEqual(640); expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320); await continuar.click(); await expect(dlg.getByText("Mesmas escolhas",{exact:false}).first()).toBeVisible();
});

test("celular deitado e janela reduzida mantêm ações do diálogo acessíveis",async({page})=>{
 await page.setViewportSize({width:740,height:360}); await entrar(page,"ze"); await page.goto("/painel/cardapio"); await page.getByRole("button",{name:"Novo produto",exact:true}).click(); const dlg=page.getByRole("dialog"); const continuar=dlg.getByRole("button",{name:"Continuar",exact:true}); await expect(continuar).toBeVisible();
 const caixa=await continuar.boundingBox(); expect(caixa!.y+caixa!.height).toBeLessThanOrEqual(360); await dlg.getByLabel("Nome do produto").fill("Teste de janela reduzida"); await page.setViewportSize({width:360,height:460}); const pequena=await continuar.boundingBox(); expect(pequena!.y+pequena!.height).toBeLessThanOrEqual(460); expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("novo usuário abre o formulário na área visível do celular",async({page})=>{
 await page.setViewportSize({width:360,height:740}); await entrar(page,"ze"); await page.goto("/painel/usuarios"); await page.getByRole("button",{name:"Novo usuário",exact:true}).click(); const editor=page.locator(".painel-drawer"); await expect(editor).toBeVisible(); await expect.poll(async()=>{ const r=await editor.boundingBox(); return r?.y ?? 9999; }).toBeLessThan(200); await expect(editor.getByRole("button",{name:"Fechar",exact:true})).toBeInViewport();
});
