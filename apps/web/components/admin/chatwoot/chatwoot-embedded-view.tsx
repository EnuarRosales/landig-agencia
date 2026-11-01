"use client";

import React, { useState, useEffect } from "react";

export interface ChatwootEmbeddedViewProps {
  clientId: string;
  t: {
    title: string;
    subtitle: string;
    loading: string;
    errorTitle: string;
    errorMessage: string;
    retryButton: string;
    reconnectButton: string;
  };
}

/**
 * Shell para la bandeja de Chatwoot embebida en iframe same-site (ADM-001 T-36, D-32, RF-02.4).
 * Maneja estados de carga, error de framing y reconexión sin abandonar mocter-admin.
 */
export function ChatwootEmbeddedView({ clientId, t }: ChatwootEmbeddedViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const embedUrl = `/auth/chatwoot/embed?client_id=${encodeURIComponent(clientId)}&r=${reloadKey}`;

  const handleRetry = () => {
    setIsLoading(true);
    setHasError(false);
    setReloadKey((prev) => prev + 1);
  };

  // Timeout preventivo para alertar si el iframe no responde en 15 segundos
  useEffect(() => {
    if (!isLoading) return;

    const timeout = setTimeout(() => {
      if (isLoading) {
        setHasError(true);
        setIsLoading(false);
      }
    }, 15000);

    return () => clearTimeout(timeout);
  }, [isLoading, reloadKey]);

  return (
    <div className="flex flex-col h-[calc(100dvh-4.5rem)] w-full overflow-hidden bg-bg text-txt p-2 md:p-4">
      {/* Encabezado HUD sutil */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
        <div>
          <h1 className="text-lg md:text-xl font-mono font-semibold tracking-wide text-white">
            {t.title}
          </h1>
          <p className="text-xs text-white/60 font-mono hidden sm:block">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="px-3 py-1.5 text-xs font-mono font-medium rounded border border-white/20 bg-white/5 hover:bg-white/10 text-white transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {t.reconnectButton}
          </button>
        </div>
      </div>

      {/* Área del contenedor del iframe */}
      <div className="relative flex-1 w-full mt-3 rounded-lg border border-white/10 bg-[#090d16] overflow-hidden">
        {/* Estado 1: Cargando (Skeleton HUD) */}
        {isLoading && (
          <div
            data-testid="chatwoot-loading-state"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-[#090d16]"
          >
            <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="font-mono text-sm text-white/80 animate-pulse text-center">
              {t.loading}
            </p>
            <p className="font-mono text-xs text-white/40 mt-1">Conectando túnel same-site...</p>
          </div>
        )}

        {/* Estado 2: Error de framing o timeout */}
        {hasError && (
          <div
            data-testid="chatwoot-error-state"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-[#090d16] text-center"
          >
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4 text-red-400">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-base font-mono font-bold text-white mb-2">{t.errorTitle}</h2>
            <p className="text-xs font-mono text-white/60 max-w-md mb-6">{t.errorMessage}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-4 py-2 text-xs font-mono font-semibold rounded bg-primary text-primary-foreground hover:brightness-110 transition-all shadow-sm"
            >
              {t.retryButton}
            </button>
          </div>
        )}

        {/* Iframe activo */}
        <iframe
          key={reloadKey}
          data-testid="chatwoot-iframe"
          src={embedUrl}
          title="Chatwoot Bandeja de Atención"
          className="w-full h-full border-0"
          allow="camera; microphone; fullscreen; clipboard-read; clipboard-write"
          onLoad={() => {
            setIsLoading(false);
            setHasError(false);
          }}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      </div>
    </div>
  );
}

