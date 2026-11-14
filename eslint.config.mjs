import nextPlugin from "eslint-config-next";

const config = [...nextPlugin];
config.push({
  ignores: ["coverage/**", ".next/**", "node_modules/**"]
});

export default config;
