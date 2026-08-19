/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["cheerio", "googleapis"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;