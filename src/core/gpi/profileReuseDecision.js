function clean(value) {
  return String(value || "").trim();
}

export function evaluateProfileReuse({
  destinationPhoto = "",
  destinationPhone = "",
  sourcePhoto = "",
  sourcePhone = "",
  sourceCandidate = null,
} = {}) {
  const hasCandidate = Boolean(sourceCandidate);

  const destinationHasPhoto = Boolean(clean(destinationPhoto));
  const destinationHasPhone = Boolean(clean(destinationPhone));

  const sourceHasPhoto = Boolean(clean(sourcePhoto));
  const sourceHasPhone = Boolean(clean(sourcePhone));

  const canImprovePhoto =
    hasCandidate &&
    !destinationHasPhoto &&
    sourceHasPhoto;

  const canImprovePhone =
    hasCandidate &&
    !destinationHasPhone &&
    sourceHasPhone;

  return {
    shouldOfferReuse:
      canImprovePhoto || canImprovePhone,
    canImprovePhoto,
    canImprovePhone,
    destinationHasPhoto,
    destinationHasPhone,
    sourceHasPhoto,
    sourceHasPhone,
  };
}
