import {Suspense} from "react";

import AceptarPropuesta from "./aceptar-propuesta";

export default function AceptarPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pb-20 pt-6">
      <div className="mb-14 border-b border-neutral-800 pb-12 text-center">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.25em] text-amber-500">
          Aceptar propuesta
        </p>
        <h1 className="text-[clamp(2.4rem,7vw,4rem)] font-black leading-[0.9] tracking-tight text-neutral-100">
          Confirmá tu<br />propuesta.
        </h1>
      </div>

      <Suspense
        fallback={
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Cargando…
          </span>
        }
      >
        <AceptarPropuesta />
      </Suspense>
    </main>
  );
}
