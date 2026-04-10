import type {
  SupportThread,
  SupportThreadCategory,
  SupportThreadStatus,
  UserRole
} from "./types";

export const SUPPORT_CATEGORY_OPTIONS: Array<{
  value: SupportThreadCategory;
  label: string;
  description: string;
}> = [
  { value: "acesso", label: "Acesso", description: "Login, verificação de e-mail, redefinição de senha." },
  { value: "pagamento", label: "Pagamento", description: "PIX, cartão, crédito na carteira e cobranças." },
  { value: "transcricao", label: "Transcrição", description: "Falhas de processamento, idioma e qualidade." },
  { value: "entrega", label: "Entrega", description: "Downloads, formatos e arquivos finais." },
  { value: "conta", label: "Conta", description: "Dados cadastrais, perfil e dúvidas gerais." }
];

export function getSupportCategoryLabel(category: SupportThreadCategory) {
  return SUPPORT_CATEGORY_OPTIONS.find((item) => item.value === category)?.label ?? category;
}

export function getSupportStatusLabel(status: SupportThreadStatus) {
  switch (status) {
    case "new":
      return "Novo";
    case "open":
      return "Aberto";
    case "waiting_user":
      return "Aguardando cliente";
    case "waiting_support":
      return "Aguardando suporte";
    case "resolved":
      return "Resolvido";
    case "closed":
      return "Encerrado";
    default:
      return status;
  }
}

export function getSupportStatusClassName(status: SupportThreadStatus) {
  switch (status) {
    case "resolved":
      return "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "closed":
      return "border border-slate-700 bg-slate-800 text-slate-300";
    case "waiting_user":
      return "border border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "waiting_support":
    case "new":
      return "border border-primary/20 bg-primary/10 text-primary";
    case "open":
    default:
      return "border border-sky-500/20 bg-sky-500/10 text-sky-300";
  }
}

export function getSupportRoleLabel(role: UserRole | "system") {
  switch (role) {
    case "admin":
      return "Admin";
    case "support":
      return "Suporte";
    case "system":
      return "Sistema";
    default:
      return "Cliente";
  }
}

export function isOpenSupportThread(status: SupportThread["status"]) {
  return !["resolved", "closed"].includes(status);
}
