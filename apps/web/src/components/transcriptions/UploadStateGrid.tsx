type UploadState = "idle" | "uploading" | "success" | "error";

type UploadStateGridProps = {
  state: UploadState;
  message: string;
  selectedFileName?: string;
};

export default function UploadStateGrid({
  state,
  message,
  selectedFileName
}: UploadStateGridProps) {
  return (
    <section className="newtx-states">
      <article className={`newtx-state-card ${state === "uploading" ? "active" : ""}`}>
        <h3>Processando</h3>
        <p>{state === "uploading" ? message : "Aguardando envio..."}</p>
      </article>
      <article className={`newtx-state-card ${state === "error" ? "error" : ""}`}>
        <h3>Erro</h3>
        <p>{state === "error" ? message : "Nenhum erro até o momento."}</p>
      </article>
      <article className={`newtx-state-card ${state === "success" ? "success" : ""}`}>
        <h3>Concluído</h3>
        <p>{state === "success" ? message : "Aguardando conclusão."}</p>
      </article>
      <article className="newtx-state-card empty">
        <h3>Vazio</h3>
        <p>{selectedFileName ?? "Nenhum arquivo selecionado."}</p>
      </article>
    </section>
  );
}