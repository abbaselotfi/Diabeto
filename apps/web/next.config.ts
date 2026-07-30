import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Diabeto";
const basePath = isGitHubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  transpilePackages: ["@diabeto/contracts", "@diabeto/clinical-engine"],
  output: isGitHubPages ? "export" : undefined,
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: isGitHubPages,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath }
};

export default nextConfig;
