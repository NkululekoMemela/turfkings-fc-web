module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "script",
  },
  overrides: [{files:["*.mjs"],parserOptions:{sourceType:"module"}}],
  extends: [
    "eslint:recommended",
  ],
  rules: {
    "quotes": ["error", "double"],
    "semi": ["error", "always"],
    "max-len": "off",
    "comma-dangle": "off",
    "object-curly-spacing": "off",
    "quote-props": "off",
  },
};