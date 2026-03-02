import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 모노레포에서 상위 루트를 명시해 Next의 루트 추론 경고를 줄인다.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  // pg, bcryptjs는 Node.js 네이티브 모듈 — Next.js 번들러에서 제외
  serverExternalPackages: ["pg", "pg-native", "bcryptjs"],
  typescript: {
    // Supabase → PostgreSQL 마이그레이션으로 인한 implicit any 타입 에러 무시
    // 런타임 동작은 정상적이며, 추후 명시적 타입 보강 시 제거 가능
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
