import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import {
  PAYMENT_COLLECTION_METHODS,
  PAYMENT_PROVIDERS,
  resolveClubPaymentSettings,
} from "./paymentProviders.js";

export const DEFAULT_PROVIDER_PRIORITY = [
  PAYMENT_PROVIDERS.PEACH,
  PAYMENT_PROVIDERS.STRIPE,
  PAYMENT_PROVIDERS.PAYSTACK,
];

export function getClubRootRef(clubId) {
  const safeClubId = String(clubId || "").trim();

  if (!safeClubId) {
    throw new Error("Missing clubId for payment settings.");
  }

  return doc(db, "clubs", safeClubId);
}

export async function getClubPaymentSettings(clubId) {
  const clubRef = getClubRootRef(clubId);
  const snap = await getDoc(clubRef);
  const club = snap.exists() ? snap.data() || {} : {};

  return resolveClubPaymentSettings(club);
}

export async function saveClubPaymentSettings(clubId, paymentSettingsPatch = {}) {
  const clubRef = getClubRootRef(clubId);
  const current = await getClubPaymentSettings(clubId);

  const nextPaymentSettings = resolveClubPaymentSettings({
    paymentSettings: {
      ...current,
      ...paymentSettingsPatch,
      commissionModel: {
        ...(current.commissionModel || {}),
        ...(paymentSettingsPatch.commissionModel || {}),
      },
      allowedActions: {
        ...(current.allowedActions || {}),
        ...(paymentSettingsPatch.allowedActions || {}),
      },
    },
  });

  await setDoc(
    clubRef,
    {
      paymentSettings: nextPaymentSettings,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return nextPaymentSettings;
}

export function choosePaymentProvider({
  paymentSettings,
  payerCountry = "",
  preferredProvider = "",
} = {}) {
  const settings = resolveClubPaymentSettings({
    paymentSettings: paymentSettings || {},
  });

  const explicitProvider = String(preferredProvider || "").trim().toLowerCase();

  if (explicitProvider) {
    return explicitProvider;
  }

  const availableProviders =
    settings.availableProviders && Array.isArray(settings.availableProviders)
      ? settings.availableProviders
      : DEFAULT_PROVIDER_PRIORITY;

  const safeCountry = String(payerCountry || "").trim().toUpperCase();

  if (safeCountry && safeCountry !== "ZA" && availableProviders.includes(PAYMENT_PROVIDERS.STRIPE)) {
    return PAYMENT_PROVIDERS.STRIPE;
  }

  if (availableProviders.includes(settings.preferredProvider)) {
    return settings.preferredProvider;
  }

  return availableProviders[0] || PAYMENT_PROVIDERS.PEACH;
}

export function buildExternalCollectionSettings() {
  return {
    collectionMethod: PAYMENT_COLLECTION_METHODS.EXTERNAL,
    provider: null,
    preferredProvider: PAYMENT_PROVIDERS.PEACH,
    availableProviders: DEFAULT_PROVIDER_PRIORITY,
    allowedActions: {
      canCollectExternal: true,
      canCollectOnline: false,
      canReceivePayouts: false,
      canUseFreeTrial: true,
    },
  };
}

export function buildPlatformCollectionSettings(provider = PAYMENT_PROVIDERS.PEACH) {
  return {
    collectionMethod: PAYMENT_COLLECTION_METHODS.PLATFORM,
    provider,
    preferredProvider: provider,
    availableProviders: DEFAULT_PROVIDER_PRIORITY,
    allowedActions: {
      canCollectExternal: false,
      canCollectOnline: true,
      canReceivePayouts: true,
      canUseFreeTrial: false,
    },
  };
}
