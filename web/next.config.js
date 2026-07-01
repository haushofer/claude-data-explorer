/** @type {import('next').NextConfig} */
const nextConfig = {
  // the agent SDK is node-only; keep it external to the server bundle.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};
module.exports = nextConfig;
