/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/catalogue", destination: "/climatiseurs", permanent: true },
    ];
  },
};

export default nextConfig;
