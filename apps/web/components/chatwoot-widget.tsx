"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    chatwootSettings?: {
      position: string;
      type: string;
      launcherTitle: string;
    };
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void;
    };
  }
}

export function ChatwootWidget() {
  useEffect(() => {
    // 1. Configuración oficial de Chatwoot en window
    window.chatwootSettings = {
      position: "right",
      type: "expanded_bubble", // standard
      launcherTitle: "",
    };

    const BASE_URL = "https://chatwoot.identechnology.co";
    const SCRIPT_ID = "chatwoot-sdk-script";

    // 2. Prevenir inserción duplicada en Fast Refresh o navegación interna
    if (document.getElementById(SCRIPT_ID)) {
      if (window.chatwootSDK) {
        window.chatwootSDK.run({
          websiteToken: "5B2F8ponjbgaUVXQhiaWCCyh",
          baseUrl: BASE_URL,
        });
      }
      return;
    }

    // 3. Inserción asíncrona mediante DOM directo sin etiquetas <script> en JSX
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `${BASE_URL}/packs/js/sdk.js`;
    script.async = true;
    script.onload = () => {
      if (window.chatwootSDK) {
        window.chatwootSDK.run({
          websiteToken: "5B2F8ponjbgaUVXQhiaWCCyh",
          baseUrl: BASE_URL,
        });
      }
    };

    document.body.appendChild(script);
  }, []);

  return null;
}
