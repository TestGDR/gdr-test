import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Caricamento di immagini (stemmi e ritratti fino a 1 MB, immagini della
      // documentazione fino a 2 MB) + dati del modulo
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
