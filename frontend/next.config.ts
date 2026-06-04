import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow network access for hot reloading
  // @ts-ignore
  allowedDevOrigins: ['192.168.1.23', '192.168.1.23:3000', '192.168.1.2:3000', '192.168.1.2', '10.176.15.187', '10.176.15.226'],
};

export default nextConfig;
