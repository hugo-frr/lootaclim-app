/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/catalogue", destination: "/#modeles", permanent: true },
    ];
  },
};

export default nextConfig;
