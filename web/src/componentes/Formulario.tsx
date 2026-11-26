import { useId, useState, type FormHTMLAttributes } from "react";
import { createPortal } from "react-dom";
type Props = FormHTMLAttributes<HTMLFormElement>;
type ErroCampo = { id: string; campo: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; nome: string; mensagem: string };
export default function Formulario({ onSubmit, children, ...props }: Props) {
  const prefixo = useId();
  const [erros, setErros] = useState<ErroCampo[]>([]);
  function limpar() { erros.forEach(({ campo }) => { campo.removeAttribute("aria-invalid"); campo.removeAttribute("aria-describedby"); }); setErros([]); }
  return <form {...props} noValidate onInput={e => { limpar(); props.onInput?.(e); }} onSubmit={e => {
    const invalidos = Array.from(e.currentTarget.elements).filter((x): x is ErroCampo["campo"] => x instanceof HTMLInputElement || x instanceof HTMLSelectElement || x instanceof HTMLTextAreaElement).filter(x => !x.validity.valid);
    if (invalidos.length) {
      e.preventDefault();
      const novos = invalidos.map((campo, i) => {
        const id = `${prefixo}-erro-${i}`;
        const nome = campo.getAttribute("aria-label") || campo.labels?.[0]?.querySelector("span")?.textContent?.trim() || campo.labels?.[0]?.textContent?.trim() || `Campo ${i+1}`;
        const mensagem = campo.validity.valueMissing ? "Preencha este campo." : campo.validity.typeMismatch ? "Confira o formato informado." : campo.validity.rangeUnderflow ? `Use um valor a partir de ${campo.getAttribute("min")}.` : campo.validity.rangeOverflow ? `Use um valor até ${campo.getAttribute("max")}.` : "Confira o valor informado.";
        campo.setAttribute("aria-invalid", "true"); campo.setAttribute("aria-describedby", id);
        return { id, campo, nome, mensagem };
      });
      setErros(novos); invalidos[0].focus(); return;
    }
    limpar(); onSubmit?.(e);
  }}>{erros.length ? <div role="alert" className="feedback-card feedback-erro">Revise os campos destacados antes de continuar.</div> : null}{children}{erros.map(e => e.campo.parentElement ? createPortal(<small id={e.id} className="erro-campo">{e.mensagem}</small>, e.campo.parentElement,e.id) : null)}</form>;
}
