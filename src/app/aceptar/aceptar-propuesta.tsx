"use client";

import {useEffect, useState} from "react";
import {useSearchParams} from "next/navigation";

const N8N_BASE = process.env.NEXT_PUBLIC_N8N_BASE;

type AcceptStatus = "ok" | "ya_procesado" | "invalido";

type ViewState = "cargando" | AcceptStatus | "error";

interface StatusContent {
  symbol: string;
  accent: string;
  title: string;
  message: string;
}

const STATUS_CONTENT: Record<Exclude<ViewState, "cargando">, StatusContent> = {
  ok: {
    symbol: "✓",
    accent: "text-amber-400",
    title: "¡Propuesta aceptada!",
    message: "Te llega la factura a tu correo en los próximos minutos.",
  },
  ya_procesado: {
    symbol: "↺",
    accent: "text-neutral-400",
    title: "Enlace ya usado",
    message: "Este enlace ya fue usado. La propuesta ya había quedado registrada.",
  },
  invalido: {
    symbol: "✕",
    accent: "text-red-400",
    title: "Enlace no válido",
    message: "Enlace no válido o vencido. Pedinos uno nuevo si todavía querés avanzar.",
  },
  error: {
    symbol: "!",
    accent: "text-red-400",
    title: "Algo salió mal",
    message: "No pudimos verificar el enlace. Probá de nuevo en unos minutos.",
  },
};

function isAcceptStatus(value: unknown): value is AcceptStatus {
  return value === "ok" || value === "ya_procesado" || value === "invalido";
}

function StatusView({accent, symbol, title, message}: StatusContent) {
  return (
    <div className="flex flex-col items-start gap-6 py-16">
      <span className={`font-mono text-4xl font-black ${accent}`}>{symbol}</span>
      <div>
        <h2 className="text-3xl font-black tracking-tight text-neutral-100">{title}</h2>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-neutral-500">{message}</p>
      </div>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="flex flex-col items-start gap-6 py-16">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Verificando enlace…
      </span>
      <div className="h-px w-24 animate-pulse bg-amber-400" />
    </div>
  );
}

export default function AceptarPropuesta() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ViewState>("cargando");

  useEffect(() => {
    const leadId = searchParams.get("lead_id");
    const token = searchParams.get("token");

    if (!leadId || !token || !N8N_BASE) {
      setState("invalido");

      return;
    }

    const controller = new AbortController();

    async function verificar() {
      try {
        const url = `${N8N_BASE}/webhook/lead-acepta?lead_id=${encodeURIComponent(
          leadId!,
        )}&token=${encodeURIComponent(token!)}`;
        const response = await fetch(url, {signal: controller.signal});

        if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);

        const data: unknown = await response.json();
        const status = (data as {status?: unknown} | null)?.status;

        setState(isAcceptStatus(status) ? status : "error");
      } catch (err) {
        if (controller.signal.aborted) return;

        console.error(err);
        setState("error");
      }
    }

    verificar();

    return () => controller.abort();
  }, [searchParams]);

  if (state === "cargando") return <LoadingView />;

  return <StatusView {...STATUS_CONTENT[state]} />;
}
