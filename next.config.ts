import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Caricamento di stemmi e ritratti (immagini fino a 1 MB + dati del modulo)
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
