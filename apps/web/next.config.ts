import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 모노레포에서 상위 루트를 명시해 Next의 루트 추론 경고를 줄인다.
  outputFileTracingRoot: path.resolve(process.cwd(), "../..")
};

export default nextConfig;
