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
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "max-len": "off",
    "comma-dangle": "off",
    "object-curly-spacing": "off",
    "quote-props": "off",
  },
};