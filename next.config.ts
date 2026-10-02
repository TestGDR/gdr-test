import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Caricamento di immagini (stemmi e ritratti fino a 1 MB, documentazione
      // fino a 2 MB, mappe fino a 5 MB) + dati del modulo
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
