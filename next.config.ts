import type { NextConfig } from "next";

const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: { "/api/study": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/ffmpeg.exe"] },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" }
    ] }];
  }
};
export default config;
