export const PAYMENT_COLLECTION_METHODS = {
  EXTERNAL: "external",
  PLATFORM: "platform",
  NONE: "none",
};

export const PAYMENT_PROVIDERS = {
  PEACH: "peach",
  STRIPE: "stripe",
  PAYSTACK: "paystack",
  OZOW: "ozow",
  PAYFAST: "payfast",
};

export const PRIMARY_PAYMENT_PROVIDERS = [
  PAYMENT_PROVIDERS.PEACH,
  PAYMENT_PROVIDERS.STRIPE,
  PAYMENT_PROVIDERS.PAYSTACK,
];

export const SECONDARY_PAYMENT_PROVIDERS = [
  PAYMENT_PROVIDERS.OZOW,
  PAYMENT_PROVIDERS.PAYFAST,
];

export const PAYMENT_ONBOARDING_STATUSES = {
  NOT_STARTED: "not_started",
  PENDING: "pending",
  NEEDS_INFO: "needs_info",
  UNDER_REVIEW: "under_review",
  ACTIVE: "active",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
};

export const PAYOUT_STATUSES = {
  NOT_ENABLED: "not_enabled",
  PENDING: "pending",
  ACTIVE: "active",
  BLOCKED: "blocked",
};

export function getDefaultClubPaymentSettings() {
  return {
    collectionMethod: PAYMENT_COLLECTION_METHODS.EXTERNAL,
    provider: null,
    preferredProvider: PAYMENT_PROVIDERS.PEACH,
    availableProviders: [
      PAYMENT_PROVIDERS.PEACH,
      PAYMENT_PROVIDERS.STRIPE,
      PAYMENT_PROVIDERS.PAYSTACK,
    ],
    onboardingStatus: PAYMENT_ONBOARDING_STATUSES.NOT_STARTED,
    payoutStatus: PAYOUT_STATUSES.NOT_ENABLED,
    pricingModel: {
      type: "fixed_service_fee",
      serviceFeePerPlayer: 7.5,
    },
    allowedActions: {
      canCollectExternal: true,
      canCollectOnline: false,
      canReceivePayouts: false,
      canUseFreeTrial: true,
    },
  };
}

export function resolveClubPaymentSettings(club = {}) {
  const existing = club.paymentSettings || {};

  return {
    ...getDefaultClubPaymentSettings(),
    ...existing,
    pricingModel: {
      ...getDefaultClubPaymentSettings().pricingModel,
      ...(existing.pricingModel || existing.commissionModel || {}),
    },
    allowedActions: {
      ...getDefaultClubPaymentSettings().allowedActions,
      ...(existing.allowedActions || {}),
    },
  };
}

export function canUsePlatformPayments(paymentSettings) {
  return Boolean(
    paymentSettings &&
      paymentSettings.collectionMethod === PAYMENT_COLLECTION_METHODS.PLATFORM &&
      paymentSettings.provider &&
      paymentSettings.onboardingStatus === PAYMENT_ONBOARDING_STATUSES.ACTIVE &&
      paymentSettings.allowedActions?.canCollectOnline
  );
}

export function canUseExternalPayments(paymentSettings) {
  return Boolean(
    paymentSettings &&
      paymentSettings.collectionMethod === PAYMENT_COLLECTION_METHODS.EXTERNAL &&
      paymentSettings.allowedActions?.canCollectExternal
  );
}
