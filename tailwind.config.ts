import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        spain: {
          red: "#AA151B",
          gold: "#F1BF00",
          terracotta: "#C84B31",
          sand: "#FDFBF7",
          ink: "#1E293B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
