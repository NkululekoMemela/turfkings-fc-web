// Compatibility entry point; both environments use the same pure policy.
async function build(options) {
  const policy = await import("./fieldStartingFormation.mjs");
  return policy.build(options);
}
module.exports = {build};
