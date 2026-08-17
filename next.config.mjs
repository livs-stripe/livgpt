/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/mock-catalog/images/:path*",
        destination: "https://livgpt.vercel.app/mock-catalog/images/:path*",
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "img-src 'self' data: blob: https:;",
          },
        ],
      },
    ]
  },
}

export default nextConfig
